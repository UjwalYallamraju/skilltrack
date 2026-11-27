import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck, CalendarDays, CircleAlert, CircleCheck, Code, Flame, Hourglass, ListTodo, Moon, NotebookPen, Target, TriangleAlert, Trophy,
} from 'lucide-react'
import { useMe } from '../lib/me'
import { useTeamData } from '../lib/queries'
import { attentionItems, buildIndex, recentWins, relDay, scopeIds, teamPulse, upcoming } from '../lib/insights'
import { daysBetween, fmtDate, todayIST } from '../lib/dates'
import * as api from '../lib/data'
import { ReviewDialog, useAction } from '../components/goals'
import { NoteDialog, PersonLink } from '../components/people'
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, PageSkeleton, Segmented, StatTile } from '../components/ui'

const KIND = {
  review: { label: 'Approval', tone: 'info', icon: Hourglass },
  overdue: { label: 'Overdue goal', tone: 'bad', icon: CircleAlert },
  action: { label: 'Follow-up overdue', tone: 'bad', icon: ListTodo },
  quiet: { label: 'Gone quiet', tone: 'warn', icon: Moon },
  missed: { label: 'LeetCode', tone: 'warn', icon: Code },
  at_risk: { label: 'At risk', tone: 'warn', icon: TriangleAlert },
}
const FILTERS = [
  { value: 'all', label: 'All', kinds: null },
  { value: 'review', label: 'Approvals', kinds: ['review'] },
  { value: 'goals', label: 'Goals', kinds: ['overdue', 'at_risk'] },
  { value: 'people', label: 'People', kinds: ['quiet', 'missed', 'action'] },
]

