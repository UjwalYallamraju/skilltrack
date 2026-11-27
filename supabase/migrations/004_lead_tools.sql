-- =====================================================================
-- SkillTrack – lead tools (run once in Supabase → SQL Editor, after 003_clerk.sql)
-- * Goal approval: trainers submit a finished goal with proof; an admin or one of
--   the trainer's group leads approves it (or asks for changes). Only approval
--   marks a goal completed.
-- * Comments on goals (trainer <-> lead feedback)
-- * 1:1 notes per trainer (private to leads, or shared with the trainer)
-- * Action items: follow-ups a lead assigns to a trainer, with due dates
-- =====================================================================

begin;

-- ---------- Goal review fields ----------
alter table public.goals add column if not exists review_status text not null default 'none'
  check (review_status in ('none', 'submitted', 'approved', 'changes_requested'));
alter table public.goals add column if not exists evidence_url   text;
alter table public.goals add column if not exists evidence_note  text not null default '';
alter table public.goals add column if not exists submitted_at   timestamptz;
alter table public.goals add column if not exists reviewed_by    text references public.profiles (id) on delete set null on update cascade;
alter table public.goals add column if not exists reviewed_at    timestamptz;
alter table public.goals add column if not exists review_comment text not null default '';

-- goals that were already completed count as approved
update public.goals set review_status = 'approved' where completed and review_status = 'none';

