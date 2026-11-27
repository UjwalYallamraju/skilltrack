import { useMemo, useState } from 'react'
import { Eye, Plus, Target } from 'lucide-react'
import { useMe } from '../lib/me'
import { useNotes, useTeamData } from '../lib/queries'
import { buildIndex, personStats } from '../lib/insights'
import { fmtDate } from '../lib/dates'
import { GoalCard, GoalFormDialog } from '../components/goals'
import { MyLeetCode } from '../components/leetcode'
import { ActionItems } from '../components/people'
import { Button, Card, EmptyState, ErrorNote, PageHeader, PageSkeleton, Segmented } from '../components/ui'

export default function MyWork() {
  const me = useMe()
  const { profile } = me
  const { data, error } = useTeamData()
  const notes = (useNotes(profile.id).data || []).filter((n) => n.shared)
  const [adding, setAdding] = useState(false)
  const [show, setShow] = useState('active')

  const view = useMemo(() => {
    if (!data) return null
    const idx = buildIndex(data)
    const p = data.people.find((x) => x.id === profile.id) || profile
    return { p, s: personStats(p, idx), lc: idx.lcBy.get(profile.id) }
  }, [data, profile])

  if (error) return <ErrorNote error={error} />
  if (!view) return <PageSkeleton />
  const { p, s, lc } = view
  const changes = s.goals.all.filter((g) => g.review_status === 'changes_requested' && g.status !== 'completed')
  const goals = show === 'active' ? s.goals.all.filter((g) => g.status !== 'completed') : s.goals.completed
  const first = (profile.full_name || '').split(' ')[0]
  const open = data.actions.filter((a) => a.trainer_id === profile.id && !a.done).length

  return (
    <>
      <PageHeader title={first ? `Hi ${first}` : 'My work'}
        subtitle={[
          `${s.goals.active.length} active goal${s.goals.active.length === 1 ? '' : 's'}`,
          open ? `${open} follow-up${open === 1 ? '' : 's'} from your lead` : null,
          changes.length ? `${changes.length} sent back for changes` : null,
        ].filter(Boolean).join(' · ')}
        actions={<Button icon={Plus} onClick={() => setAdding(true)}>New goal</Button>} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <MyLeetCode profile={p} stats={s} lcRow={lc} solves={data.solves} reloadProfile={me.reloadProfile} />

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="m-0 text-[17px] font-semibold">My goals</h2>
              <Segmented label="Show goals" value={show} onChange={setShow}
                options={[{ value: 'active', label: `Active ${s.goals.all.length - s.goals.completed.length}` }, { value: 'done', label: `Completed ${s.goals.completed.length}` }]} />
            </div>
            {goals.length === 0 ? (
              <div className="card"><EmptyState icon={Target} title={show === 'active' ? 'No active goals' : 'Nothing completed yet'}
                action={show === 'active' && <Button icon={Plus} onClick={() => setAdding(true)}>Set a goal</Button>}>
                {show === 'active' ? 'Pick one skill to grow and a date to finish by. When you are done, submit proof and your lead approves it.' : 'Goals your lead approves land here.'}
              </EmptyState></div>
            ) : (
              <div className="grid 2xl:grid-cols-2 gap-4">{goals.map((g) => <GoalCard key={g.id} goal={g} owner />)}</div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <ActionItems trainer={p} canManage={false} title="From your lead" />
          <Card title="Shared 1:1 notes" bodyClass="px-5 pb-4 pt-2">
            {notes.length === 0 ? <p className="m-0 text-sm text-muted py-2">Notes your lead shares with you appear here.</p> : (
              <ul className="list-none p-0 m-0">
                {notes.slice(0, 5).map((n) => (
                  <li key={n.id} className="py-3 border-t border-line first:border-t-0">
                    <div className="text-xs text-muted flex items-center gap-1 mb-1"><Eye size={12} aria-hidden />{fmtDate(n.meeting_date)}</div>
                    <p className="m-0 text-sm whitespace-pre-line line-clamp-5">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {adding && <GoalFormDialog onClose={() => setAdding(false)} />}
    </>
  )
}
