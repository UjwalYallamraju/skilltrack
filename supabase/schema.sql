-- =====================================================================
-- SkillTrack – database setup (run once in Supabase → SQL Editor)
-- Team upskilling goals + daily LeetCode tracking
-- =====================================================================

-- ---------- Settings -------------------------------------------------
create table if not exists public.app_settings (
  id                   int primary key default 1 check (id = 1),
  allowed_email_domain text not null default 'codetantra.in',
  timezone             text not null default 'Asia/Kolkata',
  at_risk_days         int  not null default 21,   -- auto at-risk window
  at_risk_progress     int  not null default 50    -- ... and progress below this %
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------- People ---------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null unique,
  full_name         text not null default '',
  role              text not null default 'trainer' check (role in ('trainer', 'admin')),
  leetcode_username text,
  daily_target      int  not null default 1 check (daily_target between 0 and 20),
  created_at        timestamptz not null default now()
);

-- ---------- Skill areas ----------------------------------------------
create table if not exists public.skill_areas (
  id         serial primary key,
  name       text not null unique,
  sort_order int  not null default 0
);
insert into public.skill_areas (name, sort_order) values
  ('Programming Languages', 1),
  ('Full Stack', 2),
  ('GenAI', 3),
  ('Agentic AI', 4),
  ('Emerging Tech', 5)
on conflict (name) do nothing;

-- ---------- Goals ----------------------------------------------------
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  skill_area_id  int  not null references public.skill_areas (id),
  skill          text not null,
  title          text not null,
  description    text not null default '',
  start_date     date not null default current_date,
  target_date    date not null,
  progress       int  not null default 0 check (progress between 0 and 100),
  completed      boolean not null default false,
  completed_at   timestamptz,
  manual_at_risk boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (target_date >= start_date)
);
create index if not exists goals_user_idx on public.goals (user_id);

