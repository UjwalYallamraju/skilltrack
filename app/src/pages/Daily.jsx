import { useCallback, useEffect, useMemo, useState } from 'react'
import { getGroups, getProfiles, getRecentGoalUpdates, getSolvesSince } from '../lib/data'
import { addDays, fmtDate, istDay, isWeekend, todayIST, weekdayShort } from '../lib/dates'
import { Empty, ErrorNote, Spinner } from '../components/ui'
import { DifficultyTag } from '../components/LeetCodeCard'

const RANGES = [14, 30, 60]

// Cell colour for one trainer on one day
function tone(n, target, day) {
  if (n === 0) return isWeekend(day) ? 'bg-soft text-[#8A90A0]' : 'bg-bad-bg text-bad-fg'
  if (target > 0 && n >= target) return 'bg-ok text-white'
  return 'bg-warn-bg text-warn-fg'
}

export default function Daily({ profile }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [range, setRange] = useState(14)
  const [group, setGroup] = useState('all')
  const [day, setDay] = useState(todayIST())
  const [person, setPerson] = useState('all')
  const isAdmin = profile.role === 'admin'

  const load = useCallback(async () => {
    try {
      const [people, groups, solves, updates] = await Promise.all([
        getProfiles(), getGroups(), getSolvesSince(range), getRecentGoalUpdates(range),
      ])
      setData({ people, groups, solves, updates: updates.map((u) => ({ ...u, day: istDay(u.created_at) })) })
    } catch (e) { setError(e) }
  }, [range])
  useEffect(() => { load() }, [load])

  const view = useMemo(() => {
    if (!data) return null
    const today = todayIST()
    const days = Array.from({ length: range }, (_, i) => addDays(today, i - range + 1)).reverse() // newest first
    const inGroup = group === 'all' ? null : new Set((data.groups.find((g) => g.id === group)?.members || []).map((m) => m.user_id))
    const people = data.people.filter((p) => (p.role === 'trainer' || data.solves.some((s) => s.user_id === p.id) || data.updates.some((u) => u.user_id === p.id)) && (!inGroup || inGroup.has(p.id)))
    const key = (u, d) => `${u}|${d}`
    const solvesBy = {}, updatesBy = {}
    for (const s of data.solves) (solvesBy[key(s.user_id, s.solved_on)] ||= []).push(s)
    for (const u of data.updates) (updatesBy[key(u.user_id, u.day)] ||= []).push(u)
    return { days, people, solvesOf: (u, d) => solvesBy[key(u, d)] || [], updatesOf: (u, d) => updatesBy[key(u, d)] || [] }
  }, [data, range, group])

  if (error) return <ErrorNote error={error} />
  if (!view) return <Spinner />

  const { days, people, solvesOf, updatesOf } = view
  const selectedDay = days.includes(day) ? day : days[0]
  const dayPeople = person === 'all' ? people : people.filter((p) => p.id === person)
  const active = dayPeople.filter((p) => solvesOf(p.id, selectedDay).length || updatesOf(p.id, selectedDay).length)
  const metTarget = dayPeople.filter((p) => p.daily_target > 0 && solvesOf(p.id, selectedDay).length >= p.daily_target)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h1 className="m-0 font-display text-3xl">Daily Progress</h1>
          <p className="mt-1.5 mb-0 text-muted text-sm">What each trainer did, day by day: LeetCode problems solved and goal updates logged.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {data.groups.length > 0 && (
            <label className="text-[13px] text-muted flex items-center gap-2">Group
              <select className="input w-auto" value={group} onChange={(e) => { setGroup(e.target.value); setPerson('all') }}>
                <option value="all">{isAdmin ? 'All groups' : 'All my groups'}</option>
                {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
          <div role="group" aria-label="Date range" className="flex gap-1 bg-[#E9ECF1] p-1 rounded-[10px]">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
                className={`h-9 px-3 rounded-lg text-sm cursor-pointer border-0 ${range === r ? 'bg-white font-semibold' : 'bg-transparent text-muted'}`}>{r} days</button>
            ))}
          </div>
        </div>
      </header>

      {people.length === 0 ? <Empty>No trainers to show yet.</Empty> : (
        <>
          <section aria-labelledby="grid-h" className="card px-6 py-5">
            <div className="flex flex-wrap justify-between gap-3 items-baseline">
              <h2 id="grid-h" className="m-0 text-[17px] font-semibold">Day-by-day overview</h2>
              <div className="flex flex-wrap gap-4 text-xs text-muted">
                <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-ok" />Hit LeetCode target</span>
                <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-warn-bg border border-[#ecd2b3]" />Some problems</span>
                <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-bad-bg border border-[#efc9c9]" />None (weekday)</span>
                <span className="flex gap-1.5 items-center"><span className="w-3 h-3 rounded-sm bg-soft" />Weekend</span>
                <span className="flex gap-1.5 items-center"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Goal update logged</span>
              </div>
            </div>
            <p className="mt-1 mb-0 text-[13px] text-muted">Numbers are LeetCode problems solved. Click a day or a cell to see the details below.</p>
            <div className="overflow-x-auto mt-4">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 text-left text-muted font-semibold uppercase tracking-wide py-2 pr-3 min-w-[170px]">Trainer</th>
                    {days.map((d) => (
                      <th key={d} className="p-0.5 font-normal">
                        <button onClick={() => { setDay(d); setPerson('all') }} aria-pressed={d === selectedDay}
                          className={`w-10 rounded-md py-1 cursor-pointer border-0 leading-tight ${d === selectedDay ? 'bg-accent text-white' : isWeekend(d) ? 'bg-transparent text-[#8A90A0]' : 'bg-transparent text-muted'}`}>
                          <span className="block text-[10px]">{weekdayShort(d)}</span>
                          <span className="block font-semibold">{fmtDate(d, { day: 'numeric' })}</span>
                          <span className="block text-[10px]">{fmtDate(d, { month: 'short' })}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id}>
                      <td className="sticky left-0 bg-white z-10 py-1 pr-3 text-sm">
                        <button onClick={() => setPerson(p.id)} className={`font-semibold bg-transparent border-0 p-0 cursor-pointer text-left ${person === p.id ? 'text-accent' : 'text-ink hover:text-accent'}`}>{p.full_name || p.email}</button>
                        <div className="text-[11px] text-muted">Target {p.daily_target || '—'}/day</div>
                      </td>
                      {days.map((d) => {
                        const n = solvesOf(p.id, d).length
                        const ups = updatesOf(p.id, d).length
                        const sel = d === selectedDay && (person === 'all' || person === p.id)
                        return (
                          <td key={d} className="p-0.5">
                            <button onClick={() => { setDay(d); setPerson(p.id) }}
                              title={`${p.full_name}, ${fmtDate(d)}: ${n} problem${n === 1 ? '' : 's'}${ups ? `, ${ups} goal update${ups === 1 ? '' : 's'}` : ''}`}
                              aria-label={`${p.full_name}, ${fmtDate(d)}: ${n} problems, ${ups} goal updates`}
                              className={`relative w-10 h-9 rounded-md border-0 cursor-pointer text-xs font-semibold ${tone(n, p.daily_target, d)} ${sel ? 'ring-2 ring-accent ring-offset-1' : ''}`}>
                              {n || ''}
                              {ups > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="day-h" className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-between gap-3 items-end">
              <div>
                <h2 id="day-h" className="m-0 text-xl font-semibold">{fmtDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                <p className="mt-1 mb-0 text-sm text-muted">
                  {person === 'all'
                    ? <>{active.length} of {dayPeople.length} trainer{dayPeople.length === 1 ? '' : 's'} active · {metTarget.length} hit their LeetCode target{isWeekend(selectedDay) ? ' · weekend' : ''}</>
                    : <>Showing one trainer · <button onClick={() => setPerson('all')} className="text-accent bg-transparent border-0 p-0 cursor-pointer text-sm">show everyone</button></>}
                </p>
              </div>
              <label className="text-[13px] text-muted flex items-center gap-2">Jump to date
                <input type="date" className="input w-auto" value={selectedDay} min={days[days.length - 1]} max={days[0]} onChange={(e) => e.target.value && setDay(e.target.value)} />
              </label>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
              {[...dayPeople].sort((a, b) => (solvesOf(b.id, selectedDay).length + updatesOf(b.id, selectedDay).length) - (solvesOf(a.id, selectedDay).length + updatesOf(a.id, selectedDay).length)).map((p) => {
                const solved = solvesOf(p.id, selectedDay)
                const ups = updatesOf(p.id, selectedDay)
                const hit = p.daily_target > 0 && solved.length >= p.daily_target
                return (
                  <article key={p.id} className="card p-5 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-3">
                      <h3 className="m-0 text-base font-semibold">{p.full_name || p.email}</h3>
                      <span className={`px-2.5 py-1 rounded-md text-[13px] font-semibold whitespace-nowrap ${solved.length === 0 ? (isWeekend(selectedDay) ? 'bg-soft text-muted' : 'bg-bad-bg text-bad-fg') : hit ? 'bg-ok-bg text-ok-fg' : 'bg-warn-bg text-warn-fg'}`}>
                        {solved.length} / {p.daily_target} LeetCode
                      </span>
                    </div>
                    {solved.length === 0 && ups.length === 0 ? (
                      <p className="m-0 text-sm text-muted">No activity recorded.</p>
                    ) : (
                      <>
                        {solved.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Problems solved</div>
                            <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                              {solved.map((s) => (
                                <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                                  <DifficultyTag level={s.difficulty} />
                                  <a href={`https://leetcode.com/problems/${s.problem_slug}/`} target="_blank" rel="noreferrer" className="text-ink">{s.title}</a>
                                  {s.source === 'manual' && <span className="text-[11px] text-muted">(logged manually)</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {ups.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Goal updates</div>
                            <ul className="list-none p-0 m-0 flex flex-col gap-2">
                              {ups.map((u) => (
                                <li key={u.id} className="border-l-2 border-accent pl-3 text-sm">
                                  <div className="font-semibold">{u.goal?.title || 'Goal'}{u.progress != null && <span className="text-muted font-normal"> · {u.progress}%</span>}</div>
                                  <div className="text-muted">{u.note}</div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
