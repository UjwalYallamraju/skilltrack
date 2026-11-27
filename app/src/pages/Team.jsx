import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Download, Search, Users } from 'lucide-react'
import { useMe } from '../lib/me'
import { useTeamData } from '../lib/queries'
import { attentionScore, buildIndex, groupsOf, personStats, QUIET_WEEKDAYS, relDay, scopeIds, teammateIds } from '../lib/insights'
import { download, toCsv } from '../lib/data'
import { todayIST } from '../lib/dates'
import { StreakPill, WeekBars } from '../components/leetcode'
import { PersonLink } from '../components/people'
import { Badge, Button, EmptyState, ErrorNote, PageHeader, PageSkeleton, ProgressBar } from '../components/ui'

const COLS = [
  { id: 'name', label: 'Trainer', sort: (r) => (r.p.full_name || '').toLowerCase() },
  { id: 'today', label: 'Today', sort: (r) => (r.s.target ? r.s.today / r.s.target : -1), num: true },
  { id: 'streak', label: 'Streak', sort: (r) => r.s.streak, num: true },
  { id: 'week', label: 'Last 7 days', sort: (r) => r.s.week, num: true },
  { id: 'goals', label: 'Goals', sort: (r) => r.s.goals.avgProgress ?? -1, num: true },
  { id: 'active', label: 'Last active', sort: (r) => r.s.lastActive || '' },
  { id: 'health', label: 'Needs', sort: (r) => r.score, num: true },
]

function Health({ s }) {
  const tags = []
  if (s.goals.inReview.length) tags.push(<Badge key="r" tone="info">{s.goals.inReview.length} to approve</Badge>)
  if (s.goals.overdue.length) tags.push(<Badge key="o" tone="bad">{s.goals.overdue.length} overdue</Badge>)
  if (s.actions.overdue.length) tags.push(<Badge key="a" tone="bad">{s.actions.overdue.length} follow-up{s.actions.overdue.length > 1 ? 's' : ''} late</Badge>)
  if (s.quiet >= QUIET_WEEKDAYS) tags.push(<Badge key="q" tone="warn">Quiet {s.quiet}d</Badge>)
  if (s.goals.atRisk.length) tags.push(<Badge key="k" tone="warn">{s.goals.atRisk.length} at risk</Badge>)
  if (!tags.length) return <Badge tone="ok">All good</Badge>
  return <div className="flex flex-wrap gap-1">{tags}</div>
}

