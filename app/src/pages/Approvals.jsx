import { useMemo, useState } from 'react'
import { ClipboardCheck, ExternalLink } from 'lucide-react'
import { useMe } from '../lib/me'
import { useTeamData } from '../lib/queries'
import { scopeIds, relDay } from '../lib/insights'
import { istDay, fmtDate } from '../lib/dates'
import { ReviewDialog } from '../components/goals'
import { PersonLink } from '../components/people'
import { Badge, Button, EmptyState, ErrorNote, PageHeader, PageSkeleton, Segmented } from '../components/ui'

export default function Approvals() {
  const me = useMe()
  const { data, error } = useTeamData()
  const [view, setView] = useState('pending')
  const [reviewing, setReviewing] = useState(null)

  const lists = useMemo(() => {
    if (!data) return null
    const ids = scopeIds(me.profile, data)
    const mine = data.goals.filter((g) => ids.has(g.user_id))
    return {
      pending: mine.filter((g) => g.status === 'in_review').sort((a, b) => (a.submitted_at || '').localeCompare(b.submitted_at || '')),
      decided: mine.filter((g) => g.reviewed_at && g.status !== 'in_review').sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at)).slice(0, 50),
    }
  }, [data, me])

  if (error) return <ErrorNote error={error} />
  if (!lists) return <PageSkeleton />
  const person = (id) => data.people.find((p) => p.id === id)
  const reviewer = (id) => data.people.find((p) => p.id === id)?.full_name || 'someone'
  const rows = lists[view]

  return (
    <>
      <PageHeader title="Approvals" subtitle="A goal only counts as completed once you've checked the proof."
        actions={<Segmented label="Show" value={view} onChange={setView} options={[{ value: 'pending', label: `Waiting ${lists.pending.length}` }, { value: 'decided', label: 'Recently decided' }]} />} />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={ClipboardCheck} title={view === 'pending' ? 'Nothing waiting for approval' : 'No decisions yet'}>
          {view === 'pending' ? 'When a trainer finishes a goal and submits proof, it appears here.' : 'Goals you approve or send back show up here.'}
        </EmptyState></div>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-3">
          {rows.map((g) => (
            <li key={g.id} className="card p-4 sm:p-5 flex flex-wrap gap-4 items-start">
              <div className="w-full sm:w-[200px] flex-none"><PersonLink person={person(g.user_id)} size={36} sub={g.skill_area} /></div>
              <div className="flex-1 min-w-[220px]">
                <div className="text-[15px] font-semibold">{g.title}</div>
                <div className="text-xs text-muted mt-0.5">{g.skill} · target {fmtDate(g.target_date)}{g.submitted_at ? ` · submitted ${relDay(istDay(g.submitted_at))}` : ''}</div>
                {g.evidence_url && <a href={g.evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-accent break-all">{g.evidence_url}<ExternalLink size={13} aria-hidden /></a>}
                {g.evidence_note && <p className="m-0 mt-1 text-sm text-ink-2">{g.evidence_note}</p>}
                {view === 'decided' && (
                  <div className="mt-2 text-[13px] text-muted">
                    {g.status === 'completed' ? <Badge tone="ok">Approved</Badge> : g.review_status === 'changes_requested' ? <Badge tone="warn">Changes requested</Badge> : <Badge>Reopened</Badge>}
                    {' '}by {reviewer(g.reviewed_by)} {relDay(istDay(g.reviewed_at))}{g.review_comment ? ` · “${g.review_comment}”` : ''}
                  </div>
                )}
              </div>
              {view === 'pending' && <Button variant="success" onClick={() => setReviewing(g)}>Review</Button>}
            </li>
          ))}
        </ul>
      )}
      {reviewing && <ReviewDialog goal={reviewing} onClose={() => setReviewing(null)} />}
    </>
  )
}
