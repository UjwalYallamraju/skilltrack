import { useMemo, useState } from 'react'
import { download, toCsv } from '../lib/data'
import { useMe } from '../lib/me'
import { useTeamData } from '../lib/queries'
import { trackingStart } from '../lib/insights'
import { addDays, fmtDate, istDay, isWeekend, todayIST } from '../lib/dates'
import { Button, ErrorNote, Kpi, Spinner } from '../components/ui'
import { BarChart, LineChart, Legend, NEUTRAL, ORDINAL_BLUE, SERIES } from '../components/Charts'

const DIFFS = [
  { key: 'Easy', color: ORDINAL_BLUE[0] },
  { key: 'Medium', color: ORDINAL_BLUE[1] },
  { key: 'Hard', color: ORDINAL_BLUE[2] },
]

const mondayOf = (iso) => {
  const dow = (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7 // Mon = 0
  return addDays(iso, -dow)
}
const monthKey = (iso) => iso.slice(0, 7)
const monthLabel = (key) => fmtDate(key + '-01', { month: 'short', year: '2-digit' })
const lastDayOfMonth = (key) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`)

export default function Reports() {
  const { profile } = useMe()
  const team = useTeamData()
  const error = team.error
  const data = useMemo(() => team.data && { ...team.data, updates: team.data.updates.map((u) => ({ ...u, day: istDay(u.created_at) })) }, [team.data])
  const [group, setGroup] = useState('all')
  const [weeks, setWeeks] = useState(12)
  const today = todayIST()
  const [month, setMonth] = useState(monthKey(today))
  const isAdmin = profile.role === 'admin'


  const ctx = useMemo(() => {
    if (!data) return null
    const membersOf = (gid) => new Set((data.groups.find((g) => g.id === gid)?.members || []).map((m) => m.user_id))
    const inGroup = group === 'all' ? null : membersOf(group)
    const people = data.people.filter((p) =>
      (p.role === 'trainer' || data.goals.some((g) => g.user_id === p.id) || data.solves.some((s) => s.user_id === p.id)) &&
      (!inGroup || inGroup.has(p.id)))
    const solvesBy = {}
    const firstSolve = {}
    for (const s of data.solves) {
      (solvesBy[`${s.user_id}|${s.solved_on}`] ||= []).push(s)
      if (!firstSolve[s.user_id] || s.solved_on < firstSolve[s.user_id]) firstSolve[s.user_id] = s.solved_on
    }
    const joined = Object.fromEntries(people.map((p) => [p.id, trackingStart(p, firstSolve[p.id])]))
    const solvedOn = (uid, d) => (solvesBy[`${uid}|${d}`] || []).length

    // Share of (trainer × weekday) slots where the trainer hit their daily target
    function consistency(list, from, to) {
      let slots = 0, met = 0
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (isWeekend(d)) continue
        for (const p of list) {
          if (p.daily_target <= 0 || d < joined[p.id]) continue
          slots++
          if (solvedOn(p.id, d) >= p.daily_target) met++
        }
      }
      return { slots, met, pct: slots ? (100 * met) / slots : null }
    }
    return { people, membersOf, solvedOn, consistency }
  }, [data, group])

  if (error) return <ErrorNote error={error} />
  if (!ctx) return <Spinner />

  const { people, membersOf, consistency } = ctx
  const ids = new Set(people.map((p) => p.id))
  const groupName = group === 'all' ? (isAdmin ? 'All groups' : 'My groups') : data.groups.find((g) => g.id === group)?.name

  // ---------- Trends ----------
  const thisMonday = mondayOf(today)
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(thisMonday, -7 * (weeks - 1 - i)))
  const weekLabels = weekStarts.map((w) => fmtDate(w, { day: 'numeric', month: 'short' }))
  const solvesInView = data.solves.filter((s) => ids.has(s.user_id))
  const perWeek = (pred) => weekStarts.map((w) => solvesInView.filter((s) => s.solved_on >= w && s.solved_on <= addDays(w, 6) && pred(s)).length)
  const diffSeries = DIFFS.map((d) => ({ label: d.key, color: d.color, values: perWeek((s) => s.difficulty === d.key) }))
  const unclassified = perWeek((s) => !s.difficulty)
  if (unclassified.some((v) => v > 0)) diffSeries.push({ label: 'Not classified', color: NEUTRAL, values: unclassified })

  // consistency per week: one line per group when comparing all groups, else one line
  const comparing = group === 'all' && data.groups.length > 1
  const lineGroups = comparing ? [...data.groups].sort((a, b) => a.name.localeCompare(b.name)) : []
  const shown = lineGroups.slice(0, 7)
  const folded = lineGroups.slice(7)
  const weekly = (list) => weekStarts.map((w) => consistency(list, w, w === thisMonday ? today : addDays(w, 6)).pct)
  const consistencySeries = comparing
    ? [
        ...shown.map((g, i) => ({ label: g.name, color: SERIES[i], values: weekly(people.filter((p) => membersOf(g.id).has(p.id))) })),
        ...(folded.length ? [{ label: 'Other groups', color: SERIES[7], values: weekly(people.filter((p) => folded.some((g) => membersOf(g.id).has(p.id)))) }] : []),
      ]
    : [{ label: groupName, color: SERIES[0], values: weekly(people) }]

  const monthKeys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i))
    return d.toISOString().slice(0, 7)
  })
  const goalsInView = data.goals.filter((g) => ids.has(g.user_id))
  const completedSeries = [{
    label: 'Goals completed', color: SERIES[0],
    values: monthKeys.map((k) => goalsInView.filter((g) => g.completed_at && monthKey(istDay(g.completed_at)) === k).length),
  }]

  // ---------- Monthly report ----------
  const mFrom = month + '-01'
  const mTo = lastDayOfMonth(month) < today ? lastDayOfMonth(month) : today
  const inMonth = (d) => d >= mFrom && d <= mTo
  const rows = people.map((p) => {
    const solved = data.solves.filter((s) => s.user_id === p.id && inMonth(s.solved_on))
    const c = consistency([p], mFrom, mTo)
    const mine = data.goals.filter((g) => g.user_id === p.id)
    const done = mine.filter((g) => g.completed_at && inMonth(istDay(g.completed_at))).length
    const started = mine.filter((g) => inMonth(istDay(g.created_at))).length
    const ups = data.updates.filter((u) => u.user_id === p.id && inMonth(u.day)).length
    const overdue = mine.filter((g) => g.status === 'overdue').length
    const atRisk = mine.filter((g) => g.status === 'at_risk').length
    const reasons = []
    if (c.pct != null && c.pct < 50) reasons.push(`on target only ${pct(c.pct)} of weekdays`)
    if (overdue) reasons.push(`${overdue} overdue goal${overdue === 1 ? '' : 's'}`)
    if (!solved.length && !ups && !done) reasons.push('no activity this month')
    return {
      p, solved: solved.length, consistency: c, done, started, ups, overdue, atRisk, reasons,
      e: solved.filter((s) => s.difficulty === 'Easy').length,
      m: solved.filter((s) => s.difficulty === 'Medium').length,
      h: solved.filter((s) => s.difficulty === 'Hard').length,
      groups: data.groups.filter((g) => g.members.some((x) => x.user_id === p.id)).map((g) => g.name).join(', '),
    }
  }).sort((a, b) => b.solved - a.solved || b.done - a.done)
  const total = (k) => rows.reduce((s, r) => s + r[k], 0)
  const teamC = consistency(people, mFrom, mTo)
  const slipping = rows.filter((r) => r.reasons.length)
  const activeGoals = goalsInView.filter((g) => g.status !== 'completed')
  const avgProgress = activeGoals.length ? Math.round(activeGoals.reduce((s, g) => s + g.progress, 0) / activeGoals.length) : null

  function exportReport() {
    const csv = toCsv(rows, [
      { label: 'Trainer', get: (r) => r.p.full_name || r.p.email },
      { label: 'Email', get: (r) => r.p.email },
      { label: 'Groups', get: (r) => r.groups },
      { label: 'LeetCode problems', get: (r) => r.solved },
      { label: 'Easy', get: (r) => r.e },
      { label: 'Medium', get: (r) => r.m },
      { label: 'Hard', get: (r) => r.h },
      { label: 'Daily target', get: (r) => r.p.daily_target },
      { label: 'Weekdays on target', get: (r) => (r.consistency.slots ? `${r.consistency.met}/${r.consistency.slots}` : '') },
      { label: 'On-target %', get: (r) => (r.consistency.pct == null ? '' : Math.round(r.consistency.pct)) },
      { label: 'Goals completed', get: (r) => r.done },
      { label: 'Goals started', get: (r) => r.started },
      { label: 'Progress updates', get: (r) => r.ups },
      { label: 'Overdue now', get: (r) => r.overdue },
      { label: 'At risk now', get: (r) => r.atRisk },
      { label: 'Needs attention', get: (r) => r.reasons.join('; ') },
    ])
    download(`skilltrack-report-${month}-${String(groupName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, csv)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h1 className="m-0 text-[26px] leading-tight font-semibold tracking-tight">Reports</h1>
          <p className="mt-1.5 mb-0 text-muted text-sm">Trends over time and a monthly summary · {groupName} · {people.length} trainer{people.length === 1 ? '' : 's'}</p>
        </div>
        {data.groups.length > 0 && (
          <label className="no-print text-[13px] text-muted flex items-center gap-2">Group
            <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">{isAdmin ? 'All groups' : 'All my groups'}</option>
              {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
      </header>

      {/* ---------------- Trends ---------------- */}
      <section aria-labelledby="trends-h" className="flex flex-col gap-4 print-break">
        <div className="flex flex-wrap justify-between gap-3 items-end">
          <h2 id="trends-h" className="m-0 text-xl font-semibold">Trends</h2>
          <div role="group" aria-label="Trend period" className="no-print flex gap-1 bg-[#E9ECF1] p-1 rounded-[10px]">
            {[8, 12, 26].map((w) => (
              <button key={w} onClick={() => setWeeks(w)} aria-pressed={weeks === w}
                className={`h-9 px-3 rounded-lg text-sm cursor-pointer border-0 ${weeks === w ? 'bg-white font-semibold' : 'bg-transparent text-muted'}`}>{w} weeks</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(440px,1fr))] max-md:grid-cols-1 gap-5">
          <article className="card p-5 flex flex-col gap-3">
            <div>
              <h3 className="m-0 text-base font-semibold">LeetCode problems solved per week</h3>
              <p className="m-0 mt-0.5 text-[13px] text-muted">Week starting Monday · {solvesInView.filter((s) => s.solved_on >= weekStarts[0]).length} problems in {weeks} weeks</p>
            </div>
            <Legend items={diffSeries.map((s) => ({ label: s.label, color: s.color }))} />
            <BarChart labels={weekLabels} series={diffSeries} ariaLabel="LeetCode problems solved per week by difficulty" />
          </article>

          <article className="card p-5 flex flex-col gap-3">
            <div>
              <h3 className="m-0 text-base font-semibold">Days on target</h3>
              <p className="m-0 mt-0.5 text-[13px] text-muted">Share of weekdays where trainers hit their own daily LeetCode target{comparing ? ', by group' : ''}</p>
            </div>
            <Legend items={consistencySeries.map((s) => ({ label: s.label, color: s.color, line: true }))} />
            <LineChart labels={weekLabels} series={consistencySeries} max={100} fmt={pct} ariaLabel="Weekly share of weekdays on LeetCode target" />
          </article>

          <article className="card p-5 flex flex-col gap-3">
            <div>
              <h3 className="m-0 text-base font-semibold">Goals completed per month</h3>
              <p className="m-0 mt-0.5 text-[13px] text-muted">Last 6 months · {completedSeries[0].values.reduce((a, b) => a + b, 0)} goals completed</p>
            </div>
            <BarChart labels={monthKeys.map(monthLabel)} series={completedSeries} ariaLabel="Goals completed per month" />
          </article>
        </div>
      </section>

      {/* ---------------- Monthly report ---------------- */}
      <section aria-labelledby="report-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-between gap-3 items-end">
          <div>
            <h2 id="report-h" className="m-0 text-xl font-semibold">Monthly report · {fmtDate(month + '-01', { month: 'long', year: 'numeric' })}</h2>
            <p className="m-0 mt-1 text-sm text-muted">{groupName} · {fmtDate(mFrom)} – {fmtDate(mTo)}{mTo === today ? ' (month to date)' : ''}</p>
          </div>
          <div className="no-print flex flex-wrap gap-2 items-center">
            <label className="text-[13px] text-muted flex items-center gap-2">Month
              <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
                {[...monthKeys].reverse().map((k) => <option key={k} value={k}>{fmtDate(k + '-01', { month: 'long', year: 'numeric' })}</option>)}
              </select>
            </label>
            <Button variant="secondary" onClick={exportReport}>Download Excel (CSV)</Button>
            <Button variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <Kpi label="LeetCode problems" value={total('solved')} />
          <Kpi label="Weekdays on target" value={pct(teamC.pct)} />
          <Kpi label="Goals completed" value={total('done')} />
          <Kpi label="Goals started" value={total('started')} />
          <Kpi label="Progress updates" value={total('ups')} />
          <Kpi label="Avg. progress (active goals)" value={avgProgress == null ? '—' : `${avgProgress}%`} />
        </div>

        <article className="card p-5" aria-labelledby="attn-h">
          <h3 id="attn-h" className="m-0 mb-2 text-base font-semibold">Needs attention ({slipping.length})</h3>
          {slipping.length === 0 ? <p className="m-0 text-sm text-muted">Everyone is on track this month.</p> : (
            <ul className="list-none p-0 m-0 flex flex-col">
              {slipping.map((r) => (
                <li key={r.p.id} className="py-2 border-t border-soft text-sm flex flex-wrap gap-x-3">
                  <span className="font-semibold">{r.p.full_name || r.p.email}</span>
                  <span className="text-warn-fg">⚠ {r.reasons.join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card p-5 overflow-x-auto" aria-labelledby="per-h">
          <h3 id="per-h" className="m-0 mb-3 text-base font-semibold">By trainer</h3>
          <table className="w-full border-collapse text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide">
                {['Trainer', 'LeetCode (E / M / H)', 'Weekdays on target', 'Goals completed', 'Goals started', 'Updates', 'Overdue / at risk now'].map((h) => (
                  <th key={h} className="py-2.5 px-2 border-b border-line font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td className="py-2 px-2 border-b border-soft">
                    <div className="font-semibold">{r.p.full_name || r.p.email}</div>
                    {r.groups && <div className="text-xs text-muted">{r.groups}</div>}
                  </td>
                  <td className="py-2 px-2 border-b border-soft"><b>{r.solved}</b> <span className="text-muted">({r.e} / {r.m} / {r.h})</span></td>
                  <td className="py-2 px-2 border-b border-soft">
                    {r.consistency.slots ? <><b>{pct(r.consistency.pct)}</b> <span className="text-muted">({r.consistency.met}/{r.consistency.slots} days)</span></> : <span className="text-muted">No target</span>}
                  </td>
                  <td className="py-2 px-2 border-b border-soft font-semibold">{r.done}</td>
                  <td className="py-2 px-2 border-b border-soft">{r.started}</td>
                  <td className="py-2 px-2 border-b border-soft">{r.ups}</td>
                  <td className="py-2 px-2 border-b border-soft">{r.overdue || r.atRisk ? <span className="text-bad-fg font-semibold">{r.overdue} / {r.atRisk}</span> : <span className="text-muted">0 / 0</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="py-4 px-2 text-muted">No trainers in this view.</td></tr>}
            </tbody>
          </table>
        </article>
        <p className="m-0 text-xs text-muted">“Weekdays on target” counts Monday–Friday from each trainer’s first tracked day: when they joined or their first synced problem, whichever is earlier. LeetCode history covers the last ~6 months.</p>
      </section>
    </div>
  )
}
