-- =====================================================================
-- SkillTrack – switch sign-in to Clerk (Supabase third-party auth)
-- * User IDs become Clerk IDs (text, e.g. 'user_2abc...') instead of uuid
-- * Identity comes from the Clerk session token: sub = user id, email claim = email
-- * ensure_profile() creates the profile on first sign-in, enforces the company
--   email domain, and re-links an existing (pre-Clerk) profile with the same email
-- Run once in Supabase → SQL Editor, after schema.sql and 002_groups.sql.
-- =====================================================================

begin;

-- ---------- 1. Drop everything that depends on the uuid columns ----------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop view if exists public.goals_with_status;
drop view if exists public.leetcode_summary;

drop trigger if exists check_email_domain on auth.users;
drop trigger if exists create_profile on auth.users;
drop function if exists public.check_email_domain();
drop function if exists public.create_profile();

drop function if exists public.leetcode_streak(uuid);
drop function if exists public.can_see(uuid);
drop function if exists public.shares_group(uuid);
drop function if exists public.leads_user(uuid);

-- every foreign key that points at profiles, plus profiles -> auth.users
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and (c.confrelid = 'public.profiles'::regclass
           or (c.conrelid = 'public.profiles'::regclass and c.confrelid = 'auth.users'::regclass))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- ---------- 2. uuid -> text ----------
alter table public.profiles        alter column id      type text using id::text;
alter table public.goals           alter column user_id type text using user_id::text;
alter table public.goal_updates    alter column user_id type text using user_id::text;
alter table public.leetcode_solves alter column user_id type text using user_id::text;
alter table public.leetcode_stats  alter column user_id type text using user_id::text;
alter table public.group_members   alter column user_id type text using user_id::text;

-- re-link with ON UPDATE CASCADE so a profile's id can move to its Clerk id
alter table public.goals           add constraint goals_user_id_fkey           foreign key (user_id) references public.profiles (id) on delete cascade on update cascade;
alter table public.goal_updates    add constraint goal_updates_user_id_fkey    foreign key (user_id) references public.profiles (id) on delete cascade on update cascade;
alter table public.leetcode_solves add constraint leetcode_solves_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade on update cascade;
alter table public.leetcode_stats  add constraint leetcode_stats_user_id_fkey  foreign key (user_id) references public.profiles (id) on delete cascade on update cascade;
alter table public.group_members   add constraint group_members_user_id_fkey   foreign key (user_id) references public.profiles (id) on delete cascade on update cascade;

-- ---------- 3. Identity helpers ----------
create or replace function public.current_uid()
returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = public.current_uid() and role = 'admin');
$$;

create or replace function public.shares_group(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = public.current_uid() and b.user_id = p_user
  );
$$;

create or replace function public.leads_user(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members l
    join public.group_members m on m.group_id = l.group_id
    where l.user_id = public.current_uid() and l.is_lead and m.user_id = p_user
  );
$$;

create or replace function public.in_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = public.current_uid());
$$;

create or replace function public.can_see(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = public.current_uid() or public.is_admin() or public.shares_group(p_user);
$$;

-- First call after every sign-in: returns my profile, creating or re-linking it.
create or replace function public.ensure_profile(p_full_name text default '')
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  uid    text := public.current_uid();
  mail   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  domain text;
  p      public.profiles;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into p from public.profiles where id = uid;
  if found then
    return p;
  end if;

  select allowed_email_domain into domain from public.app_settings where id = 1;
  if mail = '' then
    raise exception 'Your session has no email address. Ask the admin to add the email claim to the Clerk session token.';
  end if;
  if split_part(mail, '@', 2) <> lower(domain) then
    raise exception 'Only @% email addresses can use SkillTrack', domain;
  end if;

  -- existing profile from before Clerk (same email): move it to the Clerk id
  perform set_config('skilltrack.relink', 'on', true);
  update public.profiles set id = uid where email = mail returning * into p;
  if found then
    return p;
  end if;

  insert into public.profiles (id, email, full_name)
  values (uid, mail, coalesce(nullif(trim(p_full_name), ''), split_part(mail, '@', 1)))
  returning * into p;
  return p;
end;
$$;
grant execute on function public.ensure_profile(text) to authenticated;

create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_uid() is null or public.is_admin() then
    return new;                                  -- admin / server: anything
  end if;
  if new.id = public.current_uid() then          -- myself: not role/target/email
    new.role := old.role;
    new.daily_target := old.daily_target;
    new.email := old.email;
  else                                           -- a lead editing a member: target only
    new.full_name := old.full_name;
    new.email := old.email;
    new.role := old.role;
    new.leetcode_username := old.leetcode_username;
  end if;
  if coalesce(current_setting('skilltrack.relink', true), '') <> 'on' then
    new.id := old.id;                            -- ids only change via ensure_profile()
  end if;
  return new;
end;
$$;

create or replace function public.leetcode_streak(p_user text)
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
    if extract(isodow from d) < 6 then
      select count(*) into solved from public.leetcode_solves
        where user_id = p_user and solved_on = d;
      if solved >= target then
        streak := streak + 1;
      elsif not first then
        exit;
      end if;
      first := false;
    end if;
    d := d - 1;
    exit when streak > 3650;
  end loop;
  return streak;
end;
$$;

-- ---------- 4. Views ----------
create view public.goals_with_status with (security_invoker = true) as
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

create view public.leetcode_summary with (security_invoker = true) as
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

grant select on public.goals_with_status, public.leetcode_summary to authenticated;

-- ---------- 5. Row Level Security (same rules as before, Clerk ids) ----------
create policy settings_read  on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for update to authenticated using (public.is_admin());

create policy profiles_read   on public.profiles for select to authenticated using (public.can_see(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = public.current_uid() or public.is_admin() or public.leads_user(id))
  with check (id = public.current_uid() or public.is_admin() or public.leads_user(id));

create policy areas_read  on public.skill_areas for select to authenticated using (true);
create policy areas_admin on public.skill_areas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy goals_read  on public.goals for select to authenticated using (public.can_see(user_id));
create policy goals_write on public.goals for all to authenticated
  using (user_id = public.current_uid() or public.is_admin())
  with check (user_id = public.current_uid() or public.is_admin());

create policy updates_read  on public.goal_updates for select to authenticated using (public.can_see(user_id));
create policy updates_write on public.goal_updates for all to authenticated
  using (user_id = public.current_uid() or public.is_admin())
  with check ((user_id = public.current_uid()
               and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = public.current_uid()))
              or public.is_admin());

create policy solves_read  on public.leetcode_solves for select to authenticated using (public.can_see(user_id));
create policy solves_write on public.leetcode_solves for all to authenticated
  using (user_id = public.current_uid() or public.is_admin())
  with check (user_id = public.current_uid() or public.is_admin());

create policy stats_read on public.leetcode_stats for select to authenticated using (public.can_see(user_id));

create policy groups_read  on public.groups for select to authenticated
  using (public.is_admin() or public.in_group(id));
create policy groups_admin on public.groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy gm_read  on public.group_members for select to authenticated
  using (public.is_admin() or public.in_group(group_id));
create policy gm_admin on public.group_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

commit;
