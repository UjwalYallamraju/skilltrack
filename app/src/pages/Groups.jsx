import { useCallback, useEffect, useState } from 'react'
import { addGroupMembers, deleteGroup, getGroups, getProfiles, removeGroupMember, saveGroup, setGroupLead } from '../lib/data'
import { Button, Empty, ErrorNote, Modal, Spinner } from '../components/ui'

export default function Groups() {
  const [groups, setGroups] = useState(null)
  const [people, setPeople] = useState([])
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // group object, or {} for new
  const [adding, setAdding] = useState(null) // group to add members to

  const load = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([getGroups(), getProfiles()])
      setGroups(g); setPeople(p)
    } catch (e) { setError(e) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = (fn) => async (...args) => {
    setError(null)
    try { await fn(...args); await load() } catch (e) { setError(e) }
  }
  const remove = run(async (g) => {
    if (!window.confirm(`Delete the group "${g.name}"? Its members stay in SkillTrack; only the group is removed.`)) return
    await deleteGroup(g.id)
  })
  const removeMember = run((g, p) => removeGroupMember(g.id, p.id))
  const toggleLead = run((g, m) => setGroupLead(g.id, m.user_id, !m.is_lead))

  if (!groups) return error ? <ErrorNote error={error} /> : <Spinner />

  const byId = Object.fromEntries(people.map((p) => [p.id, p]))
  const grouped = new Set(groups.flatMap((g) => g.members.map((m) => m.user_id)))
  const ungrouped = people.filter((p) => p.role === 'trainer' && !grouped.has(p.id))

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h1 className="m-0 font-display text-3xl">Groups</h1>
          <p className="mt-1.5 mb-0 text-muted text-sm max-w-2xl">Trainers see the goals and LeetCode progress of people who share a group with them. A trainer can be in several groups. Group leads can also set daily LeetCode targets for their members.</p>
        </div>
        <Button onClick={() => setEditing({})}>New group</Button>
      </header>
      <ErrorNote error={error} />

      {ungrouped.length > 0 && (
        <div className="text-sm bg-warn-bg text-warn-fg rounded-lg px-4 py-3">
          <b>{ungrouped.length} trainer{ungrouped.length === 1 ? ' is' : 's are'} not in any group</b> and can only see their own data: {ungrouped.map((p) => p.full_name || p.email).join(', ')}.
        </div>
      )}

      {groups.length === 0 ? <Empty>No groups yet. Click “New group” to create your first team.</Empty> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
          {groups.map((g) => {
            const members = [...g.members].sort((a, b) => (b.is_lead - a.is_lead) || (byId[a.user_id]?.full_name || '').localeCompare(byId[b.user_id]?.full_name || ''))
            return (
              <section key={g.id} className="card p-5 flex flex-col gap-3" aria-labelledby={`g-${g.id}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h2 id={`g-${g.id}`} className="m-0 text-lg font-semibold">{g.name}</h2>
                    {g.description && <p className="m-0 mt-1 text-[13px] text-muted">{g.description}</p>}
                    <p className="m-0 mt-1 text-xs text-muted">{members.length} member{members.length === 1 ? '' : 's'} · {members.filter((m) => m.is_lead).length} lead{members.filter((m) => m.is_lead).length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-1 flex-none">
                    <button onClick={() => setEditing(g)} className="text-xs text-accent bg-transparent border-0 cursor-pointer px-2 py-2">Edit</button>
                    <button onClick={() => remove(g)} className="text-xs text-bad-fg bg-transparent border-0 cursor-pointer px-2 py-2">Delete</button>
                  </div>
                </div>
                <ul className="list-none p-0 m-0 flex flex-col">
                  {members.length === 0 && <li className="text-sm text-muted py-2">No members yet.</li>}
                  {members.map((m) => {
                    const p = byId[m.user_id]
                    return (
                      <li key={m.user_id} className="flex items-center gap-2 py-2 border-t border-soft text-sm">
                        <span className="flex-1 min-w-0 truncate">
                          <span className="font-semibold">{p?.full_name || p?.email || 'Unknown'}</span>
                          {m.is_lead && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide bg-done-bg text-accent-dark px-1.5 py-0.5 rounded">Lead</span>}
                        </span>
                        <button onClick={() => toggleLead(g, m)} className="text-xs text-accent bg-transparent border-0 cursor-pointer px-1.5 py-2">{m.is_lead ? 'Remove lead' : 'Make lead'}</button>
                        <button onClick={() => removeMember(g, { id: m.user_id })} aria-label={`Remove ${p?.full_name} from ${g.name}`} className="text-xs text-bad-fg bg-transparent border-0 cursor-pointer px-1.5 py-2">Remove</button>
                      </li>
                    )
                  })}
                </ul>
                <Button variant="secondary" onClick={() => setAdding(g)} className="mt-auto">Add members</Button>
              </section>
            )
          })}
        </div>
      )}

      {editing && <GroupForm group={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {adding && (
        <AddMembers group={adding} people={people} onClose={() => setAdding(null)}
          onSaved={() => { setAdding(null); load() }} />
      )}
    </div>
  )
}

function GroupForm({ group, onClose, onSaved }) {
  const [name, setName] = useState(group.name || '')
  const [description, setDescription] = useState(group.description || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try { await saveGroup({ id: group.id, name: name.trim(), description: description.trim() }); onSaved() }
    catch (err) { setError(/duplicate|unique/i.test(err.message) ? 'A group with that name already exists.' : err) }
    finally { setBusy(false) }
  }
  return (
    <Modal title={group.id ? 'Edit group' : 'New group'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">Group name
          <input className="input font-normal" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. GenAI Team, Batch A" />
        </label>
        <label className="label">Description (optional)
          <input className="input font-normal" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="What this group works on" />
        </label>
        <ErrorNote error={error} />
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : group.id ? 'Save changes' : 'Create group'}</Button>
      </form>
    </Modal>
  )
}

function AddMembers({ group, people, onClose, onSaved }) {
  const inGroup = new Set(group.members.map((m) => m.user_id))
  const candidates = people.filter((p) => !inGroup.has(p.id))
  const [picked, setPicked] = useState(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const shown = candidates.filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(filter.toLowerCase()))
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  async function submit() {
    setBusy(true)
    try { await addGroupMembers(group.id, [...picked]); onSaved() } catch (e) { setError(e) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Add members to ${group.name}`} onClose={onClose}>
      {candidates.length === 0 ? <p className="text-sm text-muted m-0">Everyone is already in this group.</p> : (
        <div className="flex flex-col gap-3">
          <label className="label">Search
            <input className="input font-normal" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name or email" />
          </label>
          <ul className="list-none p-0 m-0 max-h-[50vh] overflow-y-auto border border-line rounded-lg">
            {shown.map((p) => (
              <li key={p.id} className="border-b border-soft last:border-0">
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-canvas">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#3B4BD8]" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">{p.full_name || '—'}{p.role === 'admin' && <span className="text-muted font-normal"> (admin)</span>}</span>
                    <span className="block text-xs text-muted">{p.email}</span>
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">No matches.</li>}
          </ul>
          <ErrorNote error={error} />
          <Button onClick={submit} disabled={busy || picked.size === 0}>{busy ? 'Adding…' : `Add ${picked.size || ''} member${picked.size === 1 ? '' : 's'}`}</Button>
        </div>
      )}
    </Modal>
  )
}
