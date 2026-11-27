// Pure functions that turn raw rows into what a lead needs to act on.
// No React, no network: easy to test.
import { addDays, daysBetween, fmtDate, istDay, isWeekend, todayIST, weekdayShort } from './dates'
const short = (d) => fmtDate(d, { day: 'numeric', month: 'short' })

export const QUIET_WEEKDAYS = 3 // flag someone after this many weekdays with no activity

export function lastWeekday(day) {
  let d = addDays(day, -1)
  while (isWeekend(d)) d = addDays(d, -1)
  return d
}
export function weekdaysBetween(from, to) {
  // weekdays strictly after `from` and strictly before `to`
  let n = 0
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) if (!isWeekend(d)) n++
  return n
}
export function mondayOf(iso) {
  const dow = (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}
export function relDay(iso, today = todayIST()) {
  if (!iso) return 'never'
  const n = daysBetween(iso, today)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 7) return `${n} days ago`
  if (n < 14) return 'last week'
  if (n < 60) return `${Math.floor(n / 7)} weeks ago`
  return `${Math.floor(n / 30)} months ago`
}

// Which people does this user look after?
export function scopeIds(profile, data) {
  const { people, groups } = data
  if (profile.role === 'admin') return new Set(people.filter((p) => p.id !== profile.id).map((p) => p.id))
  const led = groups.filter((g) => g.members.some((m) => m.user_id === profile.id && m.is_lead))
  return new Set(led.flatMap((g) => g.members.map((m) => m.user_id)).filter((id) => id !== profile.id))
}
export const isManager = (profile, data) => profile.role === 'admin' || data.groups.some((g) => g.members.some((m) => m.user_id === profile.id && m.is_lead))

// People who share a group with me (what a trainer sees), including me
export function teammateIds(profile, data) {
  const mine = data.groups.filter((g) => g.members.some((m) => m.user_id === profile.id))
  return new Set([profile.id, ...mine.flatMap((g) => g.members.map((m) => m.user_id))])
}

export function groupsOf(userId, groups) {
  return groups.filter((g) => g.members.some((m) => m.user_id === userId))
}

// Index raw rows once per render
export function buildIndex(data, today = todayIST()) {
  const solvesByDay = new Map() // `${user}|${day}` -> count
  const lastSolve = new Map()
  const firstSolve = new Map()
  for (const s of data.solves) {
    const k = `${s.user_id}|${s.solved_on}`
    solvesByDay.set(k, (solvesByDay.get(k) || 0) + 1)
    if (!lastSolve.has(s.user_id) || s.solved_on > lastSolve.get(s.user_id)) lastSolve.set(s.user_id, s.solved_on)
    if (!firstSolve.has(s.user_id) || s.solved_on < firstSolve.get(s.user_id)) firstSolve.set(s.user_id, s.solved_on)
  }
  const lastUpdate = new Map()
  for (const u of data.updates) {
    const d = istDay(u.created_at)
    if (!lastUpdate.has(u.user_id) || d > lastUpdate.get(u.user_id)) lastUpdate.set(u.user_id, d)
  }
  const goalsBy = new Map()
  for (const g of data.goals) (goalsBy.get(g.user_id) || goalsBy.set(g.user_id, []).get(g.user_id)).push(g)
  const actionsBy = new Map()
  for (const a of data.actions) (actionsBy.get(a.trainer_id) || actionsBy.set(a.trainer_id, []).get(a.trainer_id)).push(a)
  const lcBy = new Map(data.lc.map((r) => [r.user_id, r]))
  const personBy = new Map(data.people.map((p) => [p.id, p]))
  return {
    today, personBy, lcBy,
    solved: (u, d) => solvesByDay.get(`${u}|${d}`) || 0,
    lastSolve: (u) => lastSolve.get(u) || null,
    lastUpdate: (u) => lastUpdate.get(u) || null,
    goalsOf: (u) => goalsBy.get(u) || [],
    actionsOf: (u) => actionsBy.get(u) || [],
    startOf: (p) => trackingStart(p, firstSolve.get(p.id)),
  }
}

// Tracking starts on the day someone joined SkillTrack or their first synced problem,
// whichever is earlier (LeetCode history synced on sign-up counts too).
export function trackingStart(p, firstSolve) {
  const joined = istDay(p.created_at)
  return firstSolve && firstSolve < joined ? firstSolve : joined
}

