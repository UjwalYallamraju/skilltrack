import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Search, Users } from 'lucide-react'
import { useMe } from '../lib/me'
import { useTeamData } from '../lib/queries'
import { buildIndex, groupsOf, scopeIds, teammateIds } from '../lib/insights'
import { download, toCsv } from '../lib/data'
import { addDays, fmtDate, istDay, isWeekend, todayIST, weekdayShort } from '../lib/dates'
import { DifficultyTag, StreakPill } from '../components/leetcode'
import { LeetCodeTargets } from '../components/challenges'
import { Avatar, Button, EmptyState, ErrorNote, PageHeader, PageSkeleton, Segmented } from '../components/ui'

const RANGES = [{ value: 14, label: '14 days' }, { value: 30, label: '30 days' }, { value: 60, label: '60 days' }]

// Cell style for one trainer on one day (always shown with the number, never colour alone)
function cellTone(n, target, day, joined) {
  if (day < joined) return 'bg-transparent text-faint'
  if (n === 0) return isWeekend(day) || day === todayIST() ? 'bg-soft text-faint' : 'bg-bad-bg text-bad-fg'
  if (target > 0 && n >= target) return 'bg-ok text-white'
  return 'bg-warn-bg text-warn-fg'
}

export default function LeetCode() {
  const me = useMe()
  const { data, error } = useTeamData()
  const [range, setRange] = useState(14)
  const [groupId, setGroupId] = useState('all')
  const [q, setQ] = useState('')
  const [day, setDay] = useState(todayIST())
  const [person, setPerson] = useState('all')

  const view = useMemo(() => {
    if (!data) return null
    const today = todayIST()
    const idx = buildIndex(data)
    const days = Array.from({ length: range }, (_, i) => addDays(today, -i)) // newest first
    // Managers: the people they look after (plus themselves); trainers: everyone in their groups
    const ids = me.isManager ? new Set([...scopeIds(me.profile, data), me.profile.id]) : teammateIds(me.profile, data)
    const groups = me.isAdmin ? data.groups : data.groups.filter((g) => g.members.some((m) => m.user_id === me.profile.id))
    const solvesBy = new Map(), updatesBy = new Map()
    for (const s of data.solves) { const k = `${s.user_id}|${s.solved_on}`; (solvesBy.get(k) || solvesBy.set(k, []).get(k)).push(s) }
    const goalTitle = new Map(data.goals.map((g) => [g.id, g.title]))
    for (const u of data.updates) { const k = `${u.user_id}|${istDay(u.created_at)}`; (updatesBy.get(k) || updatesBy.set(k, []).get(k)).push({ ...u, title: u.goal?.title || goalTitle.get(u.goal_id) || 'Goal' }) }
    const people = data.people.filter((p) => ids.has(p.id)).map((p) => ({ p, joined: istDay(p.created_at), groups: groupsOf(p.id, data.groups), lc: idx.lcBy.get(p.id) }))
    return {
      days, people, groups,
      solvesOf: (u, d) => solvesBy.get(`${u}|${d}`) || [],
      updatesOf: (u, d) => updatesBy.get(`${u}|${d}`) || [],
    }
  }, [data, me, range])

  if (error) return <ErrorNote error={error} />
  if (!view) return <PageSkeleton />

  const { days, solvesOf, updatesOf } = view
  const needle = q.trim().toLowerCase()
  const rows = view.people
    .filter((r) => groupId === 'all' || r.groups.some((g) => g.id === groupId))
    .filter((r) => !needle || `${r.p.full_name} ${r.p.email}`.toLowerCase().includes(needle))
    .map((r) => {
      let met = 0, slots = 0, total = 0
      for (const d of days) {
        const n = solvesOf(r.p.id, d).length
        total += n
        if (!isWeekend(d) && d >= r.joined && r.p.daily_target > 0 && d !== days[0]) { slots++; if (n >= r.p.daily_target) met++ }
      }
      return { ...r, total, rate: slots ? Math.round((100 * met) / slots) : null }
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.total - a.total)

  const selectedDay = days.includes(day) ? day : days[0]
  const dayRows = person === 'all' ? rows : rows.filter((r) => r.p.id === person)
  const activeCount = dayRows.filter((r) => solvesOf(r.p.id, selectedDay).length || updatesOf(r.p.id, selectedDay).length).length
  const metCount = dayRows.filter((r) => r.p.daily_target > 0 && solvesOf(r.p.id, selectedDay).length >= r.p.daily_target).length
  const dayTotal = (d) => rows.reduce((s, r) => s + solvesOf(r.p.id, d).length, 0)

  function exportCsv() {
    const chron = [...days].reverse()
    download(`leetcode-daily-${todayIST()}.csv`, toCsv(rows, [
      { label: 'Trainer', get: (r) => r.p.full_name }, { label: 'Email', get: (r) => r.p.email },
      { label: 'Daily target', get: (r) => r.p.daily_target },
      ...chron.map((d) => ({ label: d, get: (r) => (d < r.joined ? '' : solvesOf(r.p.id, d).length) })),
      { label: `Total (${range} days)`, get: (r) => r.total }, { label: 'Weekdays on target %', get: (r) => r.rate ?? '' },
    ]))
  }

  return (
    <>
      <PageHeader title="LeetCode" subtitle="Targets set for the team, and what each trainer solved every day." />

      <LeetCodeTargets goals={data.goals} people={view.people.map((r) => r.p)} groups={view.groups} canManage={me.isManager} />

      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <h2 className="m-0 text-[17px] font-semibold">Day by day</h2>
        <div className="flex flex-wrap gap-2">
          <Segmented label="Date range" value={range} onChange={setRange} options={RANGES} />
          <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <label className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input className="input pl-9" placeholder="Search trainers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search trainers" />
        </label>
        {view.groups.length > 1 && (
          <select className="input w-auto" value={groupId} onChange={(e) => { setGroupId(e.target.value); setPerson('all') }} aria-label="Group">
            <option value="all">{me.isAdmin ? 'All groups' : 'All my groups'}</option>
            {view.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 ? <div className="card"><EmptyState icon={Users} title="No one to show">Try another search or group.</EmptyState></div> : <>
        <section className="card mb-6" aria-labelledby="grid-h">
          <div className="flex flex-wrap justify-between gap-3 items-center px-5 pt-4">
            <h2 id="grid-h" className="m-0 text-[15px] font-semibold">Daily submissions</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-ok" />Target met</span>
              <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-warn-bg border border-[#ecd2b3]" />Below target</span>
              <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-bad-bg border border-[#efc9c9]" />None (weekday)</span>
              <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-soft" />Weekend</span>
              <span className="flex gap-1.5 items-center"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Goal update</span>
            </div>
          </div>
          <div className="overflow-x-auto px-5 pb-4 pt-3">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 bg-white z-10 text-left text-muted font-semibold py-2 pr-3 min-w-[200px]">Trainer</th>
                  <th scope="col" className="sticky left-[200px] bg-white z-10 text-right text-muted font-semibold py-2 px-2 whitespace-nowrap border-r border-line">On target</th>
                  {days.map((d) => (
                    <th key={d} scope="col" className="p-0.5 font-normal">
                      <button onClick={() => { setDay(d); setPerson('all') }} aria-pressed={d === selectedDay} title={`${dayTotal(d)} problems by the team`}
                        className={`w-10 rounded-md py-1 cursor-pointer border-0 leading-tight ${d === selectedDay ? 'bg-accent text-white' : isWeekend(d) ? 'bg-transparent text-faint' : 'bg-transparent text-muted hover:bg-soft'}`}>
                        <span className="block text-[10px]">{weekdayShort(d)}</span>
                        <span className="block font-semibold text-[13px]">{fmtDate(d, { day: 'numeric' })}</span>
                        <span className="block text-[10px]">{fmtDate(d, { month: 'short' })}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id} className="border-t border-line">
                    <td className="sticky left-0 bg-white z-10 py-1.5 pr-3">
                      <button onClick={() => setPerson(r.p.id === person ? 'all' : r.p.id)} className="flex items-center gap-2.5 bg-transparent border-0 p-0 cursor-pointer text-left">
                        <Avatar name={r.p.full_name || r.p.email} size={28} />
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold truncate max-w-[140px] ${person === r.p.id ? 'text-accent' : 'text-ink'}`}>{r.p.full_name || r.p.email}</span>
                          <span className="flex items-center gap-2 text-[11px] text-muted">Target {r.p.daily_target || '—'}/day <StreakPill streak={r.lc?.streak ?? 0} /></span>
                        </span>
                      </button>
                    </td>
                    <td className="sticky left-[200px] bg-white z-10 px-2 text-right tabular-nums border-r border-line">
                      <div className="text-sm font-semibold">{r.rate == null ? '—' : `${r.rate}%`}</div>
                      <div className="text-[11px] text-muted">{r.total} solved</div>
                    </td>
                    {days.map((d) => {
                      const n = solvesOf(r.p.id, d).length
                      const ups = updatesOf(r.p.id, d).length
                      const sel = d === selectedDay && (person === 'all' || person === r.p.id)
                      return (
                        <td key={d} className="p-0.5">
                          <button onClick={() => { setDay(d); setPerson(r.p.id) }}
                            title={`${r.p.full_name}, ${weekdayShort(d)} ${fmtDate(d)}: ${n} problem${n === 1 ? '' : 's'}${ups ? `, ${ups} goal update${ups === 1 ? '' : 's'}` : ''}`}
                            aria-label={`${r.p.full_name}, ${fmtDate(d)}: ${n} problems${ups ? `, ${ups} goal updates` : ''}`}
                            className={`relative w-10 h-9 rounded-md border-0 cursor-pointer text-xs font-semibold tabular-nums ${cellTone(n, r.p.daily_target, d, r.joined)} ${sel ? 'ring-2 ring-accent ring-offset-1' : ''}`}>
                            {d < r.joined ? '' : n || (isWeekend(d) ? '' : '0')}
                            {ups > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-line">
                  <td className="sticky left-0 bg-white z-10 py-2 pr-3 text-xs font-semibold text-muted">Team total</td>
                  <td className="sticky left-[200px] bg-white z-10 px-2 text-right text-sm font-semibold tabular-nums border-r border-line">{rows.reduce((s, r) => s + r.total, 0)}</td>
                  {days.map((d) => <td key={d} className="p-0.5 text-center text-xs font-semibold text-ink-2 tabular-nums">{dayTotal(d) || ''}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="m-0 px-5 pb-4 text-xs text-muted">"On target" is the share of completed weekdays in this range where the trainer met their daily target (today is left out until the day ends).</p>
        </section>

        <section aria-labelledby="day-h">
          <div className="flex flex-wrap justify-between gap-3 items-end mb-3">
            <div>
              <h2 id="day-h" className="m-0 text-[17px] font-semibold">{fmtDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <p className="mt-1 mb-0 text-sm text-muted">
                {person === 'all'
                  ? <>{activeCount} of {dayRows.length} active · {metCount} met their target · {dayTotal(selectedDay)} problems{isWeekend(selectedDay) ? ' · weekend' : ''}</>
                  : <>One trainer · <button onClick={() => setPerson('all')} className="text-accent bg-transparent border-0 p-0 cursor-pointer text-sm">show everyone</button></>}
              </p>
            </div>
            <label className="text-[13px] text-muted flex items-center gap-2">Date
              <input type="date" className="input w-auto" value={selectedDay} min={days[days.length - 1]} max={days[0]} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </label>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...dayRows].sort((a, b) => solvesOf(b.p.id, selectedDay).length - solvesOf(a.p.id, selectedDay).length).map((r) => {
              const solved = solvesOf(r.p.id, selectedDay)
              const ups = updatesOf(r.p.id, selectedDay)
              const hit = r.p.daily_target > 0 && solved.length >= r.p.daily_target
              return (
                <article key={r.p.id} className="card p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center gap-3">
                    <Link to={`/people/${encodeURIComponent(r.p.id)}`} className="flex items-center gap-2.5 no-underline text-ink min-w-0">
                      <Avatar name={r.p.full_name || r.p.email} size={30} /><span className="text-sm font-semibold truncate">{r.p.full_name || r.p.email}</span>
                    </Link>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${solved.length === 0 ? (isWeekend(selectedDay) || selectedDay === todayIST() ? 'bg-soft text-muted' : 'bg-bad-bg text-bad-fg') : hit ? 'bg-ok-bg text-ok-fg' : 'bg-warn-bg text-warn-fg'}`}>
                      {solved.length} / {r.p.daily_target}
                    </span>
                  </div>
                  {selectedDay < r.joined ? <p className="m-0 text-sm text-muted">Hadn't joined yet.</p>
                    : solved.length === 0 && ups.length === 0 ? <p className="m-0 text-sm text-muted">Nothing recorded.</p> : <>
                      {solved.length > 0 && (
                        <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                          {solved.map((s) => (
                            <li key={s.id} className="flex items-center gap-2 text-sm min-w-0">
                              <DifficultyTag level={s.difficulty} />
                              <a href={`https://leetcode.com/problems/${s.problem_slug}/`} target="_blank" rel="noreferrer" className="text-ink truncate">{s.title}</a>
                              {s.source === 'manual' && <span className="text-[11px] text-muted flex-none">manual</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {ups.length > 0 && (
                        <ul className="list-none p-0 m-0 flex flex-col gap-2 border-t border-line pt-2">
                          {ups.map((u) => (
                            <li key={u.id} className="border-l-2 border-accent pl-2.5 text-[13px]">
                              <div className="font-semibold">{u.title} <span className="text-muted font-normal">· {u.progress}%</span></div>
                              <div className="text-muted">{u.note}</div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>}
                </article>
              )
            })}
          </div>
        </section>
      </>}
    </>
  )
}
