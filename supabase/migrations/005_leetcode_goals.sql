-- =====================================================================
-- SkillTrack – LeetCode target goals (run once after 004_lead_tools.sql)
-- * A goal can be a LeetCode target: "solve N problems between two dates",
--   optionally Medium+ or Hard only. Progress is counted automatically from
--   leetcode_solves (distinct problems in the date range) and the goal
--   completes by itself when the target is reached: no proof, no approval.
-- * Leads/admins can assign goals (any type) to people they look after, one
--   goal per person, grouped by challenge_id so the team view shows a leaderboard.
-- * Trainers can't change the definition of a goal their lead assigned, or delete it.
-- =====================================================================

begin;

alter table public.goals add column if not exists goal_type text not null default 'skill'
  check (goal_type in ('skill', 'leetcode'));
alter table public.goals add column if not exists lc_target     int check (lc_target is null or lc_target between 1 and 5000);
alter table public.goals add column if not exists lc_difficulty text not null default 'any'
  check (lc_difficulty in ('any', 'medium', 'hard'));
alter table public.goals add column if not exists assigned_by   text references public.profiles (id) on delete set null on update cascade;
alter table public.goals add column if not exists challenge_id  uuid;
alter table public.goals alter column skill_area_id drop not null;
alter table public.goals drop constraint if exists goals_leetcode_target;
alter table public.goals add constraint goals_leetcode_target check (goal_type = 'skill' or lc_target is not null);
alter table public.goals drop constraint if exists goals_skill_area;
alter table public.goals add constraint goals_skill_area check (goal_type = 'leetcode' or skill_area_id is not null);
create index if not exists goals_challenge_idx on public.goals (challenge_id);

-- Distinct problems a person solved in a date range (optionally Medium+ / Hard only)
create or replace function public.lc_solved_between(p_user text, p_from date, p_to date, p_diff text)
returns int language sql stable set search_path = public as $$
  select count(distinct problem_slug)::int from public.leetcode_solves
   where user_id = p_user and solved_on between p_from and p_to
     and (p_diff = 'any' or (p_diff = 'medium' and difficulty in ('Medium', 'Hard')) or (p_diff = 'hard' and difficulty = 'Hard'));
$$;
-- Day the Nth distinct problem was solved (when a LeetCode goal was reached)
create or replace function public.lc_reached_on(p_user text, p_from date, p_to date, p_diff text, p_n int)
returns date language sql stable set search_path = public as $$
  select d from (
    select min(solved_on) as d from public.leetcode_solves
     where user_id = p_user and solved_on between p_from and p_to
       and (p_diff = 'any' or (p_diff = 'medium' and difficulty in ('Medium', 'Hard')) or (p_diff = 'hard' and difficulty = 'Hard'))
     group by problem_slug) x
  order by d offset greatest(p_n, 1) - 1 limit 1;
$$;

-- Server-controlled fields
create or replace function public.touch_goal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  via_rpc boolean := coalesce(current_setting('skilltrack.review', true), '') = 'on';
  me text := public.current_uid();
begin
  new.updated_at := now();
  if not via_rpc then
    if tg_op = 'INSERT' then
      new.completed := false; new.completed_at := null; new.review_status := 'none';
      new.submitted_at := null; new.reviewed_by := null; new.reviewed_at := null; new.review_comment := '';
      new.assigned_by := case when new.user_id <> me then me else null end;
    else
      new.completed := old.completed; new.completed_at := old.completed_at; new.review_status := old.review_status;
      new.submitted_at := old.submitted_at; new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
      new.review_comment := old.review_comment; new.evidence_url := old.evidence_url; new.evidence_note := old.evidence_note;
      new.assigned_by := old.assigned_by; new.challenge_id := old.challenge_id; new.user_id := old.user_id;
      -- a goal the lead assigned: the trainer may only flag it at risk / log progress
      if old.assigned_by is not null and not public.can_review(old.user_id) then
        new.title := old.title; new.description := old.description; new.skill := old.skill; new.skill_area_id := old.skill_area_id;
        new.start_date := old.start_date; new.target_date := old.target_date; new.goal_type := old.goal_type;
        new.lc_target := old.lc_target; new.lc_difficulty := old.lc_difficulty;
      end if;
    end if;
  end if;
  if new.goal_type = 'leetcode' then new.skill := 'LeetCode'; end if;
  return new;
