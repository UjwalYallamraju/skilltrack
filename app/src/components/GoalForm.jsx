import { useState } from 'react'
import { saveGoal } from '../lib/data'
import { todayIST } from '../lib/dates'
import { Button, ErrorNote } from './ui'

export default function GoalForm({ userId, areas, goal, onSaved, onCancel, compact = false }) {
  const [f, setF] = useState(() => ({
    skill_area_id: goal?.skill_area_id ?? areas[0]?.id ?? '',
    skill: goal?.skill ?? '',
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    start_date: goal?.start_date ?? todayIST(),
    target_date: goal?.target_date ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (f.target_date < f.start_date) return setError('Target date must be on or after the start date.')
    setBusy(true)
    try {
      const row = { ...f, skill_area_id: Number(f.skill_area_id) }
      if (goal) row.id = goal.id
      else row.user_id = userId
      await saveGoal(row)
      if (!goal) setF({ ...f, skill: '', title: '', description: '', target_date: '' })
      onSaved?.()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <label className="label">Skill area
        <select className="input font-normal" value={f.skill_area_id} onChange={set('skill_area_id')} required>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="label">Specific skill
        <input className="input font-normal" placeholder="e.g. LangGraph multi-agent workflows" value={f.skill} onChange={set('skill')} required maxLength={120} />
      </label>
      <label className="label">Goal
        <input className="input font-normal" placeholder="e.g. Build and deliver a 1-day workshop" value={f.title} onChange={set('title')} required maxLength={200} />
      </label>
      {!compact && (
        <label className="label">Details (optional)
          <textarea className="input font-normal resize-y" rows={3} value={f.description} onChange={set('description')} placeholder="How will you get there? Courses, projects, certification…" />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Start date
          <input type="date" className="input font-normal" value={f.start_date} onChange={set('start_date')} required />
        </label>
        <label className="label">Target date
          <input type="date" className="input font-normal" value={f.target_date} min={f.start_date} onChange={set('target_date')} required />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1 h-12">{busy ? 'Saving…' : goal ? 'Save changes' : 'Save goal'}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  )
}
