import { useState } from 'react'
import { addGoalUpdate, deleteGoal, saveGoal } from '../lib/data'
import { fmtDate, fmtDateTime, daysBetween, todayIST } from '../lib/dates'
import { Button, ErrorNote, Modal, ProgressBar, StatusBadge } from './ui'
import GoalForm from './GoalForm'

export function statusNote(g) {
  const left = daysBetween(todayIST(), g.target_date)
  if (g.status === 'completed') return g.completed_at ? `Completed on ${fmtDate(g.completed_at)}` : 'Completed'
  if (g.status === 'overdue') return `Target was ${fmtDate(g.target_date)} · ${g.progress}% done`
  if (g.status === 'at_risk') return g.flagged_by_trainer ? 'Flagged at risk by trainer' : `Auto-flagged: ${left} day${left === 1 ? '' : 's'} left with ${g.progress}% done`
  return `${left} day${left === 1 ? '' : 's'} left`
}

export default function GoalCard({ goal: g, updates = [], editable, areas, onChange, showOwner }) {
  const [mode, setMode] = useState(null) // log | edit | history
  const [error, setError] = useState(null)
  const latest = updates[0]

  async function toggleRisk() {
    try { await saveGoal({ id: g.id, manual_at_risk: !g.manual_at_risk }); onChange() } catch (e) { setError(e) }
  }
  async function remove() {
    if (!window.confirm(`Delete the goal "${g.title}" and its progress history? This can't be undone.`)) return
    try { await deleteGoal(g.id); onChange() } catch (e) { setError(e) }
  }
  async function reopen() {
    try { await saveGoal({ id: g.id, completed: false, progress: Math.min(g.progress, 90) }); onChange() } catch (e) { setError(e) }
  }

  return (
    <article className="card p-5 md:px-6 flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-accent uppercase tracking-wide">{g.skill_area}{showOwner && <span className="text-muted normal-case tracking-normal"> · {g.owner_name}</span>}</div>
          <h3 className="mt-1 mb-0 text-lg font-semibold">{g.title}</h3>
          <div className="text-[13px] text-muted mt-1">Skill: {g.skill} · {fmtDate(g.start_date, { day: 'numeric', month: 'short' })} → {fmtDate(g.target_date)}</div>
          {g.description && <p className="text-sm text-muted mt-2 mb-0 whitespace-pre-line">{g.description}</p>}
        </div>
        <StatusBadge status={g.status} />
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={g.progress} status={g.status} />
        <span className="font-semibold text-sm w-11 text-right">{g.progress}%</span>
      </div>
      {(g.status === 'at_risk' || g.status === 'overdue') && (
        <div className={`text-xs px-3 py-2 rounded-lg ${g.status === 'overdue' ? 'bg-bad-bg text-bad-fg' : 'bg-warn-bg text-warn-fg'}`}>{statusNote(g)}</div>
      )}
      <div className="text-[13px] text-muted border-t border-soft pt-3">
        {latest ? (
          <><span className="font-semibold text-ink">Latest update · {fmtDateTime(latest.created_at)}</span> — {latest.note}</>
        ) : 'No progress updates yet.'}
        {updates.length > 1 && <button onClick={() => setMode('history')} className="ml-2 text-accent bg-transparent border-0 cursor-pointer p-0 text-[13px]">All updates ({updates.length})</button>}
      </div>
      <ErrorNote error={error} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          {g.status !== 'completed' ? (
            <>
              <Button onClick={() => setMode('log')}>Log progress</Button>
              <Button variant="secondary" onClick={() => setMode('edit')}>Edit</Button>
              <Button variant="secondary" onClick={toggleRisk}>{g.manual_at_risk ? 'Remove at-risk flag' : 'Mark at risk'}</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={reopen}>Reopen goal</Button>
          )}
          <Button variant="ghost" onClick={remove} className="ml-auto">Delete</Button>
        </div>
      )}

      {mode === 'log' && <LogProgress goal={g} onClose={() => setMode(null)} onSaved={() => { setMode(null); onChange() }} />}
      {mode === 'edit' && (
        <Modal title="Edit goal" onClose={() => setMode(null)}>
          <GoalForm goal={g} areas={areas} onSaved={() => { setMode(null); onChange() }} onCancel={() => setMode(null)} />
        </Modal>
      )}
      {mode === 'history' && (
        <Modal title={`Progress updates · ${g.title}`} onClose={() => setMode(null)}>
          <ol className="list-none p-0 m-0 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
            {updates.map((u) => (
              <li key={u.id} className="border-l-2 border-accent pl-3">
                <div className="text-xs text-muted">{fmtDateTime(u.created_at)}{u.progress != null && ` · ${u.progress}%`}</div>
                <div className="text-sm">{u.note}</div>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </article>
  )
}

function LogProgress({ goal, onClose, onSaved }) {
  const [progress, setProgress] = useState(goal.progress)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await addGoalUpdate({ goal_id: goal.id, user_id: goal.user_id, note: note.trim(), progress: Number(progress) })
      onSaved()
    } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Log progress · ${goal.title}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">Progress: {progress}%
          <input type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(e.target.value)} className="accent-[#3B4BD8] h-11" />
        </label>
        <label className="label">What did you do?
          <textarea className="input font-normal resize-y" rows={3} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Finished module 3 and built the demo agent" />
        </label>
        {Number(progress) === 100 && <p className="m-0 text-sm text-accent-dark bg-done-bg px-3 py-2 rounded-lg">100% will mark this goal as completed.</p>}
        <ErrorNote error={error} />
        <Button type="submit" disabled={busy || !note.trim()}>{busy ? 'Saving…' : 'Save update'}</Button>
      </form>
    </Modal>
  )
}