export default function Team() {
  const me = useMe()
  const nav = useNavigate()
  const { data, error } = useTeamData()
  const [q, setQ] = useState('')
  const [groupId, setGroupId] = useState('all')
  const [sort, setSort] = useState({ id: me.isManager ? 'health' : 'name', dir: me.isManager ? -1 : 1 })

  const view = useMemo(() => {
    if (!data) return null
    const idx = buildIndex(data)
    // Managers see the people they look after; trainers see teammates in their groups (RLS already limits rows)
    const ids = me.isManager ? scopeIds(me.profile, data) : teammateIds(me.profile, data)
    const groups = me.isAdmin ? data.groups : data.groups.filter((g) => g.members.some((m) => m.user_id === me.profile.id))
    const rows = data.people.filter((p) => ids.has(p.id) || (!me.isManager && p.id === me.profile.id)).map((p) => {
      const s = personStats(p, idx)
      return { p, s, score: attentionScore(s), groups: groupsOf(p.id, data.groups) }
    })
    return { rows, groups }
  }, [data, me])

  if (error) return <ErrorNote error={error} />
  if (!view) return <PageSkeleton />

  const needle = q.trim().toLowerCase()
  const col = COLS.find((c) => c.id === sort.id)
  const rows = view.rows
    .filter((r) => groupId === 'all' || r.groups.some((g) => g.id === groupId))
    .filter((r) => !needle || `${r.p.full_name} ${r.p.email} ${r.p.leetcode_username || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })

  function exportCsv() {
    download(`team-${todayIST()}.csv`, toCsv(rows, [
      { label: 'Name', get: (r) => r.p.full_name }, { label: 'Email', get: (r) => r.p.email },
      { label: 'Groups', get: (r) => r.groups.map((g) => g.name).join('; ') }, { label: 'LeetCode', get: (r) => r.p.leetcode_username || '' },
      { label: 'Daily target', get: (r) => r.s.target }, { label: 'Solved today', get: (r) => r.s.today }, { label: 'Streak', get: (r) => r.s.streak },
      { label: 'Last 7 days', get: (r) => r.s.week }, { label: 'Total solved', get: (r) => r.s.totalSolved },
      { label: 'Active goals', get: (r) => r.s.goals.active.length }, { label: 'Avg progress %', get: (r) => r.s.goals.avgProgress ?? '' },
      { label: 'Overdue goals', get: (r) => r.s.goals.overdue.length }, { label: 'Completed goals', get: (r) => r.s.goals.completed.length },
      { label: 'Last active', get: (r) => r.s.lastActive || '' },
    ]))
  }
  const th = (c) => (
    <th key={c.id} scope="col" aria-sort={sort.id === c.id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-2.5 text-xs font-semibold text-muted whitespace-nowrap ${c.num ? 'text-left' : 'text-left'}`}>
      <button className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-muted hover:text-ink font-semibold text-xs"
        onClick={() => setSort((s) => ({ id: c.id, dir: s.id === c.id ? -s.dir : c.num ? -1 : 1 }))}>
        {c.label}{sort.id === c.id && (sort.dir > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  )

  return (
    <>
      <PageHeader title="Team" subtitle={me.isManager ? `${view.rows.length} people you look after` : 'Your groups at a glance'}
        actions={<Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <label className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input className="input pl-9" placeholder="Search by name, email or LeetCode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        </label>
        {view.groups.length > 1 && (
          <select className="input w-auto" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Group">
            <option value="all">All groups</option>
            {view.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title={view.rows.length ? 'No one matches' : 'No one here yet'}>
          {view.rows.length ? 'Try a different search or group.' : me.isManager ? 'Add trainers to the groups you lead.' : "You're not in a group yet. Ask your lead to add you."}
        </EmptyState></div>
      ) : <>
        {/* Desktop table */}
        <div className="card overflow-hidden hidden md:block">
          <table className="w-full border-collapse">
            <thead className="bg-canvas border-b border-line"><tr>{COLS.map(th)}</tr></thead>
            <tbody>
              {rows.map(({ p, s, groups }) => (
                <tr key={p.id} className="border-t border-line first:border-t-0 hover:bg-canvas cursor-pointer" onClick={(e) => { if (!e.target.closest('a')) nav(`/people/${encodeURIComponent(p.id)}`) }}>
                  <td className="px-4 py-3"><PersonLink person={p} sub={groups.map((g) => g.name).join(', ') || 'No group'} /></td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    {s.target > 0 ? <span className={s.today >= s.target ? 'text-ok-fg font-semibold' : ''}>{s.today}/{s.target}</span> : <span className="text-faint">No target</span>}
                  </td>
                  <td className="px-4 py-3"><StreakPill streak={s.streak} /></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><WeekBars days={s.last7} target={s.target} /><span className="text-xs text-muted tabular-nums">{s.week}</span></div></td>
                  <td className="px-4 py-3 min-w-[150px]">
                    {s.goals.active.length ? (
                      <div>
                        <div className="flex items-center gap-2"><ProgressBar value={s.goals.avgProgress} /><span className="text-xs tabular-nums w-8">{s.goals.avgProgress}%</span></div>
                        <div className="text-xs text-muted mt-0.5">{s.goals.active.length} active · {s.goals.completed.length} done</div>
                      </div>
                    ) : <span className="text-xs text-faint">{s.goals.completed.length ? `${s.goals.completed.length} done, none active` : 'No goals'}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{relDay(s.lastActive)}</td>
                  <td className="px-4 py-3"><Health s={s} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="md:hidden list-none p-0 m-0 flex flex-col gap-3">
          {rows.map(({ p, s, groups }) => (
            <li key={p.id} className="card p-4 flex flex-col gap-3">
              <div className="flex justify-between gap-3"><PersonLink person={p} sub={groups.map((g) => g.name).join(', ') || 'No group'} /><StreakPill streak={s.streak} /></div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>Today <b>{s.today}/{s.target}</b></span>
                <WeekBars days={s.last7} target={s.target} />
                <span className="text-muted text-xs">{relDay(s.lastActive)}</span>
              </div>
              {s.goals.active.length > 0 && <div className="flex items-center gap-2"><ProgressBar value={s.goals.avgProgress} /><span className="text-xs">{s.goals.avgProgress}%</span></div>}
              <Health s={s} />
            </li>
          ))}
        </ul>
      </>}
    </>
  )
}
