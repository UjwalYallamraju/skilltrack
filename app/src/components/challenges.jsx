import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Code, Plus, Trash2, Trophy } from 'lucide-react'
import * as api from '../lib/data'
import { useMe } from '../lib/me'
import { daysBetween, fmtDate, todayIST } from '../lib/dates'
import { LC_DIFF, LeetCodeFields, lcPace, lcTitle, useAction } from './goals'
import { Avatar, Badge, Button, EmptyState, ErrorNote, IconButton, Modal, ProgressBar, Segmented, useFeedback } from './ui'

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) }))

// ------------------------------------------------------------------ Assign to many people at once
export function AssignLeetCodeDialog({ people, groups, onClose }) {
  const run = useAction()
  const [picked, setPicked] = useState(new Set())
  const [f, setF] = useState({ lc_target: 80, lc_difficulty: 'any', start_date: todayIST(), target_date: '', title: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const ids = new Set(people.map((p) => p.id))
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const groupIds = (g) => g.members.map((m) => m.user_id).filter((id) => ids.has(id))
  const toggleGroup = (g) => setPicked((s) => {
    const list = groupIds(g); const all = list.every((id) => s.has(id)); const n = new Set(s)
    list.forEach((id) => (all ? n.delete(id) : n.add(id))); return n
  })
  async function submit(e) {
    e.preventDefault()
    if (!picked.size) return setError('Pick at least one person.')
    if (f.target_date < f.start_date) return setError('The end date must be on or after the start date.')
    const challenge_id = uuid()
    const title = f.title.trim() || lcTitle(f.lc_target, f.lc_difficulty)
    const rows = [...picked].map((user_id) => ({
      user_id, goal_type: 'leetcode', skill_area_id: null, skill: 'LeetCode', title, description: '',
      lc_target: Number(f.lc_target), lc_difficulty: f.lc_difficulty, start_date: f.start_date, target_date: f.target_date, challenge_id,
    }))
    setBusy(true)
    if (await run(() => api.addGoals(rows), `LeetCode target set for ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`, ['goals'])) onClose()
    setBusy(false)
  }
  const visibleGroups = groups.filter((g) => groupIds(g).length)
  return (
    <Modal title="New LeetCode target" onClose={onClose} wide>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-4">
          <LeetCodeFields f={f} set={set} />
          <p className="m-0 text-xs text-muted">Each person gets this as a goal. Every distinct problem they solve between these dates counts, and it completes automatically. They can't change or delete it.</p>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex justify-between items-baseline"><span className="label">Who</span><span className="text-xs text-muted">{picked.size} selected</span></div>
          {visibleGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {visibleGroups.map((g) => {
                const all = groupIds(g).every((id) => picked.has(id))
                return <button type="button" key={g.id} onClick={() => toggleGroup(g)} aria-pressed={all}
                  className={`h-8 px-3 rounded-full text-[13px] border cursor-pointer ${all ? 'bg-accent text-white border-accent' : 'bg-white border-line text-ink-2 hover:bg-soft'}`}>
                  {all ? '✓ ' : '+ '}{g.name}
                </button>
              })}
            </div>
          )}
          <ul className="list-none p-0 m-0 max-h-[320px] overflow-y-auto border border-line rounded-lg">
            {people.map((p) => (
              <li key={p.id} className="border-b border-line last:border-0">
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-canvas">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#3B4BD8]" />
                  <Avatar name={p.full_name || p.email} size={26} />
                  <span className="text-sm font-semibold truncate">{p.full_name || p.email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2 flex flex-col gap-3">
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!picked.size || !f.target_date}>Set target for {picked.size || ''} {picked.size === 1 ? 'person' : 'people'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Leaderboards
export function LeetCodeTargets({ goals, people, groups, canManage }) {
  const [show, setShow] = useState('active')
  const [adding, setAdding] = useState(false)
  const { confirm } = useFeedback()
  const run = useAction()
  const me = useMe()
  const today = todayIST()
  const personBy = new Map(people.map((p) => [p.id, p]))

  // one board per challenge (goals assigned together); single goals get their own board
  const boards = new Map()
  for (const g of goals.filter((x) => x.goal_type === 'leetcode' && personBy.has(x.user_id))) {
    const k = g.challenge_id || g.id
    if (!boards.has(k)) boards.set(k, { key: k, challenge: !!g.challenge_id, title: g.title, from: g.start_date, to: g.target_date, target: g.lc_target, diff: g.lc_difficulty, goals: [] })
    boards.get(k).goals.push(g)
  }
  const ended = (b) => b.to < today
  const list = [...boards.values()].filter((b) => (show === 'active' ? !ended(b) : ended(b))).sort((a, b) => a.to.localeCompare(b.to))
  const counts = { active: [...boards.values()].filter((b) => !ended(b)).length, ended: [...boards.values()].filter(ended).length }

  async function removeBoard(b) {
    if (!(await confirm({ title: `Delete “${b.title}”?`, message: `This removes the target from ${b.goals.length} ${b.goals.length === 1 ? 'person' : 'people'}. Their solved problems stay.`, confirmLabel: 'Delete target', danger: true }))) return
    run(() => (b.challenge ? api.deleteChallenge(b.key) : api.deleteGoal(b.key)), 'Target deleted', ['goals'])
  }

  return (
    <section className="mb-6" aria-labelledby="targets-h">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <div>
          <h2 id="targets-h" className="m-0 text-[17px] font-semibold">LeetCode targets</h2>
          <p className="m-0 text-[13px] text-muted">Goals like “solve 80 problems by 31 Jan”, tracked automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented label="Show targets" value={show} onChange={setShow} options={[{ value: 'active', label: `Active ${counts.active}` }, { value: 'ended', label: `Ended ${counts.ended}` }]} />
          {canManage && <Button icon={Plus} onClick={() => setAdding(true)}>New LeetCode target</Button>}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card"><EmptyState icon={Code} title={show === 'active' ? 'No active LeetCode targets' : 'No ended targets yet'}
          action={canManage && show === 'active' && <Button icon={Plus} onClick={() => setAdding(true)}>Set a target</Button>}>
          {canManage ? 'Set a target like 80 problems in 8 weeks for a group or chosen trainers. Progress fills in from their LeetCode activity.' : 'Targets your lead sets appear here.'}
        </EmptyState></div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-4">
          {list.map((b) => {
            const rows = [...b.goals].sort((x, y) => (y.lc_solved ?? 0) - (x.lc_solved ?? 0))
            const done = rows.filter((g) => g.status === 'completed').length
            const left = daysBetween(today, b.to)
            const mine = rows.some((g) => g.assigned_by === me.profile.id) || me.isAdmin
            return (
              <article key={b.key} className="card p-5 flex flex-col gap-3">
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <h3 className="m-0 text-[15px] font-semibold">{b.title}</h3>
                    <div className="text-xs text-muted mt-0.5">
                      {LC_DIFF[b.diff]} · {fmtDate(b.from, { day: 'numeric', month: 'short' })} → {fmtDate(b.to, { day: 'numeric', month: 'short', year: 'numeric' })} · {left < 0 ? 'ended' : left === 0 ? 'last day' : `${left} days left`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <Badge tone={done === rows.length ? 'ok' : 'neutral'} icon={Trophy}>{done}/{rows.length} done</Badge>
                    {canManage && mine && <IconButton icon={Trash2} label={`Delete ${b.title}`} onClick={() => removeBoard(b)} />}
                  </div>
                </div>
                <ol className="list-none p-0 m-0">
                  {rows.map((g, i) => {
                    const p = personBy.get(g.user_id)
                    const pace = lcPace(g)
                    return (
                      <li key={g.id} className="flex items-center gap-3 py-2 border-t border-line">
                        <span className="w-5 text-xs text-muted text-right tabular-nums">{i + 1}</span>
                        <Link to={`/people/${encodeURIComponent(p.id)}`} className="flex items-center gap-2 w-[150px] min-w-0 no-underline text-ink">
                          <Avatar name={p.full_name || p.email} size={26} /><span className="text-sm font-semibold truncate">{p.full_name || p.email}</span>
                        </Link>
                        <div className="flex-1 min-w-[80px]"><ProgressBar value={g.progress} status={g.status} /></div>
                        <span className="text-sm font-semibold tabular-nums w-16 text-right">{g.lc_solved ?? 0}<span className="text-muted font-normal">/{g.lc_target}</span></span>
                        <span className="w-[92px] text-right hidden sm:block">
                          {g.status === 'completed' ? <Badge tone="ok">Reached</Badge>
                            : pace && <Badge tone={pace.tone === 'neutral' ? 'neutral' : pace.tone}>{pace.tone === 'ok' ? 'On pace' : pace.tone === 'neutral' ? 'Upcoming' : g.target_date < today ? 'Missed' : `${(g.lc_expected ?? 0) - (g.lc_solved ?? 0)} behind`}</Badge>}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </article>
            )
          })}
        </div>
      )}
      {adding && <AssignLeetCodeDialog people={people.filter((p) => p.id !== me.profile.id || me.isAdmin)} groups={groups} onClose={() => setAdding(false)} />}
    </section>
  )
}
