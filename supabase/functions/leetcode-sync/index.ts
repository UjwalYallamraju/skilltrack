// SkillTrack: pull public LeetCode stats + recent accepted problems into the database.
// POST {}                -> sync every trainer with a LeetCode username (used by the schedule)
// POST { user_id: "…" }  -> sync one trainer ("Sync now" button)
// Only public LeetCode data is read, and each person is synced at most once every 2 minutes.
import postgres from 'npm:postgres@3.4.5'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function leetcode(query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://leetcode.com',
      'User-Agent': 'Mozilla/5.0 (SkillTrack team tracker)',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`LeetCode answered ${res.status}`)
  const body = await res.json()
  if (body.errors?.length) throw new Error(body.errors[0].message)
  return body.data
}

const PROFILE_Q = `query p($username: String!) {
  matchedUser(username: $username) { submitStatsGlobal { acSubmissionNum { difficulty count } } }
  recentAcSubmissionList(username: $username, limit: 20) { title titleSlug timestamp }
}`
const DIFF_Q = `query d($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }`

const istDate = (unixSeconds: number) => new Date((unixSeconds + 19800) * 1000).toISOString().slice(0, 10)

async function syncOne(p: { id: string; leetcode_username: string }) {
  const data = await leetcode(PROFILE_Q, { username: p.leetcode_username })
  if (!data.matchedUser) return { user: p.leetcode_username, ok: false, error: 'LeetCode user not found' }

  const counts: Record<string, number> = {}
  for (const r of data.matchedUser.submitStatsGlobal.acSubmissionNum) counts[r.difficulty] = r.count

  const recent: { title: string; titleSlug: string; timestamp: string }[] = data.recentAcSubmissionList ?? []
  let added = 0
  for (const s of recent) {
    const day = istDate(Number(s.timestamp))
    const known = await sql`select difficulty from public.leetcode_solves where problem_slug = ${s.titleSlug} and difficulty is not null limit 1`
    let difficulty: string | null = known[0]?.difficulty ?? null
    if (!difficulty) {
      try { difficulty = (await leetcode(DIFF_Q, { titleSlug: s.titleSlug })).question?.difficulty ?? null } catch { /* keep null */ }
    }
    const r = await sql`
      insert into public.leetcode_solves (user_id, problem_slug, title, difficulty, solved_on, source)
      values (${p.id}, ${s.titleSlug}, ${s.title}, ${difficulty}, ${day}, 'sync')
      on conflict (user_id, problem_slug, solved_on) do nothing`
    added += r.count
  }

  await sql`
    insert into public.leetcode_stats (user_id, easy, medium, hard, synced_at)
    values (${p.id}, ${counts.Easy ?? 0}, ${counts.Medium ?? 0}, ${counts.Hard ?? 0}, now())
    on conflict (user_id) do update set easy = excluded.easy, medium = excluded.medium, hard = excluded.hard, synced_at = now()`
  return { user: p.leetcode_username, ok: true, added }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const userId: string | undefined = body?.user_id
    const people = userId
      ? await sql`select p.id, p.leetcode_username from public.profiles p
                  left join public.leetcode_stats s on s.user_id = p.id
                  where p.id = ${userId} and p.leetcode_username is not null
                    and (s.synced_at is null or s.synced_at < now() - interval '2 minutes')`
      : await sql`select p.id, p.leetcode_username from public.profiles p
                  left join public.leetcode_stats s on s.user_id = p.id
                  where p.leetcode_username is not null
                    and (s.synced_at is null or s.synced_at < now() - interval '2 minutes')`

    if (userId && people.length === 0) return json({ message: 'Already up to date (synced in the last 2 minutes).' })

    const results = []
    for (const p of people) {
      try { results.push(await syncOne(p as any)) } catch (e) { results.push({ user: p.leetcode_username, ok: false, error: String(e) }) }
      await new Promise((r) => setTimeout(r, 400))
    }
    const one = results[0] as any
    const message = userId
      ? one?.ok ? `Synced with LeetCode${one.added ? ` · ${one.added} new problem${one.added === 1 ? '' : 's'}` : ''}.` : `Sync failed: ${one?.error}`
      : `Synced ${results.filter((r: any) => r.ok).length} of ${results.length} trainers.`
    return json({ message, results })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
