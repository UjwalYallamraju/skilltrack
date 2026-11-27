import { useState } from 'react'
import { addSolve, deleteSolve, slugify, syncLeetcode, updateProfile } from '../lib/data'
import { addDays, fmtDateTime, isWeekend, todayIST, weekdayShort } from '../lib/dates'
import { Button, ErrorNote, Modal } from './ui'

const DIFF = {
  Easy: 'bg-ok-bg text-ok-fg',
  Medium: 'bg-warn-bg text-warn-fg',
  Hard: 'bg-bad-bg text-bad-fg',
}

export function DifficultyTag({ level }) {
  if (!level) return null
  return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${DIFF[level]}`}>{level}</span>
}

export function SevenDayBars({ counts, target = 1 }) {
  // counts: [{ day, n }] oldest → newest
  const max = Math.max(target, ...counts.map((c) => c.n), 1)
  return (
    <div className="flex items-end gap-1 h-8" role="img" aria-label={`Problems solved per day, last 7 days: ${counts.map((c) => c.n).join(', ')}`}>
      {counts.map((c) => (
        <div key={c.day} title={`${weekdayShort(c.day)} ${c.day}: ${c.n}`}
          className={`w-3 rounded-sm ${c.n === 0 ? (isWeekend(c.day) ? 'bg-soft' : 'bg-[#D5D9E1]') : c.n >= target ? 'bg-ok' : 'bg-warn'}`}
          style={{ height: c.n === 0 ? 3 : Math.max(6, Math.round((c.n / max) * 32)) }} />
      ))}
    </div>
  )
}

export function lastSevenDays(solves, userId) {
  const today = todayIST()
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6)
    return { day, n: solves.filter((s) => s.user_id === userId && s.solved_on === day).length }
  })
}

export default function LeetCodeCard({ profile, summary, solves, onChange, reloadProfile }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [logging, setLogging] = useState(false)
  const [username, setUsername] = useState('')
  const today = todayIST()
  const todays = solves.filter((s) => s.solved_on === today)
  const target = profile.daily_target
  const week = lastSevenDays(solves, profile.id)

  async function link(e) {
    e.preventDefault()
    const u = username.trim().replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/)?/i, '').replace(/\/+$/, '')
    if (!u) return
    try { await updateProfile(profile.id, { leetcode_username: u }); await reloadProfile(); sync() } catch (err) { setError(err) }
  }

  async function sync() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await syncLeetcode(profile.id)
      setMsg(r?.message || 'Synced with LeetCode.')
      onChange()
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  async function remove(id) {
    try { await deleteSolve(id); onChange() } catch (err) { setError(err) }
  }

  return (
    <section aria-labelledby="lc-h" className="card p-5 md:px-6 flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h2 id="lc-h" className="m-0 text-lg font-semibold">Daily LeetCode</h2>
          <div className="text-[13px] text-muted mt-1">
            {profile.leetcode_username ? (
              <>Linked to <a className="text-accent" href={`https://leetcode.com/u/${profile.leetcode_username}/`} target="_blank" rel="noreferrer">leetcode.com/u/{profile.leetcode_username}</a>
                {summary?.synced_at ? ` · last synced ${fmtDateTime(summary.synced_at)}` : ' · not synced yet'}</>
            ) : 'Link your LeetCode profile so your solved problems sync automatically.'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.leetcode_username && <Button variant="secondary" onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</Button>}
          <Button onClick={() => setLogging(true)}>Log a problem</Button>
        </div>
      </div>

      {!profile.leetcode_username && (
        <form onSubmit={link} className="flex flex-wrap gap-2 items-end">
          <label className="label flex-1 min-w-[220px]">LeetCode username
            <input className="input font-normal" placeholder="e.g. nehak_dev" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <Button type="submit" variant="secondary">Link profile</Button>
        </form>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        <Stat label="Today" value={`${todays.length} / ${target}`} tone={target > 0 && todays.length >= target ? 'ok' : todays.length ? 'warn' : null} />
        <Stat label="Streak (weekdays)" value={`${summary?.streak ?? 0} day${summary?.streak === 1 ? '' : 's'}`} />
        <Stat label="Last 7 days" value={summary?.last_7_days ?? 0} extra={<SevenDayBars counts={week} target={target} />} />
        <Stat label="Total solved" value={summary?.total ?? 0} extra={<div className="text-xs text-muted">{summary?.easy ?? 0} E · {summary?.medium ?? 0} M · {summary?.hard ?? 0} H</div>} />
      </div>

      <div>
        <div className="text-[13px] font-semibold mb-2">Today's problems</div>
        {todays.length === 0 ? (
          <p className="m-0 text-sm text-muted">Nothing yet today. {target > 0 && `Your target is ${target} a day.`}</p>
        ) : (
          <ul className="list-none p-0 m-0 flex flex-col gap-2">
            {todays.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-2.5 items-center px-3 py-2.5 border border-soft rounded-lg">
                <DifficultyTag level={s.difficulty} />
                <a href={`https://leetcode.com/problems/${s.problem_slug}/`} target="_blank" rel="noreferrer" className="font-semibold text-sm text-ink flex-1 min-w-[160px]">{s.title}</a>
                <span className="text-xs text-muted">{s.source === 'manual' ? 'Logged manually' : 'Synced'}</span>
                {s.source === 'manual' && <button onClick={() => remove(s.id)} className="text-xs text-bad-fg bg-transparent border-0 cursor-pointer">Remove</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {msg && <p className="m-0 text-sm text-ok-fg bg-ok-bg rounded-lg px-3 py-2">{msg}</p>}
      <ErrorNote error={error} />
      {logging && <LogProblem userId={profile.id} onClose={() => setLogging(false)} onSaved={() => { setLogging(false); onChange() }} />}
    </section>
  )
}

function Stat({ label, value, tone, extra }) {
  const tones = { ok: 'bg-ok-bg text-ok-fg', warn: 'bg-warn-bg text-warn-fg' }
  return (
    <div className={`rounded-[10px] px-4 py-3.5 ${tones[tone] || 'bg-canvas'}`}>
      <div className={`text-xs font-semibold ${tone ? '' : 'text-muted'}`}>{label}</div>
      <div className="font-display text-[26px] font-bold">{value}</div>
      {extra}
    </div>
  )
}

function LogProblem({ userId, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState('Easy')
  const [day, setDay] = useState(todayIST())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault()
    let name = title.trim()
    let slug = slugify(name)
    const m = name.match(/leetcode\.com\/problems\/([^/?#]+)/i)
    if (m) { slug = m[1]; name = slug.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ') }
    if (!slug) return
    setBusy(true)
    try {
      await addSolve({ user_id: userId, problem_slug: slug, title: name, difficulty, solved_on: day })
      onSaved()
    } catch (err) {
      setError(/duplicate|unique/i.test(err.message) ? 'That problem is already logged for this day.' : err)
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Log a LeetCode problem" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">Problem name or link
          <input className="input font-normal" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two Sum, or https://leetcode.com/problems/two-sum/" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">Difficulty
            <select className="input font-normal" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
          </label>
          <label className="label">Solved on
            <input type="date" className="input font-normal" value={day} max={todayIST()} min={addDays(todayIST(), -6)} onChange={(e) => setDay(e.target.value)} required />
          </label>
        </div>
        <p className="m-0 text-xs text-muted">Use this if a problem didn't sync. You can back-date up to 6 days.</p>
        <ErrorNote error={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Log problem'}</Button>
      </form>
    </Modal>
  )
}
