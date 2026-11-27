import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, Lock, Plus, Trash2 } from 'lucide-react'
import * as api from '../lib/data'
import { useActionItems, useNotes, useProfiles } from '../lib/queries'
import { useMe } from '../lib/me'
import { fmtDate, todayIST } from '../lib/dates'
import { relDay } from '../lib/insights'
import { useAction } from './goals'
import { Avatar, Badge, Button, EmptyState, Modal, useFeedback } from './ui'
import { ListTodo, NotebookPen } from 'lucide-react'

export function PersonLink({ person, size = 32, sub }) {
  if (!person) return null
  return (
    <Link to={`/people/${encodeURIComponent(person.id)}`} className="flex items-center gap-3 min-w-0 no-underline text-ink group">
      <Avatar name={person.full_name || person.email} size={size} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold truncate group-hover:text-accent">{person.full_name || person.email}</span>
        {sub && <span className="block text-xs text-muted truncate">{sub}</span>}
      </span>
    </Link>
  )
}

// ------------------------------------------------------------------ Notes
export function NoteDialog({ trainer, onClose }) {
  const { profile } = useMe()
  const [body, setBody] = useState('')
  const [date, setDate] = useState(todayIST())
  const [shared, setShared] = useState(false)
  const [items, setItems] = useState([{ title: '', due: '' }])
  const [busy, setBusy] = useState(false)
  const run = useAction()
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const ok = await run(async () => {
      const note = await api.addNote({ trainer_id: trainer.id, author_id: profile.id, body: body.trim(), meeting_date: date, shared })
      for (const it of items.filter((x) => x.title.trim()))
        await api.addActionItem({ trainer_id: trainer.id, created_by: profile.id, title: it.title.trim(), due_date: it.due || null, note_id: note.id })
    }, 'Note saved', ['notes', 'actions'])
    setBusy(false)
    if (ok) onClose()
  }
  const setItem = (i, k, v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  return (
    <Modal title={`1:1 note · ${trainer.full_name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid sm:grid-cols-[180px_1fr] gap-3 items-end">
          <label className="label">Meeting date
            <input type="date" className="input" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <fieldset className="flex gap-2 border-0 p-0 m-0">
            <legend className="sr-only">Who can see this note</legend>
            {[[false, Lock, 'Private', 'Only leads and admins'], [true, Eye, 'Shared', `${trainer.full_name?.split(' ')[0] || 'Trainer'} can read it`]].map(([v, Icon, label, hint]) => (
              <label key={label} className={`flex-1 flex items-center gap-2 h-10 px-3 rounded-lg border cursor-pointer text-sm ${shared === v ? 'border-accent bg-accent-soft' : 'border-line bg-white'}`}>
                <input type="radio" name="vis" className="sr-only" checked={shared === v} onChange={() => setShared(v)} />
                <Icon size={15} aria-hidden /><span className="font-semibold">{label}</span><span className="text-xs text-muted hidden sm:inline">· {hint}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <label className="label">Notes
          <textarea className="input resize-y" rows={6} required value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="What you discussed, blockers, how they're feeling, what's next…" />
        </label>
        <div className="flex flex-col gap-2">
          <span className="label">Follow-ups <span className="text-faint font-normal text-xs">(the trainer sees these and can tick them off)</span></span>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" placeholder="e.g. Finish the DP problem set" value={it.title} onChange={(e) => setItem(i, 'title', e.target.value)} aria-label={`Follow-up ${i + 1}`} />
              <input type="date" className="input w-[160px] flex-none" value={it.due} min={todayIST()} onChange={(e) => setItem(i, 'due', e.target.value)} aria-label={`Due date ${i + 1}`} />
            </div>
          ))}
          <button type="button" onClick={() => setItems((xs) => [...xs, { title: '', due: '' }])} className="self-start text-sm text-accent bg-transparent border-0 cursor-pointer p-0 inline-flex items-center gap-1"><Plus size={15} aria-hidden />Add another</button>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!body.trim()}>Save note</Button>
        </div>
      </form>
    </Modal>
  )
}

export function NotesList({ trainer, canWrite }) {
  const { data: notes = [], isLoading } = useNotes(trainer.id)
  const people = useProfiles().data || []
  const { profile, isAdmin } = useMe()
  const { confirm } = useFeedback()
  const run = useAction()
  const [open, setOpen] = useState(false)
  const name = (id) => people.find((p) => p.id === id)?.full_name || 'Someone'
  async function remove(n) {
    if (!(await confirm({ title: 'Delete note?', message: 'This 1:1 note will be deleted. Follow-ups created from it stay.', confirmLabel: 'Delete', danger: true }))) return
    run(() => api.deleteNote(n.id), 'Note deleted', ['notes'])
  }
  return (
    <div className="flex flex-col gap-3">
      {canWrite && <div><Button icon={NotebookPen} onClick={() => setOpen(true)}>New 1:1 note</Button></div>}
      {isLoading ? <span className="text-sm text-muted">Loading…</span> : notes.length === 0 ? (
        <div className="card"><EmptyState icon={NotebookPen} title="No 1:1 notes yet">{canWrite ? 'Capture what you discussed after each 1:1. Private notes are visible only to leads and admins.' : 'Notes your lead shares with you appear here.'}</EmptyState></div>
      ) : (
        <ol className="list-none p-0 m-0 flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-2">
                <span className="font-semibold text-ink text-sm">{fmtDate(n.meeting_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span>· by {name(n.author_id)}</span>
                {n.shared ? <Badge tone="info" icon={Eye}>Shared</Badge> : <Badge icon={Lock}>Private</Badge>}
                {(n.author_id === profile.id || isAdmin) && (
                  <button onClick={() => remove(n)} aria-label="Delete note" className="ml-auto text-muted hover:text-bad-fg bg-transparent border-0 cursor-pointer"><Trash2 size={15} aria-hidden /></button>
                )}
              </div>
              <p className="m-0 text-sm whitespace-pre-line leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
      {open && <NoteDialog trainer={trainer} onClose={() => setOpen(false)} />}
    </div>
  )
}

// ------------------------------------------------------------------ Action items
export function ActionItems({ trainer, canManage, showDone = true, title }) {
  const all = useActionItems().data || []
  const items = all.filter((a) => a.trainer_id === trainer.id)
  const open = items.filter((a) => !a.done)
  const done = items.filter((a) => a.done).slice(0, 5)
  const { profile } = useMe()
  const run = useAction()
  const [adding, setAdding] = useState(false)
  const today = todayIST()
  const toggle = (a) => run(() => api.updateActionItem(a.id, { done: !a.done }), a.done ? 'Marked not done' : 'Done', ['actions'])
  const Row = ({ a }) => {
    const overdue = !a.done && a.due_date && a.due_date < today
    return (
      <li className="flex items-start gap-3 py-2.5 border-t border-line first:border-t-0">
        <button onClick={() => toggle(a)} aria-label={a.done ? `Mark “${a.title}” not done` : `Mark “${a.title}” done`}
          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-none cursor-pointer ${a.done ? 'bg-ok border-ok text-white' : 'bg-white border-[#D1D5DB] hover:border-accent'}`}>
          {a.done && <Check size={13} aria-hidden />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm ${a.done ? 'line-through text-muted' : ''}`}>{a.title}</div>
          <div className={`text-xs ${overdue ? 'text-bad-fg font-semibold' : 'text-muted'}`}>
            {a.done ? `Done ${relDay(a.done_at?.slice(0, 10))}` : a.due_date ? `${overdue ? 'Overdue · ' : ''}Due ${fmtDate(a.due_date, { day: 'numeric', month: 'short' })}` : 'No due date'}
          </div>
        </div>
        {canManage && (a.created_by === profile.id) && (
          <button onClick={() => run(() => api.deleteActionItem(a.id), 'Follow-up removed', ['actions'])} aria-label="Remove follow-up" className="text-muted hover:text-bad-fg bg-transparent border-0 cursor-pointer"><Trash2 size={15} aria-hidden /></button>
        )}
      </li>
    )
  }
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="m-0 text-[15px] font-semibold">{title || 'Follow-ups'} {open.length > 0 && <span className="text-muted font-normal">({open.length} open)</span>}</h2>
        {canManage && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Add</Button>}
      </div>
      <div className="px-5 pb-4 pt-2">
        {items.length === 0 ? <EmptyState icon={ListTodo} title="No follow-ups">{canManage ? 'Agree next steps in a 1:1 and track them here.' : 'Follow-ups from your lead appear here.'}</EmptyState> : (
          <ul className="list-none p-0 m-0">
            {open.map((a) => <Row key={a.id} a={a} />)}
            {showDone && done.map((a) => <Row key={a.id} a={a} />)}
          </ul>
        )}
      </div>
      {adding && <AddActionDialog trainer={trainer} onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddActionDialog({ trainer, onClose }) {
  const { profile } = useMe()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const run = useAction()
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    if (await run(() => api.addActionItem({ trainer_id: trainer.id, created_by: profile.id, title: title.trim(), due_date: due || null }), 'Follow-up added', ['actions'])) onClose()
    setBusy(false)
  }
  return (
    <Modal title={`Follow-up for ${trainer.full_name}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">What should they do?
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Share the RAG demo with the team" />
        </label>
        <label className="label">Due date <span className="text-faint font-normal">(optional)</span>
          <input type="date" className="input" value={due} min={todayIST()} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!title.trim()}>Add follow-up</Button>
        </div>
      </form>
    </Modal>
  )
}
