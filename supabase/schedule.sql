-- SkillTrack: run the LeetCode sync every 2 hours (at :15). Run once in Supabase SQL Editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'leetcode-sync';
select cron.schedule(
  'leetcode-sync',
  '15 */2 * * *',
  $job$
  select net.http_post(
    url := 'https://kabbtpgvglxmmkaevbxy.supabase.co/functions/v1/leetcode-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
