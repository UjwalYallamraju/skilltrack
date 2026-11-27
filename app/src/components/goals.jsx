import { useState } from 'react'
import {
  BadgeCheck, Check, Code, ExternalLink, Target, Flag, MessageSquare, Pencil, Plus, RefreshCw, Send, Trash2, Undo2, X,
} from 'lucide-react'
import * as api from '../lib/data'
import { useGoalComments, useProfiles, useRefresh, useSkillAreas } from '../lib/queries'
import { useMe } from '../lib/me'
import { addDays, daysBetween, fmtDate, fmtDateTime, isWeekend, todayIST } from '../lib/dates'
import { Avatar, Badge, Button, ErrorNote, Modal, ProgressBar, StatusBadge, useFeedback } from './ui'

// Small helper: run an async action with toast + refresh
export function useAction() {
  const { toast } = useFeedback()
  const refresh = useRefresh()
  return async (fn, success, keys = []) => {
    try {
      await fn()
      if (success) toast(success)
      await refresh(...keys)
      return true
    } catch (e) {
      toast(e.message || String(e), 'bad')
      return false
    }
  }
}

function dueText(g) {
  const left = daysBetween(todayIST(), g.target_date)
  if (g.status === 'completed') return g.completed_at ? `Completed ${fmtDate(g.completed_at)}` : 'Completed'
  if (left < 0) return `${-left} day${left === -1 ? '' : 's'} overdue`
  if (left === 0) return 'Due today'
  return `Due in ${left} day${left === 1 ? '' : 's'}`
}

// ------------------------------------------------------------------ Goal card
export const LC_DIFF = { any: 'Any difficulty', medium: 'Medium or Hard', hard: 'Hard only' }

export function lcPace(g) {
  if (g.goal_type !== 'leetcode' || g.status === 'completed') return null
  if (g.start_date > todayIST()) return { tone: 'neutral', text: `Starts ${fmtDate(g.start_date, { day: 'numeric', month: 'short' })}` }
  const diff = (g.lc_solved ?? 0) - (g.lc_expected ?? 0)
  const left = Math.max(0, g.lc_target - (g.lc_solved ?? 0))
  const daysLeft = Math.max(1, daysBetween(todayIST(), g.target_date) + 1)
  const perDay = Math.ceil(left / daysLeft)
  if (g.target_date < todayIST()) return { tone: 'bad', text: `Ended ${left} short` }
  if (diff >= 0) return { tone: 'ok', text: `On pace (${diff > 0 ? `${diff} ahead` : 'exactly on track'}) · ${perDay}/day needed` }
  return { tone: diff < -(g.lc_target * 0.1) ? 'bad' : 'warn', text: `${-diff} behind pace · ${perDay}/day needed to finish` }
}