export function personStats(p, idx) {
  const { today } = idx
  const joined = idx.startOf(p)
  const goals = idx.goalsOf(p.id)
  const actions = idx.actionsOf(p.id)
  const lc = idx.lcBy.get(p.id)
  // only the trainer's own actions count (a lead reviewing a goal shouldn't make them look active)
  const goalActivity = goals.flatMap((g) => [g.created_at, g.submitted_at].filter(Boolean).map(istDay)).sort().pop() || null
  const lastActive = [idx.lastSolve(p.id), idx.lastUpdate(p.id), goalActivity].filter(Boolean).sort().pop() || null
  const since = lastActive || joined
  const quiet = since < today ? weekdaysBetween(since, today) : 0
  const prevDay = lastWeekday(today)
  const last7 = Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); return { day, n: idx.solved(p.id, day) } })
  const active = goals.filter((g) => g.status !== 'completed')
  return {
    joined, lastActive, quiet,
    target: p.daily_target,
    today: idx.solved(p.id, today),
    yesterdayDay: prevDay,
    yesterday: idx.solved(p.id, prevDay),
    missedYesterday: p.daily_target > 0 && joined <= prevDay && idx.solved(p.id, prevDay) < p.daily_target,
    streak: lc?.streak ?? 0,
    totalSolved: lc?.total ?? 0,
    last7,
    week: last7.reduce((s, x) => s + x.n, 0),
    goals: {
      all: goals,
      active,
      overdue: goals.filter((g) => g.status === 'overdue'),
      atRisk: goals.filter((g) => g.status === 'at_risk'),
      inReview: goals.filter((g) => g.status === 'in_review'),
      completed: goals.filter((g) => g.status === 'completed'),
      avgProgress: active.length ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : null,
    },
    actions: {
      open: actions.filter((a) => !a.done),
      overdue: actions.filter((a) => !a.done && a.due_date && a.due_date < today),
    },
  }
}

// Health score used to sort "needs attention first"
export function attentionScore(s) {
  return s.goals.inReview.length * 5 + s.goals.overdue.length * 4 + s.actions.overdue.length * 3 +
    (s.quiet >= QUIET_WEEKDAYS ? 3 : 0) + (s.missedYesterday ? 1 : 0) + s.goals.atRisk.length
}

// The lead's inbox: what needs action, most important first
export function attentionItems(ids, idx) {
  const items = []
  for (const id of ids) {
    const p = idx.personBy.get(id)
    if (!p) continue
    const s = personStats(p, idx)
    for (const g of s.goals.inReview)
      items.push({ key: `rev-${g.id}`, kind: 'review', priority: 0, person: p, goal: g, title: g.title, detail: `Submitted for approval ${relDay(g.submitted_at ? istDay(g.submitted_at) : idx.today)}` })
    for (const g of s.goals.overdue)
      items.push({ key: `od-${g.id}`, kind: 'overdue', priority: 1, person: p, goal: g, title: g.title, detail: g.goal_type === 'leetcode' ? `LeetCode target ended ${relDay(g.target_date)} at ${g.lc_solved}/${g.lc_target}` : `Was due ${short(g.target_date)} (${relDay(g.target_date)}) · ${g.progress}% done` })
    for (const a of s.actions.overdue)
      items.push({ key: `ai-${a.id}`, kind: 'action', priority: 1, person: p, action: a, title: a.title, detail: `Follow-up was due ${relDay(a.due_date)}` })
    if (s.quiet >= QUIET_WEEKDAYS)
      items.push({ key: `q-${p.id}`, kind: 'quiet', priority: 2, person: p, title: 'Gone quiet', detail: s.lastActive ? `No activity for ${s.quiet} weekdays (last active ${relDay(s.lastActive)})` : `No activity since joining ${relDay(s.joined)}` })
    else if (s.missedYesterday)
      items.push({ key: `m-${p.id}`, kind: 'missed', priority: 3, person: p, title: 'Missed LeetCode target', detail: `Solved ${s.yesterday} of ${s.target} on ${weekdayShort(s.yesterdayDay)}${s.streak === 0 ? ' · streak reset' : ''}` })
    for (const g of s.goals.atRisk)
      items.push({ key: `ar-${g.id}`, kind: 'at_risk', priority: 3, person: p, goal: g, title: g.title, detail: g.review_status === 'changes_requested' ? 'Changes requested, waiting on the trainer' : g.flagged_by_trainer ? 'Flagged at risk by the trainer' : g.goal_type === 'leetcode' ? `${g.lc_solved}/${g.lc_target} solved, ${g.lc_expected - g.lc_solved} behind pace · ends ${short(g.target_date)}` : `Due ${short(g.target_date)} with only ${g.progress}% done` })
  }
  return items.sort((a, b) => a.priority - b.priority || (a.person.full_name || '').localeCompare(b.person.full_name || ''))
}

// Share of (person × weekday) slots on target between from..to (inclusive)
export function consistency(list, from, to, idx) {
  let slots = 0, met = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekend(d)) continue
    for (const p of list) {
      if (p.daily_target <= 0 || d < idx.startOf(p)) continue
      slots++
      if (idx.solved(p.id, d) >= p.daily_target) met++
    }
  }
  return slots ? Math.round((100 * met) / slots) : null
}