end;
$$;

-- LeetCode goals complete on their own
create or replace function public.submit_goal(p_goal uuid, p_evidence_url text, p_note text default '')
returns public.goals language plpgsql security definer set search_path = public as $$
declare g public.goals;
begin
  select * into g from public.goals where id = p_goal;
  if not found or g.user_id <> public.current_uid() then raise exception 'You can only submit your own goals'; end if;
  if g.goal_type = 'leetcode' then raise exception 'LeetCode goals complete automatically when you reach the target'; end if;
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

-- Assigned goals: only the lead/admin deletes them
drop policy if exists goals_delete on public.goals;
create policy goals_delete on public.goals for delete to authenticated
  using ((user_id = public.current_uid() and assigned_by is null) or public.can_review(user_id));

-- ---------- View with live LeetCode progress ----------
drop view if exists public.goals_with_status;
create view public.goals_with_status with (security_invoker = true) as
with base as (
  select g.*,
         case when g.goal_type = 'leetcode'
              then public.lc_solved_between(g.user_id, g.start_date, g.target_date, g.lc_difficulty) end as lc_solved
  from public.goals g
), calc as (
  select b.*,
         (b.goal_type = 'leetcode' and b.lc_solved >= b.lc_target) as lc_done,
         -- problems you'd expect by today at an even pace
         case when b.goal_type = 'leetcode' then
           ceil(b.lc_target * greatest(0, least(public.local_today(), b.target_date) - b.start_date + 1)::numeric
                / (b.target_date - b.start_date + 1))::int end as lc_expected
  from base b
)
select c.id, c.user_id, c.skill_area_id, c.skill, c.title, c.description, c.start_date, c.target_date,
       case when c.goal_type = 'leetcode' then least(100, floor(100.0 * c.lc_solved / c.lc_target))::int else c.progress end as progress,
       (c.completed or c.lc_done) as completed,
       case when c.lc_done and c.completed_at is null
            then ((public.lc_reached_on(c.user_id, c.start_date, c.target_date, c.lc_difficulty, c.lc_target) + time '18:00') at time zone 'Asia/Kolkata')
            else c.completed_at end as completed_at,
       c.manual_at_risk, c.created_at, c.updated_at,
       c.review_status, c.evidence_url, c.evidence_note, c.submitted_at, c.reviewed_by, c.reviewed_at, c.review_comment,
       c.goal_type, c.lc_target, c.lc_difficulty, c.lc_solved, c.lc_expected, c.assigned_by, c.challenge_id,
       coalesce(sa.name, 'LeetCode') as skill_area,
       p.full_name as owner_name,
       case
         when c.completed or c.lc_done then 'completed'
         when c.review_status = 'submitted' then 'in_review'
         when c.target_date < public.local_today() then 'overdue'
         when c.manual_at_risk or c.review_status = 'changes_requested' then 'at_risk'
         when c.goal_type = 'leetcode' and c.start_date > public.local_today() then 'not_started'
         when c.goal_type = 'leetcode' and public.local_today() - c.start_date >= 3 and c.lc_solved < c.lc_expected * 0.75 then 'at_risk'
         when c.goal_type = 'skill' and c.target_date - public.local_today() <= s.at_risk_days
              and c.progress < s.at_risk_progress then 'at_risk'
         when c.goal_type = 'skill' and c.progress = 0 then 'not_started'
         else 'on_track'
       end as status,
       (c.manual_at_risk and not (c.completed or c.lc_done)) as flagged_by_trainer
from calc c
left join public.skill_areas sa on sa.id = c.skill_area_id
join public.profiles p on p.id = c.user_id
cross join public.app_settings s;

grant select on public.goals_with_status to authenticated;
grant execute on function public.lc_solved_between(text, date, date, text), public.lc_reached_on(text, date, date, text, int) to authenticated;

commit;