export function GoalCard({ goal: g, owner, reviewer, compact = false }) {
  const [dialog, setDialog] = useState(null) // edit | log | submit | review
  const [showComments, setShowComments] = useState(false)
  const run = useAction()
  const { confirm } = useFeedback()
  const people = useProfiles().data || []
  const active = g.status !== 'completed' && g.status !== 'in_review'
  const lc = g.goal_type === 'leetcode'
  const locked = !!g.assigned_by && !reviewer // set by a lead: the trainer can't change or delete it
  const canEdit = (owner && !locked) || reviewer
  const assigner = g.assigned_by && people.find((p) => p.id === g.assigned_by)?.full_name
  const pace = lcPace(g)

  async function remove() {
    if (!(await confirm({ title: 'Delete goal?', message: `“${g.title}”${lc ? '' : ' and its progress history'} will be deleted. This can't be undone.`, confirmLabel: 'Delete goal', danger: true }))) return
    run(() => api.deleteGoal(g.id), 'Goal deleted', ['goals'])
  }

  return (
    <article className="card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-3 gap-y-2 justify-between items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {lc ? <span className="inline-flex items-center gap-1 font-semibold text-accent-dark uppercase tracking-wide"><Code size={13} aria-hidden />LeetCode target</span>
              : <span className="font-semibold text-accent-dark uppercase tracking-wide">{g.skill_area}</span>}
            <span>·</span><span>{lc ? LC_DIFF[g.lc_difficulty] : g.skill}</span>
            {assigner && <><span>·</span><span>Set by {assigner}</span></>}
          </div>
          <h3 className="mt-1 mb-0 text-[15px] font-semibold leading-snug">{g.title}</h3>
          {!compact && g.description && <p className="text-sm text-muted mt-1 mb-0 whitespace-pre-line">{g.description}</p>}
        </div>
        <StatusBadge status={g.status} />
      </div>

      <div className="flex items-center gap-3">
        <ProgressBar value={g.progress} status={g.status} />
        <span className="text-sm font-semibold text-right tabular-nums whitespace-nowrap">{lc ? `${g.lc_solved ?? 0} / ${g.lc_target}` : `${g.progress}%`}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>{fmtDate(g.start_date, { day: 'numeric', month: 'short' })} → {fmtDate(g.target_date)}</span>
        <span className={g.status === 'overdue' ? 'text-bad-fg font-semibold' : ''}>{dueText(g)}</span>
        {pace && <span className={{ ok: 'text-ok-fg', warn: 'text-warn-fg', bad: 'text-bad-fg font-semibold', neutral: '' }[pace.tone]}>{pace.text}</span>}
        {g.flagged_by_trainer && <span className="text-warn-fg">Flagged at risk by trainer</span>}
      </div>
      {lc && active && owner && <p className="m-0 text-xs text-muted">Counts every distinct problem you solve in these dates. It completes automatically once you hit the target.</p>}

      {(g.evidence_url || g.evidence_note) && (
        <div className="text-sm bg-canvas rounded-lg px-3 py-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Proof submitted {g.submitted_at ? fmtDateTime(g.submitted_at) : ''}</span>
          {g.evidence_url && <a href={g.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent break-all">{g.evidence_url}<ExternalLink size={13} aria-hidden /></a>}
          {g.evidence_note && <span className="text-ink-2">{g.evidence_note}</span>}
        </div>
      )}
      {g.review_status === 'changes_requested' && g.review_comment && (
        <div className="text-sm bg-warn-bg text-warn-fg rounded-lg px-3 py-2"><b>Changes requested:</b> {g.review_comment}</div>
      )}

      <div className="flex flex-wrap gap-2 items-center pt-1">
        {owner && active && !lc && <>
          <Button size="sm" icon={Plus} onClick={() => setDialog('log')}>Log progress</Button>
          <Button size="sm" variant="secondary" icon={Send} onClick={() => setDialog('submit')}>{g.review_status === 'changes_requested' ? 'Resubmit' : 'Submit for approval'}</Button>
        </>}
        {canEdit && active && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDialog('edit')}>Edit</Button>}
        {owner && active && (
          <Button size="sm" variant="ghost" icon={Flag} onClick={() => run(() => api.saveGoal({ id: g.id, manual_at_risk: !g.manual_at_risk }), g.manual_at_risk ? 'At-risk flag removed' : 'Marked at risk', ['goals'])}>
            {g.manual_at_risk ? 'Unflag' : 'Flag at risk'}
          </Button>
        )}
        {reviewer && g.status === 'in_review' && <Button size="sm" variant="success" icon={BadgeCheck} onClick={() => setDialog('review')}>Review</Button>}
        {owner && g.status === 'in_review' && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => run(() => api.reopenGoal(g.id), 'Submission withdrawn', ['goals'])}>Withdraw</Button>}
        {!lc && (owner || reviewer) && g.status === 'completed' && <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => run(() => api.reopenGoal(g.id), 'Goal reopened', ['goals'])}>Reopen</Button>}
        <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => setShowComments((v) => !v)} aria-expanded={showComments}>Comments</Button>
        {canEdit && <Button size="sm" variant="ghost" icon={Trash2} className="text-muted" onClick={remove} aria-label="Delete goal">Delete</Button>}
      </div>

      {showComments && <CommentThread goal={g} canWrite={owner || reviewer} />}

      {dialog === 'edit' && <GoalFormDialog goal={g} onClose={() => setDialog(null)} />}
      {dialog === 'log' && <LogProgressDialog goal={g} onClose={() => setDialog(null)} />}
      {dialog === 'submit' && <SubmitDialog goal={g} onClose={() => setDialog(null)} />}
      {dialog === 'review' && <ReviewDialog goal={g} onClose={() => setDialog(null)} />}
    </article>
  )
}

