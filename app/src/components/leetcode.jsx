import { useState } from 'react'
import { Code, ExternalLink, Flame, Plus, RefreshCw, Trash2 } from 'lucide-react'
import * as api from '../lib/data'
import { useRefresh } from '../lib/queries'
import { addDays, fmtDate, fmtDateTime, isWeekend, todayIST, weekdayShort } from '../lib/dates'
import { mondayOf } from '../lib/insights'
import { Badge, Button, Card, ErrorNote, Modal, useFeedback } from './ui'

// Sequential single-hue ramp (light -> dark) for "problems solved that day"
const HEAT = [0, 1, 2, 3, 4].map((i) => `var(--color-heat-${i})`)
const heatColor = (n, target) => {
  if (n === 0) return HEAT[0]
  const t = Math.max(1, target || 1)
  if (n < t) return HEAT[1]
  if (n < t * 2) return HEAT[2]
  if (n < t * 3) return HEAT[3]
  return HEAT[4]
}

export function DifficultyTag({ level }) {
  if (!level) return null
  return <Badge tone={level === 'Easy' ? 'ok' : level === 'Medium' ? 'warn' : 'bad'}>{level}</Badge>
}

// GitHub-style calendar: columns are weeks (Mon..Sun), most recent on the right
export function Heatmap({ personId, solves, target = 1, weeks = 26, joined }) {
  const [tip, setTip] = useState(null)
  const today = todayIST()
  const start = addDays(mondayOf(today), -7 * (weeks - 1))
  const counts = new Map()
  for (const s of solves) if (s.user_id === personId) counts.set(s.solved_on, (counts.get(s.solved_on) || 0) + 1)
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  const total = [...counts.entries()].filter(([d]) => d >= start).reduce((s, [, n]) => s + n, 0)
  const activeDays = [...counts.entries()].filter(([d, n]) => d >= start && n > 0).length
  const C = 13, G = 3
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted mb-2">
        <span><b className="text-ink">{total}</b> problems on <b className="text-ink">{activeDays}</b> days in the last {weeks} weeks</span>
        <span className="flex items-center gap-1" aria-hidden>Less {HEAT.map((c) => <span key={c} className="inline-block w-3 h-3 rounded-[3px]" style={{ background: c }} />)} More</span>
      </div>
      <div className="relative overflow-x-auto">
        <svg width={weeks * (C + G) + 28} height={7 * (C + G) + 18} role="img" aria-label={`LeetCode activity: ${total} problems in ${weeks} weeks`}>
          {['Mon', 'Wed', 'Fri'].map((l, i) => <text key={l} x="0" y={18 + (i * 2) * (C + G) + 10} fontSize="10" style={{ fill: 'var(--color-faint)' }}>{l}</text>)}
          {cols.map((col, w) => (
            <g key={w} transform={`translate(${28 + w * (C + G)}, 16)`}>
              {(w === 0 || col[0].slice(8, 10) <= '07') && <text x="0" y="-5" fontSize="10" style={{ fill: 'var(--color-faint)' }}>{fmtDate(col[0], { month: 'short' })}</text>}
              {col.map((day, d) => {
                if (day > today) return null
                const n = counts.get(day) || 0
                const before = joined && day < joined
                return (
                  <rect key={day} x="0" y={d * (C + G)} width={C} height={C} rx="3"
                    style={{ fill: before ? 'var(--color-heat-pre)' : heatColor(n, target), stroke: day === today ? 'var(--color-ink)' : 'none' }} strokeWidth="1.2"
                    onMouseEnter={() => setTip({ x: 28 + w * (C + G), y: 16 + d * (C + G), text: `${weekdayShort(day)} ${fmtDate(day)}: ${n} problem${n === 1 ? '' : 's'}${isWeekend(day) ? ' (weekend)' : ''}` })}
                    onMouseLeave={() => setTip(null)} />
                )
              })}
            </g>
          ))}
        </svg>
        {tip && <div className="pointer-events-none absolute z-10 bg-night text-white text-xs rounded-md px-2 py-1 whitespace-nowrap" style={{ left: Math.max(0, tip.x - 60), top: tip.y - 30 }}>{tip.text}</div>}
      </div>
    </div>
  )
}

// 7 tiny bars (oldest -> today) for tables
export function WeekBars({ days, target = 1 }) {
  const max = Math.max(target, ...days.map((d) => d.n), 1)
  return (
    <div className="flex items-end gap-[3px] h-6" role="img" aria-label={`Last 7 days: ${days.map((d) => d.n).join(', ')}`}>
      {days.map((d) => (
        <span key={d.day} title={`${weekdayShort(d.day)}: ${d.n}`} className="w-2 rounded-[2px]"
          style={{ height: d.n ? Math.max(5, Math.round((d.n / max) * 24)) : 3, background: d.n === 0 ? (isWeekend(d.day) ? 'var(--color-soft)' : 'var(--color-line)') : d.n >= target ? 'var(--color-bar-hit)' : 'var(--color-bar-low)' }} />
      ))}
    </div>
  )
}