function inDays(d) {
  const n = daysBetween(todayIST(), d)
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Today() {
  const me = useMe()
  const { data, loading, error } = useTeamData()
  const [groupId, setGroupId] = useState('all')
  const [filter, setFilter] = useState('all')
  const [reviewing, setReviewing] = useState(null)
  const [noting, setNoting] = useState(null)
  const run = useAction()

  const view = useMemo(() => {
    if (!data) return null
    const all = scopeIds(me.profile, data)
    const myGroups = me.isAdmin ? data.groups : data.groups.filter((g) => me.profile.leadGroupIds.includes(g.id))
    const ids = groupId === 'all' ? all : new Set([...all].filter((id) => data.groups.find((g) => g.id === groupId)?.members.some((m) => m.user_id === id)))
    const idx = buildIndex(data)
    return { ids, myGroups, idx, items: attentionItems(ids, idx), pulse: teamPulse(ids, idx, data), soon: upcoming(ids, idx, data), wins: recentWins(ids, idx, data) }
  }, [data, me, groupId])

  if (error) return <ErrorNote error={error} />
  if (!view) return <PageSkeleton />
  const { items, pulse, soon, wins, myGroups } = view
  const shown = items.filter((i) => !FILTERS.find((f) => f.value === filter).kinds || FILTERS.find((f) => f.value === filter).kinds.includes(i.kind))
  const countFor = (f) => items.filter((i) => !f.kinds || f.kinds.includes(i.kind)).length
  const first = (me.profile.full_name || '').split(' ')[0]

  return (
    <>
      <PageHeader
        title={`${greeting()}${first ? `, ${first}` : ''}`}
        subtitle={`${fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })} · ${pulse.people} ${pulse.people === 1 ? 'person' : 'people'} in your care`}
        actions={myGroups.length > 1 && (
          <select className="input w-auto" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Group">
            <option value="all">{me.isAdmin ? 'All groups' : 'All my groups'}</option>
            {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      />

      {pulse.people === 0 ? (
        <div className="card"><EmptyState icon={Target} title="No one to look after yet"
          action={me.isAdmin && <Link to="/settings/groups"><Button>Set up groups</Button></Link>}>
          {me.isAdmin ? 'Once trainers sign up, put them into groups and pick group leads. Everyone you oversee shows up here.' : 'Your admin hasn\'t added anyone to the groups you lead yet.'}
        </EmptyState></div>
      ) : <>
        <section aria-label="Team health" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatTile icon={Code} label="LeetCode consistency" value={pulse.consistencyWeek == null ? '—' : `${pulse.consistencyWeek}%`}
            hint={`weekdays on target this week · ${pulse.hitToday}/${pulse.withTarget} done today`} deltaSuffix=" pts"
            delta={pulse.consistencyWeek != null && pulse.consistencyPrevWeek != null ? pulse.consistencyWeek - pulse.consistencyPrevWeek : null} />
          <StatTile icon={Flame} label="Problems this week" value={pulse.problemsWeek} hint="vs same point last week" delta={pulse.problemsWeek - pulse.problemsPrevWeek} />
          <StatTile icon={BadgeCheck} label="Goals completed" value={pulse.done30} hint="last 30 days vs previous 30" delta={pulse.done30 - pulse.donePrev30} />
          <StatTile icon={Target} label="Active goals" value={pulse.activeGoals}
            hint={`${pulse.overdueGoals} overdue · ${pulse.inReview} awaiting approval`} />
        </section>

        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6 items-start">
          <Card title="Needs your attention" subtitle={items.length ? `${items.length} item${items.length === 1 ? '' : 's'}, most urgent first` : null}
            actions={items.length > 0 && <Segmented label="Filter" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: `${f.label}${countFor(f) ? ` ${countFor(f)}` : ''}` }))} />}
            bodyClass="p-0 pt-3">
            {shown.length === 0 ? (
              <EmptyState icon={CircleCheck} title={items.length ? 'Nothing in this filter' : "You're all caught up"}>
                {items.length ? 'Try another filter.' : 'No approvals waiting, nothing overdue, and everyone is active. Nice.'}
              </EmptyState>
            ) : (
              <ul className="list-none p-0 m-0">
                {shown.map((it) => {
                  const k = KIND[it.kind]
                  return (
                    <li key={it.key} className="flex flex-wrap sm:flex-nowrap items-start gap-3 px-5 py-3.5 border-t border-line">
                      <div className="w-full sm:w-[190px] flex-none"><PersonLink person={it.person} size={34} sub={<Badge tone={k.tone} icon={k.icon}>{k.label}</Badge>} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{it.title}</div>
                        <div className="text-[13px] text-muted">{it.detail}</div>
                      </div>
                      <div className="flex gap-2 flex-none">
                        {it.kind === 'review' && <Button size="sm" variant="success" icon={BadgeCheck} onClick={() => setReviewing(it.goal)}>Review</Button>}
                        {it.kind === 'action' && <Button size="sm" variant="secondary" onClick={() => run(() => api.updateActionItem(it.action.id, { done: true }), 'Marked done', ['actions'])}>Mark done</Button>}
                        {['quiet', 'missed', 'overdue', 'at_risk'].includes(it.kind) && <Button size="sm" variant="secondary" icon={NotebookPen} onClick={() => setNoting(it.person)}>Note</Button>}
                        <Link to={`/people/${encodeURIComponent(it.person.id)}${it.goal ? '?tab=goals' : ''}`}><Button size="sm" variant="ghost">Open</Button></Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <div className="flex flex-col gap-6">
            <Card title="Coming up" subtitle="Deadlines and follow-ups in the next 14 days" bodyClass="px-5 pb-4 pt-2">
              {soon.length === 0 ? <p className="m-0 text-sm text-muted py-2">Nothing due in the next two weeks.</p> : (
                <ul className="list-none p-0 m-0">
                  {soon.slice(0, 8).map((s) => (
                    <li key={s.key} className="flex gap-3 py-2.5 border-t border-line first:border-t-0">
                      <div className="w-11 flex-none text-center rounded-lg bg-canvas py-1">
                        <div className="text-[10px] uppercase text-muted">{fmtDate(s.date, { month: 'short' })}</div>
                        <div className="text-[15px] font-semibold leading-tight">{fmtDate(s.date, { day: 'numeric' })}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{s.title}</div>
                        <div className="text-xs text-muted flex items-center gap-1">
                          {s.kind === 'goal' ? <Target size={12} aria-hidden /> : <ListTodo size={12} aria-hidden />}
                          <Link to={`/people/${encodeURIComponent(s.person.id)}`} className="text-muted">{s.person.full_name}</Link> · {inDays(s.date)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent wins" subtitle="Last 7 days" bodyClass="px-5 pb-4 pt-2">
              {wins.length === 0 ? <p className="m-0 text-sm text-muted py-2 flex items-center gap-2"><CalendarDays size={15} aria-hidden />No completed goals or streak milestones this week yet.</p> : (
                <ul className="list-none p-0 m-0">
                  {wins.slice(0, 6).map((w) => (
                    <li key={w.key} className="flex gap-3 items-start py-2.5 border-t border-line first:border-t-0">
                      <span className="w-8 h-8 rounded-full bg-ok-bg text-ok-fg flex items-center justify-center flex-none"><Trophy size={15} aria-hidden /></span>
                      <div className="min-w-0 text-sm">
                        <Link to={`/people/${encodeURIComponent(w.person.id)}`} className="font-semibold text-ink">{w.person.full_name}</Link>
                        <div className="text-muted text-[13px]">{w.text} · {relDay(w.day)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </>}

      {reviewing && <ReviewDialog goal={reviewing} onClose={() => setReviewing(null)} />}
      {noting && <NoteDialog trainer={noting} onClose={() => setNoting(null)} />}
    </>
  )
}