// ------------------------------------------------------------------ Comments
export function CommentThread({ goal, canWrite }) {
  const { data: comments = [], isLoading } = useGoalComments(goal.id)
  const people = useProfiles().data || []
  const { profile } = useMe()
  const [body, setBody] = useState('')
  const run = useAction()
  const name = (id) => people.find((p) => p.id === id)?.full_name || 'Someone'
  async function send(e) {
    e.preventDefault()
    if (!body.trim()) return
    if (await run(() => api.addGoalComment(goal.id, profile.id, body.trim()), null, ['comments'])) setBody('')
  }
  return (
    <div className="border-t border-line pt-3 flex flex-col gap-3">
      {isLoading ? <span className="text-sm text-muted">Loading comments…</span> : comments.length === 0 ? <span className="text-sm text-muted">No comments yet.</span> : (
        <ul className="list-none p-0 m-0 flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={name(c.author_id)} size={26} />
              <div className="min-w-0">
                <div className="text-xs text-muted"><b className="text-ink">{name(c.author_id)}</b> · {fmtDateTime(c.created_at)}</div>
                <div className="text-sm whitespace-pre-line">{c.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={send} className="flex gap-2">
          <input className="input" placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Comment" />
          <Button type="submit" size="md" variant="secondary" disabled={!body.trim()}>Send</Button>
        </form>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Dialogs
export function GoalFormDialog({ goal, forUser, onClose }) {
  const { profile } = useMe()
  const areas = useSkillAreas().data || []
  const run = useAction()
  const [type, setType] = useState(goal?.goal_type || 'skill')
  const [f, setF] = useState(() => ({
    skill_area_id: goal?.skill_area_id ?? '',
    skill: goal?.goal_type === 'leetcode' ? '' : goal?.skill ?? '', title: goal?.title ?? '', description: goal?.description ?? '',
    start_date: goal?.start_date ?? todayIST(), target_date: goal?.target_date ?? '',
    lc_target: goal?.lc_target ?? 50, lc_difficulty: goal?.lc_difficulty ?? 'any',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const assigning = forUser && forUser.id !== profile.id
  async function submit(e) {
    e.preventDefault()
    if (f.target_date < f.start_date) return setError('The end date must be on or after the start date.')
    const row = type === 'leetcode'
      ? { goal_type: 'leetcode', skill_area_id: null, skill: 'LeetCode', lc_target: Number(f.lc_target), lc_difficulty: f.lc_difficulty,
          title: f.title.trim() || lcTitle(f.lc_target, f.lc_difficulty), description: f.description, start_date: f.start_date, target_date: f.target_date }
      : { goal_type: 'skill', skill_area_id: Number(f.skill_area_id || areas[0]?.id), skill: f.skill, title: f.title, description: f.description, start_date: f.start_date, target_date: f.target_date }
    if (goal) row.id = goal.id; else row.user_id = forUser?.id || profile.id
    setBusy(true)
    if (await run(() => api.saveGoal(row), goal ? 'Goal updated' : assigning ? 'Goal assigned' : 'Goal added', ['goals'])) onClose()
    setBusy(false)
  }
  return (
    <Modal title={goal ? 'Edit goal' : assigning ? `New goal for ${forUser.full_name}` : 'New goal'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!goal && <GoalTypePicker value={type} onChange={setType} />}
        {type === 'leetcode' ? <LeetCodeFields f={f} set={set} /> : <>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="label">Skill area
              <select className="input" value={f.skill_area_id || areas[0]?.id || ''} onChange={set('skill_area_id')} required>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="label">Specific skill
              <input className="input" placeholder="e.g. LangGraph" value={f.skill} onChange={set('skill')} required maxLength={120} />
            </label>
          </div>
          <label className="label">Goal
            <input className="input" placeholder="e.g. Build and deliver a 1-day agents workshop" value={f.title} onChange={set('title')} required maxLength={200} />
          </label>
          <label className="label">How will you get there? <span className="text-faint font-normal">(optional)</span>
            <textarea className="input resize-y" rows={3} value={f.description} onChange={set('description')} placeholder="Courses, projects, certification…" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="label">Start
              <input type="date" className="input" value={f.start_date} onChange={set('start_date')} required />
            </label>
            <label className="label">Target date
              <input type="date" className="input" value={f.target_date} min={f.start_date} onChange={set('target_date')} required />
            </label>
          </div>
        </>}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{goal ? 'Save changes' : assigning ? 'Assign goal' : 'Add goal'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export const lcTitle = (n, diff) => `Solve ${n || '…'} ${diff === 'hard' ? 'Hard ' : diff === 'medium' ? 'Medium+ ' : ''}LeetCode problems`

export function GoalTypePicker({ value, onChange }) {
  const opts = [['skill', Target, 'Skill goal', 'Learn or deliver something, finished with proof'], ['leetcode', Code, 'LeetCode target', 'Solve N problems by a date, counted automatically']]
  return (
    <fieldset className="grid grid-cols-2 gap-2 border-0 p-0 m-0">
      <legend className="sr-only">Goal type</legend>
      {opts.map(([v, Icon, label, hint]) => (
        <label key={v} className={`flex gap-2.5 items-start p-3 rounded-lg border cursor-pointer ${value === v ? 'border-accent bg-accent-soft' : 'border-line bg-white hover:bg-canvas'}`}>
          <input type="radio" name="goal-type" className="sr-only" checked={value === v} onChange={() => onChange(v)} />
          <Icon size={18} className={value === v ? 'text-accent mt-0.5' : 'text-muted mt-0.5'} aria-hidden />
          <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
        </label>
      ))}
    </fieldset>
  )
}

export function LeetCodeFields({ f, set }) {
  const days = f.target_date && f.start_date && f.target_date >= f.start_date ? daysBetween(f.start_date, f.target_date) + 1 : null
  let weekdays = 0
  if (days) for (let d = f.start_date; d <= f.target_date; d = addDays(d, 1)) if (!isWeekend(d)) weekdays++
  return <>
    <div className="grid grid-cols-2 gap-3">
      <label className="label">Problems to solve
        <input type="number" className="input" min={1} max={5000} value={f.lc_target} onChange={set('lc_target')} required />
      </label>
      <label className="label">Which problems count
        <select className="input" value={f.lc_difficulty} onChange={set('lc_difficulty')}>
          {Object.entries(LC_DIFF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <label className="label">From
        <input type="date" className="input" value={f.start_date} onChange={set('start_date')} required />
      </label>
      <label className="label">To
        <input type="date" className="input" value={f.target_date} min={f.start_date} onChange={set('target_date')} required />
      </label>
    </div>
    {days && f.lc_target > 0 && <p className="m-0 text-[13px] text-muted -mt-1">{days} days ({weekdays} weekdays) · about <b className="text-ink">{(f.lc_target / Math.max(1, weekdays)).toFixed(1)} problems per weekday</b></p>}
    <label className="label">Title <span className="text-faint font-normal">(optional)</span>
      <input className="input" value={f.title} onChange={set('title')} placeholder={lcTitle(f.lc_target, f.lc_difficulty)} maxLength={200} />
    </label>
  </>
}

export function LogProgressDialog({ goal, onClose }) {
  const [progress, setProgress] = useState(Math.min(goal.progress, 95))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const run = useAction()
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    if (await run(() => api.addGoalUpdate({ goal_id: goal.id, user_id: goal.user_id, note: note.trim(), progress: Number(progress) }), 'Progress logged', ['goals', 'updates', 'goalUpdates'])) onClose()
    setBusy(false)
  }
  return (
    <Modal title="Log progress" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="m-0 text-sm text-muted">{goal.title}</p>
        <label className="label">Progress: <span className="text-ink font-semibold">{progress}%</span>
          <input type="range" min="0" max="95" step="5" value={progress} onChange={(e) => setProgress(e.target.value)} className="accent-[#3B4BD8] h-10" />
          <span className="text-xs text-muted font-normal">Finished? Use “Submit for approval” instead, with a certificate or link.</span>
        </label>
        <label className="label">What did you do?
          <textarea className="input resize-y" rows={3} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Finished module 3 and built the demo agent" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!note.trim()}>Save update</Button>
        </div>
      </form>
    </Modal>
  )
}

export function SubmitDialog({ goal, onClose }) {
  const [url, setUrl] = useState(goal.evidence_url || '')
  const [note, setNote] = useState(goal.evidence_note || '')
  const [busy, setBusy] = useState(false)
  const run = useAction()
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    if (await run(() => api.submitGoal(goal.id, url.trim(), note.trim()), 'Sent to your lead for approval', ['goals'])) onClose()
    setBusy(false)
  }
  return (
    <Modal title="Submit for approval" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="m-0 text-sm text-muted">Your lead will review <b className="text-ink">{goal.title}</b>. The goal counts as completed once it's approved.</p>
        <label className="label">Proof link
          <input type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Certificate, GitHub repo, recording, slides…" />
        </label>
        <label className="label">Note for your lead
          <textarea className="input resize-y" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you delivered and anything worth knowing" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" icon={Send} loading={busy} disabled={!url.trim() && !note.trim()}>Submit</Button>
        </div>
      </form>
    </Modal>
  )
}

export function ReviewDialog({ goal, onClose }) {
  const people = useProfiles().data || []
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(null)
  const run = useAction()
  const owner = people.find((p) => p.id === goal.user_id)
  async function decide(approve) {
    setBusy(approve ? 'yes' : 'no')
    if (await run(() => api.reviewGoal(goal.id, approve, comment.trim()), approve ? 'Goal approved' : 'Sent back with your comments', ['goals', 'comments'])) onClose()
    setBusy(null)
  }
  return (
    <Modal title="Review goal" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={owner?.full_name || ''} size={36} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{owner?.full_name}</div>
            <div className="text-xs text-muted">{goal.skill_area} · {goal.skill}</div>
          </div>
        </div>
        <div>
          <div className="text-[15px] font-semibold">{goal.title}</div>
          {goal.description && <p className="text-sm text-muted mt-1 mb-0 whitespace-pre-line">{goal.description}</p>}
        </div>
        <div className="bg-canvas rounded-lg p-3 text-sm flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Proof</span>
          {goal.evidence_url ? <a href={goal.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent break-all">{goal.evidence_url}<ExternalLink size={13} aria-hidden /></a> : <span className="text-muted">No link</span>}
          {goal.evidence_note && <span>{goal.evidence_note}</span>}
        </div>
        <label className="label">Comment <span className="text-faint font-normal">(required to request changes)</span>
          <textarea className="input resize-y" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Feedback for the trainer" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" icon={X} loading={busy === 'no'} disabled={!comment.trim() || !!busy} onClick={() => decide(false)}>Request changes</Button>
          <Button variant="success" icon={Check} loading={busy === 'yes'} disabled={!!busy} onClick={() => decide(true)}>Approve</Button>
        </div>
      </div>
    </Modal>
  )
}

export { Badge }
