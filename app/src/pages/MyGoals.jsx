import { useCallback, useEffect, useState } from 'react'
import { getGoalUpdates, getGoals, getLeetcodeSummary, getSkillAreas, getSolvesSince } from '../lib/data'
import { fmtDate } from '../lib/dates'
import { Empty, ErrorNote, Spinner } from '../components/ui'
import GoalCard from '../components/GoalCard'
import GoalForm from '../components/GoalForm'
import LeetCodeCard from '../components/LeetCodeCard'

export default function MyGoals({ profile, reloadProfile }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('active')

  const load = useCallback(async () => {
    try {
      const [areas, goals, summary, solves] = await Promise.all([
        getSkillAreas(), getGoals(profile.id), getLeetcodeSummary(), getSolvesSince(7, profile.id),
      ])
      const updates = await getGoalUpdates(goals.map((g) => g.id))
      setData({ areas, goals, updates, summary: summary.find((s) => s.user_id === profile.id), solves })
    } catch (e) { setError(e) }
  }, [profile.id])

  useEffect(() => { load() }, [load])

  if (error) return <ErrorNote error={error} />
  if (!data) return <Spinner />

  const { areas, goals, updates, summary, solves } = data
  const active = goals.filter((g) => g.status !== 'completed')
  const done = goals.filter((g) => g.status === 'completed')
  const shown = filter === 'active' ? active : filter === 'completed' ? done : goals
  const next = active.map((g) => g.target_date).sort()[0]

  const pill = (k, label) => (
    <button onClick={() => setFilter(k)} aria-pressed={filter === k}
      className={`h-10 px-3.5 rounded-lg text-sm cursor-pointer border-0 ${filter === k ? 'bg-white font-semibold' : 'bg-transparent text-muted'}`}>{label}</button>
  )

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <div className="flex-[999_1_520px] min-w-0 flex flex-col gap-5">
        <header className="flex flex-wrap gap-4 items-end justify-between">
          <div>
            <h1 className="m-0 font-display text-3xl">My Goals</h1>
            <p className="mt-1.5 mb-0 text-muted text-sm">
              {active.length} active · {done.length} completed{next ? ` · next deadline ${fmtDate(next, { day: 'numeric', month: 'short' })}` : ''}
            </p>
          </div>
          <div role="group" aria-label="Filter goals" className="flex gap-1 bg-[#E9ECF1] p-1 rounded-[10px]">
            {pill('active', 'Active')}{pill('completed', 'Completed')}{pill('all', 'All')}
          </div>
        </header>

        <LeetCodeCard profile={profile} summary={summary} solves={solves} onChange={load} reloadProfile={reloadProfile} />

        {shown.length === 0 ? (
          <Empty>{goals.length === 0 ? 'No goals yet. Add your first upskilling goal using the form.' : 'Nothing in this view.'}</Empty>
        ) : shown.map((g) => (
          <GoalCard key={g.id} goal={g} areas={areas} editable onChange={load}
            updates={updates.filter((u) => u.goal_id === g.id)} />
        ))}
      </div>

      <aside aria-labelledby="new-h" className="flex-[1_1_340px] max-w-[420px] max-lg:max-w-none card p-6 lg:sticky lg:top-6">
        <h2 id="new-h" className="mt-0 mb-4 text-lg font-semibold">Add a new goal</h2>
        <GoalForm userId={profile.id} areas={areas} onSaved={load} compact />
        <p className="mt-4 mb-0 text-xs text-muted">Goals are flagged “At risk” automatically when the target date is within 21 days and progress is under 50%. You can also flag one yourself.</p>
      </aside>
    </div>
  )
}
