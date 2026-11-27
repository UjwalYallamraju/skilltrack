import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity, ArrowLeft, BadgeCheck, CircleCheck, Code, ExternalLink, Flag, Flame, LayoutGrid, ListTodo, Mail, MessageSquare, NotebookPen, Plus, Target, UserX,
} from 'lucide-react'
import { useMe } from '../lib/me'
import { useNotes, useTeamData } from '../lib/queries'
import { activityFeed, attentionItems, buildIndex, groupsOf, personStats, relDay } from '../lib/insights'
import { canReview } from '../lib/permissions'
import * as api from '../lib/data'
import { fmtDate, fmtDateTime } from '../lib/dates'
import { GoalCard, GoalFormDialog, useAction } from '../components/goals'
import { DifficultyTag, Heatmap } from '../components/leetcode'
import { ActionItems, NoteDialog, NotesList } from '../components/people'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, PageSkeleton, StatTile, Tabs } from '../components/ui'

export default function Person() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const me = useMe()
  const { data, error } = useTeamData()
  const person = data?.people.find((p) => p.id === id)
  const reviewer = !!person && canReview(me, person.id, data.groups)
  const isMe = person?.id === me.profile.id
  const notes = useNotes(reviewer || isMe ? id : null).data || []
  const [noting, setNoting] = useState(false)
  const [adding, setAdding] = useState(false)

  const view = useMemo(() => {
    if (!data || !person) return null
    const idx = buildIndex(data)
    const s = personStats(person, idx)
    return { s, idx, groups: groupsOf(person.id, data.groups), items: attentionItems(new Set([person.id]), idx), lc: idx.lcBy.get(person.id) }
  }, [data, person])

  if (error) return <ErrorNote error={error} />
  if (!data) return <PageSkeleton />
  if (!person) return <div className="card"><EmptyState icon={UserX} title="Person not found" action={<Link to="/team"><Button variant="secondary">Back to team</Button></Link>}>They may have left, or they're not in a group you can see.</EmptyState></div>

  const { s, groups, items, lc } = view
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'goals', label: 'Goals', icon: Target, count: s.goals.active.length + s.goals.inReview.length },
    ...(reviewer || isMe ? [{ id: 'oneonone', label: '1:1 & follow-ups', icon: NotebookPen, count: s.actions.open.length }] : []),
    { id: 'activity', label: 'Activity', icon: Activity },
  ]

  return (
    <>
      <Link to={me.isManager ? '/team' : '/team'} className="inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-ink mb-4 no-print"><ArrowLeft size={15} aria-hidden />Team</Link>

      <header className="card p-5 flex flex-wrap items-center gap-4 mb-5">
        <Avatar name={person.full_name || person.email} size={60} />
        <div className="flex-1 min-w-[220px]">
          <h1 className="m-0 text-[22px] font-semibold tracking-tight">{person.full_name || person.email}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[13px] text-muted">
            <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 text-muted"><Mail size={14} aria-hidden />{person.email}</a>
            {person.leetcode_username && <a href={`https://leetcode.com/u/${person.leetcode_username}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted"><Code size={14} aria-hidden />@{person.leetcode_username}<ExternalLink size={12} aria-hidden /></a>}
            <span>Joined {fmtDate(person.created_at)}</span>
            <span>Last active {relDay(s.lastActive)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {person.role === 'admin' && <Badge tone="info">Admin</Badge>}
            {groups.map((g) => <Badge key={g.id}>{g.name}{g.members.find((m) => m.user_id === person.id)?.is_lead ? ' · lead' : ''}</Badge>)}
            {!groups.length && <Badge>No group</Badge>}
          </div>
        </div>
        {reviewer && (
          <div className="flex flex-wrap gap-2 no-print">
            <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Assign goal</Button>
            <Button icon={NotebookPen} onClick={() => setNoting(true)}>1:1 note</Button>
          </div>
        )}
      </header>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'overview' && (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-label="Summary">
            <StatTile icon={Code} label="LeetCode today" value={`${s.today}/${s.target}`} hint={s.target ? (s.today >= s.target ? 'Target met' : `Previous weekday: ${s.yesterday}`) : 'No daily target'} />
            <StatTile icon={Flame} label="Weekday streak" value={s.streak} hint={`${s.week} problems in 7 days`} />
            <StatTile icon={Target} label="Active goals" value={s.goals.active.length} hint={s.goals.avgProgress != null ? `${s.goals.avgProgress}% average progress` : 'Nothing in progress'} />
            <StatTile icon={BadgeCheck} label="Goals completed" value={s.goals.completed.length} hint={`${lc?.total ?? 0} LeetCode problems all-time`} />
          </section>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
            <div className="flex flex-col gap-5 min-w-0">
              <Card title="LeetCode activity" subtitle={`Daily target: ${s.target} · weekends don't break the streak`}
                actions={reviewer && <TargetEditor person={person} />}>
                <Heatmap personId={person.id} solves={data.solves} target={s.target} weeks={26} joined={s.joined} />
                {lc && <div className="flex gap-4 mt-3 text-[13px] text-muted"><span>{lc.easy} easy</span><span>{lc.medium} medium</span><span>{lc.hard} hard</span>{lc.synced_at && <span>Synced {fmtDateTime(lc.synced_at)}</span>}</div>}
              </Card>
              <Card title="Goals in progress" actions={<Button size="sm" variant="ghost" onClick={() => setTab('goals')}>All goals</Button>} bodyClass="px-5 pb-4 pt-2">
                {s.goals.active.length === 0 ? <p className="text-sm text-muted m-0 py-2">No active goals.</p> : (
                  <ul className="list-none p-0 m-0">
                    {s.goals.active.map((g) => (
                      <li key={g.id} className="py-2.5 border-t border-line first:border-t-0 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <div className="text-sm font-semibold">{g.title}</div>
                          <div className="text-xs text-muted">{g.skill_area} · due {fmtDate(g.target_date)}</div>
                        </div>
                        <div className="w-32 flex items-center gap-2"><div className="flex-1 h-2 bg-soft rounded-full overflow-hidden"><div className="h-2 bg-accent rounded-full" style={{ width: `${g.progress}%` }} /></div><span className="text-xs tabular-nums">{g.progress}%</span></div>
                        <GoalStatus g={g} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <div className="flex flex-col gap-5">
              {(me.isManager && !isMe) && (
                <Card title="Needs attention" bodyClass="px-5 pb-4 pt-2">
                  {items.length === 0 ? <p className="m-0 text-sm text-muted py-2 flex gap-2 items-center"><CircleCheck size={16} className="text-ok" aria-hidden />Nothing needs you right now.</p> : (
                    <ul className="list-none p-0 m-0">
                      {items.map((it) => (
                        <li key={it.key} className="py-2.5 border-t border-line first:border-t-0">
                          <div className="text-sm font-semibold">{it.title}</div>
                          <div className="text-xs text-muted">{it.detail}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              {(reviewer || isMe) && <ActionItems trainer={person} canManage={reviewer} showDone={false} title="Open follow-ups" />}
              {(reviewer || isMe) && notes[0] && (
                <Card title="Last 1:1" subtitle={fmtDate(notes[0].meeting_date)} actions={<Button size="sm" variant="ghost" onClick={() => setTab('oneonone')}>All notes</Button>}>
                  <p className="m-0 text-sm whitespace-pre-line line-clamp-6">{notes[0].body}</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'goals' && <GoalsTab goals={s.goals} reviewer={reviewer} isMe={isMe} onAdd={() => setAdding(true)} />}

      {tab === 'oneonone' && (reviewer || isMe) && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          <NotesList trainer={person} canWrite={reviewer} />
          <ActionItems trainer={person} canManage={reviewer} />
        </div>
      )}

      {tab === 'activity' && <ActivityTab person={person} data={data} notes={reviewer || isMe ? notes : []} />}

      {noting && <NoteDialog trainer={person} onClose={() => setNoting(false)} />}
      {adding && <GoalFormDialog forUser={person} onClose={() => setAdding(false)} />}
    </>
  )
}

function GoalStatus({ g }) {
  const tone = { overdue: 'bad', at_risk: 'warn', on_track: 'ok', in_review: 'info', not_started: 'neutral' }[g.status]
  const label = { overdue: 'Overdue', at_risk: 'At risk', on_track: 'On track', in_review: 'Awaiting approval', not_started: 'Not started' }[g.status]
  return <Badge tone={tone} icon={g.flagged_by_trainer ? Flag : undefined}>{label}</Badge>
}

function TargetEditor({ person }) {
  const [v, setV] = useState(String(person.daily_target))
  const run = useAction()
  const dirty = Number(v) !== person.daily_target
  return (
    <form className="flex items-center gap-2 no-print" onSubmit={(e) => { e.preventDefault(); run(() => api.updateProfile(person.id, { daily_target: Number(v) }), 'Daily target updated', ['profiles', 'lcSummary']) }}>
      <label className="text-xs text-muted" htmlFor="target">Target/day</label>
      <select id="target" className="input h-8 w-[76px] py-0 pl-3 pr-7" value={v} onChange={(e) => setV(e.target.value)}>
        {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {dirty && <Button size="sm" type="submit">Save</Button>}
    </form>
  )
}

function GoalsTab({ goals, reviewer, isMe, onAdd }) {
  const sections = [
    ['Awaiting approval', goals.inReview],
    ['In progress', goals.active.filter((g) => g.status !== 'in_review')],
    ['Completed', goals.completed],
  ].filter(([, list]) => list.length)
  if (!sections.length) return <div className="card"><EmptyState icon={Target} title="No goals yet" action={reviewer && <Button icon={Plus} onClick={onAdd}>Assign a goal</Button>}>Goals the trainer sets, or you assign, show up here.</EmptyState></div>
  return (
    <div className="flex flex-col gap-6">
      {sections.map(([title, list]) => (
        <section key={title}>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">{title} · {list.length}</h2>
          <div className="grid xl:grid-cols-2 gap-4">{list.map((g) => <GoalCard key={g.id} goal={g} owner={isMe} reviewer={reviewer} />)}</div>
        </section>
      ))}
    </div>
  )
}

const FEED = {
  leetcode: { icon: Code, color: 'bg-accent-soft text-accent-dark' },
  update: { icon: Activity, color: 'bg-soft text-ink-2' },
  goal_created: { icon: Plus, color: 'bg-soft text-ink-2' },
  goal_submitted: { icon: ListTodo, color: 'bg-info-bg text-info-fg' },
  goal_completed: { icon: BadgeCheck, color: 'bg-ok-bg text-ok-fg' },
  note: { icon: NotebookPen, color: 'bg-warn-bg text-warn-fg' },
  comment: { icon: MessageSquare, color: 'bg-soft text-ink-2' },
}
function ActivityTab({ person, data, notes }) {
  const [limit, setLimit] = useState(40)
  const feed = useMemo(() => activityFeed(person.id, data, [], notes), [person.id, data, notes])
  const goalBy = new Map(data.goals.map((g) => [g.id, g]))
  if (!feed.length) return <div className="card"><EmptyState icon={Activity} title="No activity yet" /></div>
  let lastDay = null
  return (
    <div className="card p-5">
      <ol className="list-none p-0 m-0">
        {feed.slice(0, limit).map((it) => {
          const head = it.day !== lastDay ? (lastDay = it.day) : null
          const F = FEED[it.kind]
          return (
            <li key={it.key}>
              {head && <div className="text-xs font-semibold text-muted uppercase tracking-wide mt-4 first:mt-0 mb-2">{relDay(head) === 'today' || relDay(head) === 'yesterday' ? relDay(head) : fmtDate(head, { weekday: 'short', day: 'numeric', month: 'short' })}</div>}
              <div className="flex gap-3 py-2">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-none ${F.color}`}><F.icon size={15} aria-hidden /></span>
                <div className="min-w-0 text-sm pt-1">
                  {it.kind === 'leetcode' && <><b>Solved {it.list.length} problem{it.list.length > 1 ? 's' : ''}</b><div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">{it.list.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5 text-[13px] text-muted"><DifficultyTag level={s.difficulty} />{s.title}</span>)}</div></>}
                  {it.kind === 'update' && <><b>Progress {it.update.progress}%</b> on {goalBy.get(it.update.goal_id)?.title || 'a goal'}<div className="text-muted text-[13px]">{it.update.note}</div></>}
                  {it.kind === 'goal_created' && <>Set a goal: <b>{it.goal.title}</b> <span className="text-muted">(due {fmtDate(it.goal.target_date)})</span></>}
                  {it.kind === 'goal_submitted' && <>Submitted <b>{it.goal.title}</b> for approval</>}
                  {it.kind === 'goal_completed' && <>Completed <b>{it.goal.title}</b></>}
                  {it.kind === 'note' && <><b>1:1 note</b>{!it.note.shared && <span className="text-muted"> · private</span>}<div className="text-muted text-[13px] line-clamp-2">{it.note.body}</div></>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {feed.length > limit && <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + 40)}>Show more</Button></div>}
    </div>
  )
}
