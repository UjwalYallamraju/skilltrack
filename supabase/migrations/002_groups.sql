-- =====================================================================
-- SkillTrack – Groups (run once in Supabase → SQL Editor, after schema.sql)
-- * Admin creates groups and adds trainers (a trainer can be in several groups)
-- * Each group can have one or more leads
-- * Trainers see only people who share a group with them; admins see everyone
-- * Leads can set the daily LeetCode target of people in their groups
-- =====================================================================

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  is_lead    boolean not null default false,
  added_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- ---------- Visibility helpers (security definer: no RLS recursion) ----
-- Do I share at least one group with this person?
create or replace function public.shares_group(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- Am I a lead of a group this person belongs to?
create or replace function public.leads_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members l
    join public.group_members m on m.group_id = l.group_id
    where l.user_id = auth.uid() and l.is_lead and m.user_id = p_user
  );
$$;

-- Am I a member (or lead) of this group?
create or replace function public.in_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid());
$$;

-- Can I see this person's data?
create or replace function public.can_see(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or public.is_admin() or public.shares_group(p_user);
$$;

-- ---------- Profile edits: leads may change ONLY the daily target -------
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;                                  -- admin / server: anything
  end if;
  if new.id = auth.uid() then                    -- myself: not role/target/email
    new.role := old.role;
    new.daily_target := old.daily_target;
    new.email := old.email;
  else                                           -- a lead editing a member: target only
    new.full_name := old.full_name;
    new.email := old.email;
    new.role := old.role;
    new.leetcode_username := old.leetcode_username;
  end if;
  return new;
end;
$$;

-- ---------- Row Level Security ------------------------------------------
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

drop policy if exists groups_read  on public.groups;
drop policy if exists groups_admin on public.groups;
create policy groups_read  on public.groups for select to authenticated
  using (public.is_admin() or public.in_group(id));
create policy groups_admin on public.groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists gm_read  on public.group_members;
drop policy if exists gm_admin on public.group_members;
create policy gm_read  on public.group_members for select to authenticated
  using (public.is_admin() or public.in_group(group_id));
create policy gm_admin on public.group_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Reads are now limited to people who share a group with me
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.can_see(id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin() or public.leads_user(id))
  with check (id = auth.uid() or public.is_admin() or public.leads_user(id));

drop policy if exists goals_read on public.goals;
create policy goals_read on public.goals for select to authenticated using (public.can_see(user_id));

drop policy if exists updates_read on public.goal_updates;
create policy updates_read on public.goal_updates for select to authenticated using (public.can_see(user_id));

drop policy if exists solves_read on public.leetcode_solves;
create policy solves_read on public.leetcode_solves for select to authenticated using (public.can_see(user_id));

drop policy if exists stats_read on public.leetcode_stats;
create policy stats_read on public.leetcode_stats for select to authenticated using (public.can_see(user_id));