export function teamPulse(ids, idx, data) {
  const { today } = idx
  const list = [...ids].map((id) => idx.personBy.get(id)).filter(Boolean)
  const withTarget = list.filter((p) => p.daily_target > 0)
  const mon = mondayOf(today)
  const span = daysBetween(mon, today)
  const prevMon = addDays(mon, -7), prevEnd = addDays(prevMon, span)
  const count = (from, to) => data.solves.filter((s) => ids.has(s.user_id) && s.solved_on >= from && s.solved_on <= to).length
  const goals = data.goals.filter((g) => ids.has(g.user_id))
  const doneIn = (from, to) => goals.filter((g) => g.completed_at && istDay(g.completed_at) >= from && istDay(g.completed_at) <= to).length
  return {
    people: list.length,
    hitToday: withTarget.filter((p) => idx.solved(p.id, today) >= p.daily_target).length,
    withTarget: withTarget.length,
    problemsWeek: count(mon, today),
    problemsPrevWeek: count(prevMon, prevEnd),
    consistencyWeek: consistency(list, mon, today, idx),
    consistencyPrevWeek: consistency(list, prevMon, prevEnd, idx),
    done30: doneIn(addDays(today, -29), today),
    donePrev30: doneIn(addDays(today, -59), addDays(today, -30)),
    activeGoals: goals.filter((g) => g.status !== 'completed').length,
    overdueGoals: goals.filter((g) => g.status === 'overdue').length,
    inReview: goals.filter((g) => g.status === 'in_review').length,
  }
}

export function upcoming(ids, idx, data, days = 14) {
  const { today } = idx
  const end = addDays(today, days)
  const goals = data.goals.filter((g) => ids.has(g.user_id) && !['completed', 'in_review'].includes(g.status) && g.target_date >= today && g.target_date <= end)
    .map((g) => ({ key: `g-${g.id}`, date: g.target_date, kind: 'goal', person: idx.personBy.get(g.user_id), title: g.title, goal: g }))
  const acts = data.actions.filter((a) => ids.has(a.trainer_id) && !a.done && a.due_date && a.due_date >= today && a.due_date <= end)
    .map((a) => ({ key: `a-${a.id}`, date: a.due_date, kind: 'action', person: idx.personBy.get(a.trainer_id), title: a.title, action: a }))
  return [...goals, ...acts].filter((x) => x.person).sort((a, b) => a.date.localeCompare(b.date))
}

const MILESTONES = [5, 10, 20, 30, 50, 75, 100]
export function recentWins(ids, idx, data) {
  const from = addDays(idx.today, -7)
  const wins = data.goals.filter((g) => ids.has(g.user_id) && g.completed_at && istDay(g.completed_at) >= from)
    .map((g) => ({ key: `w-${g.id}`, person: idx.personBy.get(g.user_id), text: `Completed “${g.title}”`, day: istDay(g.completed_at) }))
  for (const id of ids) {
    const r = idx.lcBy.get(id)
    if (r && MILESTONES.includes(r.streak)) wins.push({ key: `s-${id}`, person: idx.personBy.get(id), text: `Reached a ${r.streak}-day LeetCode streak`, day: idx.today })
  }
  return wins.filter((w) => w.person).sort((a, b) => b.day.localeCompare(a.day))
}

// Activity timeline for one person
export function activityFeed(personId, data, comments = [], notes = []) {
  const items = []
  const byDay = new Map()
  for (const s of data.solves.filter((x) => x.user_id === personId)) {
    (byDay.get(s.solved_on) || byDay.set(s.solved_on, []).get(s.solved_on)).push(s)
  }
  for (const [day, list] of byDay) items.push({ key: `lc-${day}`, day, at: day + 'T23:59:00+05:30', kind: 'leetcode', list })
  for (const u of data.updates.filter((x) => x.user_id === personId))
    items.push({ key: `u-${u.id}`, day: istDay(u.created_at), at: u.created_at, kind: 'update', update: u })
  for (const g of data.goals.filter((x) => x.user_id === personId)) {
    items.push({ key: `gc-${g.id}`, day: istDay(g.created_at), at: g.created_at, kind: 'goal_created', goal: g })
    if (g.submitted_at) items.push({ key: `gs-${g.id}`, day: istDay(g.submitted_at), at: g.submitted_at, kind: 'goal_submitted', goal: g })
    if (g.completed_at) items.push({ key: `gd-${g.id}`, day: istDay(g.completed_at), at: g.completed_at, kind: 'goal_completed', goal: g })
  }
  for (const n of notes) items.push({ key: `n-${n.id}`, day: n.meeting_date, at: n.created_at, kind: 'note', note: n })
  for (const c of comments) items.push({ key: `c-${c.id}`, day: istDay(c.created_at), at: c.created_at, kind: 'comment', comment: c })
  return items.sort((a, b) => (b.at > a.at ? 1 : -1))
}