-- Can I review this person's goals? (admin, or a lead of one of their groups — never your own unless admin)
create or replace function public.can_review(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (p_user <> public.current_uid() and public.leads_user(p_user));
$$;

-- Completion and review fields change only through the RPCs below
create or replace function public.touch_goal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  via_rpc boolean := coalesce(current_setting('skilltrack.review', true), '') = 'on';
begin
  new.updated_at := now();
  if not via_rpc then
    if tg_op = 'INSERT' then
      new.completed := false; new.completed_at := null; new.review_status := 'none';
      new.submitted_at := null; new.reviewed_by := null; new.reviewed_at := null; new.review_comment := '';
    else
      new.completed := old.completed; new.completed_at := old.completed_at; new.review_status := old.review_status;
      new.submitted_at := old.submitted_at; new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
      new.review_comment := old.review_comment; new.evidence_url := old.evidence_url; new.evidence_note := old.evidence_note;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.submit_goal(p_goal uuid, p_evidence_url text, p_note text default '')
returns public.goals language plpgsql security definer set search_path = public as $$
declare g public.goals;
begin
  select * into g from public.goals where id = p_goal;
  if not found or g.user_id <> public.current_uid() then raise exception 'You can only submit your own goals'; end if;
  if g.completed then raise exception 'This goal is already approved'; end if;
  if coalesce(trim(p_evidence_url), '') = '' and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a link or a short note as proof';
  end if;
  perform set_config('skilltrack.review', 'on', true);
  update public.goals set progress = 100, review_status = 'submitted', submitted_at = now(),
         evidence_url = nullif(trim(p_evidence_url), ''), evidence_note = coalesce(trim(p_note), ''),
         review_comment = '', reviewed_by = null, reviewed_at = null
   where id = p_goal returning * into g;
  return g;
end;
$$;

create or replace function public.review_goal(p_goal uuid, p_approve boolean, p_comment text default '')
returns public.goals language plpgsql security definer set search_path = public as $$
declare g public.goals;
begin
  select * into g from public.goals where id = p_goal;
  if not found then raise exception 'Goal not found'; end if;
  if not public.can_review(g.user_id) then raise exception 'Only an admin or this trainer''s group lead can review this goal'; end if;
  if not p_approve and coalesce(trim(p_comment), '') = '' then raise exception 'Say what needs to change'; end if;
  perform set_config('skilltrack.review', 'on', true);
  update public.goals set
         review_status = case when p_approve then 'approved' else 'changes_requested' end,
         completed = p_approve,
         completed_at = case when p_approve then now() else null end,
         progress = case when p_approve then 100 else least(progress, 90) end,
         reviewed_by = public.current_uid(), reviewed_at = now(), review_comment = coalesce(trim(p_comment), '')
   where id = p_goal returning * into g;
  if coalesce(trim(p_comment), '') <> '' then
    insert into public.goal_comments (goal_id, author_id, body)
    values (p_goal, public.current_uid(), (case when p_approve then 'Approved: ' else 'Changes requested: ' end) || trim(p_comment));
  end if;
  return g;
end;
$$;

create or replace function public.reopen_goal(p_goal uuid)
returns public.goals language plpgsql security definer set search_path = public as $$
declare g public.goals;
begin
  select * into g from public.goals where id = p_goal;
  if not found or not (g.user_id = public.current_uid() or public.can_review(g.user_id)) then
    raise exception 'You can''t reopen this goal';
  end if;
  perform set_config('skilltrack.review', 'on', true);
  update public.goals set completed = false, completed_at = null, review_status = 'none',
         submitted_at = null, reviewed_by = null, reviewed_at = null, progress = least(progress, 90)
   where id = p_goal returning * into g;
  return g;
end;
$$;

-- ---------- Comments on goals ----------
create table if not exists public.goal_comments (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.goals (id) on delete cascade,
  author_id  text not null references public.profiles (id) on delete cascade on update cascade,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists goal_comments_goal_idx on public.goal_comments (goal_id, created_at);

-- ---------- 1:1 notes ----------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   text not null references public.profiles (id) on delete cascade on update cascade,
  author_id    text not null references public.profiles (id) on delete cascade on update cascade,
  meeting_date date not null default public.local_today(),
  body         text not null check (length(trim(body)) > 0),
  shared       boolean not null default false,   -- false: leads/admin only; true: trainer can read it too
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notes_trainer_idx on public.notes (trainer_id, meeting_date desc);

-- ---------- Action items ----------
create table if not exists public.action_items (
  id         uuid primary key default gen_random_uuid(),
  trainer_id text not null references public.profiles (id) on delete cascade on update cascade,
  created_by text not null references public.profiles (id) on delete cascade on update cascade,
  title      text not null check (length(trim(title)) > 0),
  due_date   date,
  done       boolean not null default false,
  done_at    timestamptz,
  note_id    uuid references public.notes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists action_items_trainer_idx on public.action_items (trainer_id, done, due_date);

-- trainers may only tick their own items done/undone
create or replace function public.guard_action_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_uid() is not null and not public.can_review(old.trainer_id) then
    new.title := old.title; new.due_date := old.due_date; new.trainer_id := old.trainer_id;
    new.created_by := old.created_by; new.note_id := old.note_id;
  end if;
  new.done_at := case when new.done and not old.done then now() when not new.done then null else old.done_at end;
  return new;
end;
$$;
drop trigger if exists guard_action_item on public.action_items;
create trigger guard_action_item before update on public.action_items
  for each row execute function public.guard_action_item();

-- ---------- Status view: adds in_review / changes_requested ----------
drop view if exists public.goals_with_status;
create view public.goals_with_status with (security_invoker = true) as
select g.*,
       sa.name as skill_area,
       p.full_name as owner_name,
       case
         when g.completed then 'completed'
         when g.review_status = 'submitted' then 'in_review'
         when g.target_date < public.local_today() then 'overdue'
         when g.manual_at_risk or g.review_status = 'changes_requested' then 'at_risk'
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

-- ---------- Row Level Security ----------
alter table public.goal_comments enable row level security;
alter table public.notes         enable row level security;
alter table public.action_items  enable row level security;

drop policy if exists comments_read   on public.goal_comments;
drop policy if exists comments_insert on public.goal_comments;
drop policy if exists comments_delete on public.goal_comments;
create policy comments_read on public.goal_comments for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and public.can_see(g.user_id)));
create policy comments_insert on public.goal_comments for insert to authenticated
  with check (author_id = public.current_uid() and exists (
    select 1 from public.goals g where g.id = goal_id and (g.user_id = public.current_uid() or public.can_review(g.user_id))));
create policy comments_delete on public.goal_comments for delete to authenticated
  using (author_id = public.current_uid() or public.is_admin());

drop policy if exists notes_read   on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_change on public.notes;
drop policy if exists notes_delete on public.notes;
create policy notes_read on public.notes for select to authenticated
  using (author_id = public.current_uid() or public.can_review(trainer_id)
         or (shared and trainer_id = public.current_uid()));
create policy notes_insert on public.notes for insert to authenticated
  with check (author_id = public.current_uid() and public.can_review(trainer_id));
create policy notes_change on public.notes for update to authenticated
  using (author_id = public.current_uid() or public.is_admin())
  with check (author_id = public.current_uid() or public.is_admin());
create policy notes_delete on public.notes for delete to authenticated
  using (author_id = public.current_uid() or public.is_admin());

drop policy if exists actions_read   on public.action_items;
drop policy if exists actions_insert on public.action_items;
drop policy if exists actions_update on public.action_items;
drop policy if exists actions_delete on public.action_items;
create policy actions_read on public.action_items for select to authenticated
  using (trainer_id = public.current_uid() or public.can_review(trainer_id));
create policy actions_insert on public.action_items for insert to authenticated
  with check (created_by = public.current_uid() and public.can_review(trainer_id));
create policy actions_update on public.action_items for update to authenticated
  using (trainer_id = public.current_uid() or public.can_review(trainer_id))
  with check (trainer_id = public.current_uid() or public.can_review(trainer_id));
create policy actions_delete on public.action_items for delete to authenticated
  using (created_by = public.current_uid() or public.is_admin());

-- Leads can assign a goal to someone they review, and edit it; only the owner or an admin deletes
drop policy if exists goals_write  on public.goals;
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;
create policy goals_insert on public.goals for insert to authenticated
  with check (user_id = public.current_uid() or public.can_review(user_id));
create policy goals_update on public.goals for update to authenticated
  using (user_id = public.current_uid() or public.can_review(user_id))
  with check (user_id = public.current_uid() or public.can_review(user_id));
create policy goals_delete on public.goals for delete to authenticated
  using (user_id = public.current_uid() or public.is_admin());

grant select on public.goals_with_status to authenticated;
grant select, insert, update, delete on public.goal_comments, public.notes, public.action_items to authenticated;
grant execute on function public.submit_goal(uuid, text, text), public.review_goal(uuid, boolean, text),
  public.reopen_goal(uuid), public.can_review(text) to authenticated;

commit;
