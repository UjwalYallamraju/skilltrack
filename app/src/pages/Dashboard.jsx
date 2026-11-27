import { useCallback, useEffect, useMemo, useState } from 'react'
import { download, getGoalUpdates, getGoals, getLeetcodeSummary, getProfiles, getSkillAreas, getSolvesSince, toCsv } from '../lib/data'
import { addDays, daysBetween, fmtDate, fmtDateTime, todayIST } from '../lib/dates'
import { Button, Empty, ErrorNote, Kpi, Modal, Spinner, STATUS, StatusBadge } from '../components/ui'
import GoalCard, { statusNote } from '../components/GoalCard'
import { SevenDayBars, lastSevenDays } from '../components/LeetCodeCard'

const STATUS_ORDER = ['overdue', 'at_risk', 'on_track', 'not_started', 'completed']

export default function Dashboard({ profile }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [area, setArea] = useState('all')
  const [openTrainer, setOpenTrainer] = useState(null)
  const isAdmin = profile.role === 'admin'

  const load = useCallback(async () => {
    try {
      const [areas, people, goals, lc, solves] = await Promise.all([
        getSkillAreas(), getProfiles(), getGoals(), getLeetcodeSummary(), getSolvesSince(7),
      ])
      setData({ areas, people, goals, lc, solves })
    } catch (e) { setError(e) }
  }, [])
  useEffect(() => { load() }, [load])

  const view = useMemo(() => {
    if (!data) return null
    const today = todayIST()
    const goals = area === 'all' ? data.goals : data.goals.filter((g) => String(g.skill_area_id) === area)
    const areas = area === 'all' ? data.areas : data.areas.filter((a) => String(a.id) === area)
    const active = goals.filter((g) => g.status !== 'completed')
    const m = Number(today.slice(5, 7))
    const qStart = `${today.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, '0')}-01`
    const count = (s) => goals.filter((g) => g.status === s).length
    // people shown: trainers, plus anyone (e.g. admin) who has goals
    const people = data.people.filter((p) => p.role === 'trainer' || data.goals.some((g) => g.user_id === p.id))
    return {
      today, goals, areas, people,
      kpis: [
        { label: 'Active goals', value: active.length, dot: '#5B6170' },
        { label: 'On track', value: count('on_track') + count('not_started'), dot: '#1F8A5B' },
        { label: 'At risk', value: count('at_risk'), dot: '#D9822B' },
        { label: 'Overdue', value: count('overdue'), dot: '#C23B3B' },
        { label: 'Completed this quarter', value: goals.filter((g) => g.status === 'completed' && g.completed_at && g.completed_at.slice(0, 10) >= qStart).length, dot: '#3B4BD8' },
      ],
      due: active.filter((g) => g.target_date >= today && g.target_date <= addDays(today, 30)).sort((a, b) => a.target_date.localeCompare(b.target_date)),
      attention: active.filter((g) => g.status === 'overdue' || g.status === 'at_risk')
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.target_date.localeCompare(b.target_date)),
    }
  }, [data, area])

  if (error) return <ErrorNote error={error} />
  if (!view) return <Spinner />

  const lcRows = data.lc.filter((r) => view.people.some((p) => p.id === r.user_id))
  const solvedToday = lcRows.filter((r) => r.daily_target > 0 && r.today >= r.daily_target).length
  const weekTotal = lcRows.reduce((s, r) => s + r.last_7_days, 0)

  function exportCsv() {
    const csv = toCsv(view.goals, [
      { label: 'Trainer', get: (g) => g.owner_name },
      { label: 'Skill area', get: (g) => g.skill_area },
      { label: 'Skill', get: (g) => g.skill },
      { label: 'Goal', get: (g) => g.title },
      { label: 'Start date', get: (g) => g.start_date },
      { label: 'Target date', get: (g) => g.target_date },
      { label: 'Progress %', get: (g) => g.progress },
      { label: 'Status', get: (g) => STATUS[g.status]?.label },
      { label: 'Completed at', get: (g) => (g.completed_at ? g.completed_at.slice(0, 10) : '') },
    ])
    download(`skilltrack-goals-${view.today}.csv`, csv)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h1 className="m-0 font-display text-3xl">Team Dashboard</h1>
          <p className="mt-1.5 mb-0 text-muted text-sm">Upskilling goals and daily practice across {view.people.length} trainer{view.people.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-[13px] text-muted flex items-center gap-2">Skill area
            <select className="input w-auto" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="all">All areas</option>
              {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <Button variant="secondary" onClick={exportCsv}>Export to Excel (CSV)</Button>
        </div>
      </header>

      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        {view.kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </section>

      <section aria-labelledby="matrix-h" className="card px-6 py-5">
        <div className="flex flex-wrap justify-between gap-3 items-baseline">
          <h2 id="matrix-h" className="m-0 text-[17px] font-semibold">Who's working on what</h2>
          <Legend />
        </div>
        {view.people.length === 0 ? <p className="text-sm text-muted mb-0">No trainers have signed up yet.</p> : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-2 border-b border-line font-semibold">Trainer</th>
                  {view.areas.map((a) => <th key={a.id} className="py-2.5 px-2 border-b border-line font-semibold">{a.name}</th>)}
                  <th className="py-2.5 px-2 border-b border-line font-semibold">Avg. progress</th>
                </tr>
              </thead>
              <tbody>
                {view.people.map((p) => {
                  const mine = view.goals.filter((g) => g.user_id === p.id)
                  const act = mine.filter((g) => g.status !== 'completed')
                  const avg = act.length ? Math.round(act.reduce((s, g) => s + g.progress, 0) / act.length) : null
                  return (
                    <tr key={p.id}>
                      <td className="py-3 px-2 border-b border-soft align-top">
                        <button onClick={() => setOpenTrainer(p)} className="font-semibold text-ink bg-transparent border-0 p-0 cursor-pointer hover:text-accent text-left">{p.full_name || p.email}</button>
                      </td>
                      {view.areas.map((a) => {
                        const cell = mine.filter((g) => g.skill_area_id === a.id)
                        return (
                          <td key={a.id} className="py-2 px-2 border-b border-soft align-top">
                            {cell.length === 0 ? <span className="text-[#8A90A0]">—</span> : (
                              <div className="flex flex-col gap-1 items-start">
                                {cell.map((g) => <StatusBadge key={g.id} status={g.status}>{g.skill}{g.status === 'completed' ? ' · done' : ''}</StatusBadge>)}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2 px-2 border-b border-soft align-top min-w-[140px]">
                        {avg == null ? <span className="text-[#8A90A0]">—</span> : (
                          <div className="flex items-center gap-2 pt-1.5">
                            <div className="flex-1 h-2 bg-soft rounded overflow-hidden"><div className="h-2 bg-accent" style={{ width: `${avg}%` }} /></div>
                            <span className="text-[13px] text-muted w-9">{avg}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="lc-h" className="card px-6 py-5">
        <div className="flex flex-wrap justify-between gap-3 items-baseline">
          <div>
            <h2 id="lc-h" className="m-0 text-[17px] font-semibold">Daily LeetCode practice</h2>
            <p className="mt-1 mb-0 text-[13px] text-muted">Streaks count weekdays only, against each trainer's own daily target</p>
          </div>
          <div className="text-[13px] text-muted"><b className="text-ink">{solvedToday} of {lcRows.filter((r) => r.daily_target > 0).length}</b> hit today's target · <b className="text-ink">{weekTotal}</b> problems in the last 7 days</div>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide">
                {['Trainer', 'Today / target', 'Streak', 'Last 7 days', '7-day total', 'Easy / Med / Hard (total)', 'Last sync'].map((h) => (
                  <th key={h} className="py-2.5 px-2 border-b border-line font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lcRows.map((r) => {
                const hit = r.daily_target > 0 && r.today >= r.daily_target
                return (
                  <tr key={r.user_id}>
                    <td className="py-3 px-2 border-b border-soft">
                      <div className="font-semibold">{r.full_name}</div>
                      <div className="text-xs text-muted">{r.leetcode_username ? <a className="text-muted" href={`https://leetcode.com/u/${r.leetcode_username}/`} target="_blank" rel="noreferrer">@{r.leetcode_username}</a> : 'Not linked'}</div>
                    </td>
                    <td className="py-2 px-2 border-b border-soft">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[13px] font-semibold ${hit ? 'bg-ok-bg text-ok-fg' : r.today > 0 ? 'bg-warn-bg text-warn-fg' : 'bg-bad-bg text-bad-fg'}`}>
                        {r.today} / {r.daily_target}
                      </span>
                    </td>
                    <td className="py-2 px-2 border-b border-soft font-semibold">{r.streak} day{r.streak === 1 ? '' : 's'}</td>
                    <td className="py-2 px-2 border-b border-soft"><SevenDayBars counts={lastSevenDays(data.solves, r.user_id)} target={r.daily_target} /></td>
                    <td className="py-2 px-2 border-b border-soft font-semibold">{r.last_7_days}</td>
                    <td className="py-2 px-2 border-b border-soft text-muted">
                      <b className="text-ok-fg">{r.easy}</b> / <b className="text-warn-fg">{r.medium}</b> / <b className="text-bad-fg">{r.hard}</b> <span className="text-ink">({r.total})</span>
                    </td>
                    <td className="py-2 px-2 border-b border-soft text-xs text-muted">{r.synced_at ? fmtDateTime(r.synced_at) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] max-sm:grid-cols-1 gap-6">
        <section aria-labelledby="due-h" className="card px-6 py-5">
          <h2 id="due-h" className="mt-0 mb-3 text-[17px] font-semibold">Deadlines in the next 30 days</h2>
          {view.due.length === 0 ? <p className="text-sm text-muted m-0">No deadlines coming up.</p> : view.due.map((g) => (
            <div key={g.id} className="flex gap-3.5 items-center py-3 border-t border-soft">
              <div className="w-[52px] text-center flex-none">
                <div className="text-[11px] text-muted uppercase">{fmtDate(g.target_date, { month: 'short' })}</div>
                <div className="font-display text-[22px] font-bold">{fmtDate(g.target_date, { day: '2-digit' })}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{g.title}</div>
                <div className="text-[13px] text-muted">{g.owner_name} · {g.skill_area} · {daysBetween(view.today, g.target_date)} days left</div>
              </div>
              <StatusBadge status={g.status}>{g.progress}%</StatusBadge>
            </div>
          ))}
        </section>
        <section aria-labelledby="risk-h" className="card px-6 py-5">
          <h2 id="risk-h" className="mt-0 mb-3 text-[17px] font-semibold">Needs attention</h2>
          {view.attention.length === 0 ? <p className="text-sm text-muted m-0">Nothing overdue or at risk.</p> : view.attention.map((g) => (
            <div key={g.id} className="py-3 border-t border-soft flex gap-3 items-start">
              <StatusBadge status={g.status} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{g.title}</div>
                <div className="text-[13px] text-muted">{g.owner_name} · {statusNote(g)}</div>
              </div>
            </div>
          ))}
        </section>
      </div>

      {openTrainer && (
        <TrainerDetail person={openTrainer} goals={data.goals.filter((g) => g.user_id === openTrainer.id)} areas={data.areas}
          editable={isAdmin} onClose={() => setOpenTrainer(null)} onChange={load} />
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {[['On track', '#1F8A5B'], ['At risk', '#D9822B'], ['Overdue', '#C23B3B'], ['Completed', '#3B4BD8'], ['Not started', '#8A90A0']].map(([l, c]) => (
        <span key={l} className="flex gap-1.5 items-center"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>
      ))}
    </div>
  )
}

function TrainerDetail({ person, goals, areas, editable, onClose, onChange }) {
  const [updates, setUpdates] = useState([])
  useEffect(() => { getGoalUpdates(goals.map((g) => g.id)).then(setUpdates).catch(() => {}) }, [goals])
  const sorted = [...goals].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
  return (
    <Modal title={`${person.full_name || person.email} · goals`} onClose={onClose} wide>
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
        {sorted.length === 0 ? <Empty>No goals yet.</Empty> : sorted.map((g) => (
          <GoalCard key={g.id} goal={g} areas={areas} editable={editable} onChange={onChange}
            updates={updates.filter((u) => u.goal_id === g.id)} />
        ))}
      </div>
    </Modal>
  )
}