create table if not exists public.goal_updates (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.goals (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  note       text not null,
  progress   int check (progress between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists goal_updates_goal_idx on public.goal_updates (goal_id, created_at desc);

-- ---------- LeetCode -------------------------------------------------
create table if not exists public.leetcode_solves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  problem_slug text not null,
  title        text not null,
  difficulty   text check (difficulty in ('Easy', 'Medium', 'Hard')),
  solved_on    date not null,              -- local (IST) date
  source       text not null default 'sync' check (source in ('sync', 'manual')),
  created_at   timestamptz not null default now(),
  unique (user_id, problem_slug, solved_on)
);
create index if not exists leetcode_solves_user_day_idx on public.leetcode_solves (user_id, solved_on desc);

create table if not exists public.leetcode_stats (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  easy      int not null default 0,
  medium    int not null default 0,
  hard      int not null default 0,
  synced_at timestamptz not null default now()
);

-- =====================================================================
-- Helper functions
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.local_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone (select timezone from public.app_settings where id = 1))::date;
$$;

-- New sign-ups: allow only the company domain (BEFORE), then create a profile (AFTER)
create or replace function public.check_email_domain()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  domain text;
begin
  select allowed_email_domain into domain from public.app_settings where id = 1;
  if lower(split_part(new.email, '@', 2)) <> lower(domain) then
    raise exception 'Only @% email addresses can sign up', domain;
  end if;
  return new;
end;
$$;
create or replace function public.create_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists check_email_domain on auth.users;
create trigger check_email_domain before insert on auth.users
  for each row execute function public.check_email_domain();
drop trigger if exists create_profile on auth.users;
create trigger create_profile after insert on auth.users
  for each row execute function public.create_profile();

-- Trainers may not change their own role or daily target (only admins can)
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.daily_target := old.daily_target;
    new.email := old.email;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Keep updated_at / completed_at in sync
create or replace function public.touch_goal()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.progress = 100 then new.completed := true; end if;
  if new.completed and new.completed_at is null then new.completed_at := now(); end if;
  if not new.completed then new.completed_at := null; end if;
  return new;
end;
$$;
drop trigger if exists touch_goal on public.goals;
create trigger touch_goal before insert or update on public.goals
  for each row execute function public.touch_goal();

-- Logging a progress update also moves the goal's progress
create or replace function public.apply_goal_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.progress is not null then
    update public.goals set progress = new.progress where id = new.goal_id;
  end if;
  return new;
end;
$$;
drop trigger if exists apply_goal_update on public.goal_updates;
create trigger apply_goal_update after insert on public.goal_updates
  for each row execute function public.apply_goal_update();

-- Weekday-only streak: consecutive Mon–Fri days meeting the trainer's target.
-- Today counts if already met; if not met yet, the streak isn't broken until the day ends.
create or replace function public.leetcode_streak(p_user uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  d       date := public.local_today();
  target  int;
  solved  int;
  streak  int := 0;
  first   boolean := true;
begin
  select daily_target into target from public.profiles where id = p_user;
  if target is null or target = 0 then return 0; end if;
  loop
    if extract(isodow from d) < 6 then          -- Mon..Fri
      select count(*) into solved from public.leetcode_solves
        where user_id = p_user and solved_on = d;
      if solved >= target then
        streak := streak + 1;
      elsif not first then
        exit;                                   -- a missed past weekday ends it
      end if;
      first := false;
    end if;
    d := d - 1;
    exit when streak > 3650;
  end loop;
  return streak;
end;
$$;

-- =====================================================================
-- Views the app reads
-- =====================================================================
create or replace view public.goals_with_status with (security_invoker = true) as
select g.*,
       sa.name as skill_area,
       p.full_name as owner_name,
       case
         when g.completed then 'completed'
         when g.target_date < public.local_today() then 'overdue'
         when g.manual_at_risk then 'at_risk'
         when g.target_date - public.local_today() <= s.at_risk_days
              and g.progress < s.at_risk_progress then 'at_risk'
         when g.progress = 0 then 'not_started'
         else 'on_track'
       end as status,
       (g.manual_at_risk and not g.completed) as flagged_by_trainer
from public.goals g
join public.skill_areas sa on sa.id = g.skill_area_id
join public.profiles p on p.id = g.user_id
cross join public.app_settings s;

create or replace view public.leetcode_summary with (security_invoker = true) as
select p.id as user_id,
       p.full_name,
       p.leetcode_username,
       p.daily_target,
       (select count(*) from public.leetcode_solves s
          where s.user_id = p.id and s.solved_on = public.local_today())::int as today,
       (select count(*) from public.leetcode_solves s
          where s.user_id = p.id
            and s.solved_on > public.local_today() - 7)::int as last_7_days,
       public.leetcode_streak(p.id) as streak,
       coalesce(st.easy, 0) as easy,
       coalesce(st.medium, 0) as medium,
       coalesce(st.hard, 0) as hard,
       coalesce(st.easy + st.medium + st.hard, 0) as total,
       st.synced_at
from public.profiles p
left join public.leetcode_stats st on st.user_id = p.id;

-- =====================================================================
-- Row Level Security: everyone signed in can READ the team's data;
-- trainers can only WRITE their own; admins can write everything.
-- =====================================================================
alter table public.app_settings    enable row level security;
alter table public.profiles        enable row level security;
alter table public.skill_areas     enable row level security;
alter table public.goals           enable row level security;
alter table public.goal_updates    enable row level security;
alter table public.leetcode_solves enable row level security;
alter table public.leetcode_stats  enable row level security;

drop policy if exists settings_read  on public.app_settings;
drop policy if exists settings_admin on public.app_settings;
create policy settings_read  on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for update to authenticated using (public.is_admin());

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists areas_read  on public.skill_areas;
drop policy if exists areas_admin on public.skill_areas;
create policy areas_read  on public.skill_areas for select to authenticated using (true);
create policy areas_admin on public.skill_areas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists goals_read  on public.goals;
drop policy if exists goals_write on public.goals;
create policy goals_read  on public.goals for select to authenticated using (true);
create policy goals_write on public.goals for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists updates_read  on public.goal_updates;
drop policy if exists updates_write on public.goal_updates;
create policy updates_read  on public.goal_updates for select to authenticated using (true);
create policy updates_write on public.goal_updates for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check ((user_id = auth.uid()
               and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
              or public.is_admin());

drop policy if exists solves_read  on public.leetcode_solves;
drop policy if exists solves_write on public.leetcode_solves;
create policy solves_read  on public.leetcode_solves for select to authenticated using (true);
create policy solves_write on public.leetcode_solves for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists stats_read on public.leetcode_stats;
create policy stats_read on public.leetcode_stats for select to authenticated using (true);
-- leetcode_stats is written only by the daily sync job (service role bypasses RLS)

grant select on public.goals_with_status, public.leetcode_summary to authenticated;