export function StreakPill({ streak }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${streak > 0 ? 'text-warn-fg' : 'text-faint'}`}>
      <Flame size={15} aria-hidden />{streak}
    </span>
  )
}

// The trainer's own LeetCode panel
export function MyLeetCode({ profile, stats, lcRow, solves, reloadProfile }) {
  const [busy, setBusy] = useState(false)
  const [logging, setLogging] = useState(false)
  const [username, setUsername] = useState('')
  const { toast } = useFeedback()
  const refresh = useRefresh()
  const today = todayIST()
  const todays = solves.filter((s) => s.user_id === profile.id && s.solved_on === today)

  async function sync() {
    setBusy(true)
    try { const r = await api.syncLeetcode(profile.id); toast(r?.message || 'Synced with LeetCode'); await refresh('solves', 'lcSummary') }
    catch (e) { toast(e.message, 'bad') } finally { setBusy(false) }
  }
  async function link(e) {
    e.preventDefault()
    const u = username.trim().replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/)?/i, '').replace(/\/+$/, '')
    if (!u) return
    try { await api.updateProfile(profile.id, { leetcode_username: u }); await reloadProfile(); await refresh('profiles'); sync() }
    catch (err) { toast(err.message, 'bad') }
  }
  const hit = profile.daily_target > 0 && stats.today >= profile.daily_target

  return (
    <Card title="Daily LeetCode" subtitle={profile.leetcode_username
      ? <>Linked to <a className="text-accent" href={`https://leetcode.com/u/${profile.leetcode_username}/`} target="_blank" rel="noreferrer">@{profile.leetcode_username}</a>{lcRow?.synced_at ? ` · synced ${fmtDateTime(lcRow.synced_at)}` : ''}</>
      : 'Link your LeetCode profile so solved problems sync automatically.'}
      actions={<>
        {profile.leetcode_username && <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy} onClick={sync}>Sync</Button>}
        <Button size="sm" icon={Plus} onClick={() => setLogging(true)}>Log problem</Button>
      </>}>
      {!profile.leetcode_username && (
        <form onSubmit={link} className="flex flex-wrap gap-2 items-end mb-4">
          <label className="label flex-1 min-w-[200px]">LeetCode username
            <input className="input" placeholder="e.g. nehak_dev" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <Button type="submit" variant="secondary">Link profile</Button>
        </form>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className={`rounded-xl px-4 py-3 ${hit ? 'bg-ok-bg' : 'bg-canvas'}`}>
          <div className={`text-xs font-semibold ${hit ? 'text-ok-fg' : 'text-muted'}`}>Today</div>
          <div className="text-[22px] font-semibold">{stats.today} <span className="text-sm text-muted font-normal">/ {profile.daily_target}</span></div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-canvas">
          <div className="text-xs font-semibold text-muted">Streak (weekdays)</div>
          <div className="text-[22px] font-semibold flex items-center gap-1"><Flame size={18} className={stats.streak ? 'text-warn' : 'text-faint'} aria-hidden />{stats.streak}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-canvas">
          <div className="text-xs font-semibold text-muted">Last 7 days</div>
          <div className="text-[22px] font-semibold">{stats.week}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-canvas">
          <div className="text-xs font-semibold text-muted">Total solved</div>
          <div className="text-[22px] font-semibold">{lcRow?.total ?? 0}</div>
          <div className="text-[11px] text-muted">{lcRow?.easy ?? 0} E · {lcRow?.medium ?? 0} M · {lcRow?.hard ?? 0} H</div>
        </div>
      </div>
      <Heatmap personId={profile.id} solves={solves} target={profile.daily_target} weeks={20} joined={stats.joined} />
      {todays.length > 0 && (
        <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-1.5">
          {todays.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Code size={15} className="text-muted" aria-hidden /><DifficultyTag level={s.difficulty} />
              <a href={`https://leetcode.com/problems/${s.problem_slug}/`} target="_blank" rel="noreferrer" className="text-ink">{s.title}</a>
              {s.source === 'manual' && <button onClick={async () => { await api.deleteSolve(s.id); refresh('solves', 'lcSummary') }} aria-label={`Remove ${s.title}`} className="ml-auto text-muted hover:text-bad-fg bg-transparent border-0 cursor-pointer"><Trash2 size={14} aria-hidden /></button>}
            </li>
          ))}
        </ul>
      )}
      {logging && <LogProblemDialog userId={profile.id} onClose={() => setLogging(false)} />}
    </Card>
  )
}

function LogProblemDialog({ userId, onClose }) {
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState('Easy')
  const [day, setDay] = useState(todayIST())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const refresh = useRefresh()
  const { toast } = useFeedback()
  async function submit(e) {
    e.preventDefault()
    let name = title.trim()
    let slug = api.slugify(name)
    const m = name.match(/leetcode\.com\/problems\/([^/?#]+)/i)
    if (m) { slug = m[1]; name = slug.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ') }
    if (!slug) return
    setBusy(true)
    try {
      await api.addSolve({ user_id: userId, problem_slug: slug, title: name, difficulty, solved_on: day })
      toast('Problem logged'); await refresh('solves', 'lcSummary'); onClose()
    } catch (err) {
      setError(/duplicate|unique/i.test(err.message) ? 'That problem is already logged for this day.' : err)
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Log a LeetCode problem" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">Problem name or link
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two Sum, or https://leetcode.com/problems/two-sum/" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">Difficulty
            <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select>
          </label>
          <label className="label">Solved on
            <input type="date" className="input" value={day} max={todayIST()} min={addDays(todayIST(), -6)} onChange={(e) => setDay(e.target.value)} required />
          </label>
        </div>
        <p className="m-0 text-xs text-muted">Only needed if a problem didn't sync. You can back-date up to 6 days.</p>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Log problem</Button>
        </div>
      </form>
    </Modal>
  )
}

export { ExternalLink }
