import { useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Crown, Layers, Pencil, Plus, Search, Tags, Trash2, UserMinus, Users, TriangleAlert } from 'lucide-react'
import { useMe } from '../lib/me'
import { useGroups, useProfiles, useSkillAreas } from '../lib/queries'
import { ALLOWED_DOMAIN } from '../lib/supabase'
import * as api from '../lib/data'
import { fmtDate } from '../lib/dates'
import { useAction } from '../components/goals'
import { PersonLink } from '../components/people'
import { Badge, Button, EmptyState, ErrorNote, IconButton, Modal, PageHeader, PageSkeleton, Tabs, useFeedback } from '../components/ui'

export default function Settings() {
  const { isAdmin } = useMe()
  const nav = useNavigate()
  const loc = useLocation()
  const tab = loc.pathname.split('/')[2] || 'members'
  const tabs = [
    { id: 'members', label: 'Members', icon: Users },
    ...(isAdmin ? [{ id: 'groups', label: 'Groups', icon: Layers }, { id: 'skills', label: 'Skill areas', icon: Tags }] : []),
  ]
  return (
    <>
      <PageHeader title="Settings" subtitle={isAdmin ? 'People, groups and skill areas' : 'Daily targets for the people in your groups'} />
      <Tabs tabs={tabs} value={tab} onChange={(t) => nav(`/settings/${t}`)} className="mb-5" />
      <Routes>
        <Route index element={<Navigate to="members" replace />} />
        <Route path="members" element={<Members />} />
        {isAdmin && <Route path="groups" element={<Groups />} />}
        {isAdmin && <Route path="skills" element={<SkillAreas />} />}
        <Route path="*" element={<Navigate to="members" replace />} />
      </Routes>
    </>
  )
}

// ------------------------------------------------------------------ Members
function Members() {
  const me = useMe()
  const { confirm } = useFeedback()
  const run = useAction()
  const people = useProfiles()
  const groups = useGroups()
  const [q, setQ] = useState('')
  if (people.error || groups.error) return <ErrorNote error={people.error || groups.error} />
  if (!people.data || !groups.data) return <PageSkeleton />
  const led = new Set(groups.data.filter((g) => me.profile.leadGroupIds.includes(g.id)).flatMap((g) => g.members.map((m) => m.user_id)))
  const list = (me.isAdmin ? people.data : people.data.filter((p) => led.has(p.id) && p.id !== me.profile.id))
    .filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()))
  const groupNames = (id) => groups.data.filter((g) => g.members.some((m) => m.user_id === id)).map((g) => g.name)
  const leadOf = (id) => groups.data.filter((g) => g.members.some((m) => m.user_id === id && m.is_lead)).map((g) => g.name)

  async function setRole(p, role) {
    if (p.id === me.profile.id && role !== 'admin' && !(await confirm({ title: 'Remove your own admin access?', message: 'You will lose access to the admin settings straight away.', confirmLabel: 'Remove my access', danger: true }))) return
    run(() => api.updateProfile(p.id, { role }), 'Role updated', ['profiles'])
  }
  return (
    <div className="flex flex-col gap-4">
      {me.isAdmin ? <RolesHelp /> : <p className="m-0 text-sm text-muted">Set each person's daily LeetCode target. Weekdays only.</p>}
      <label className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
        <input className="input pl-9" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
      </label>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[820px]">
          <thead className="bg-canvas border-b border-line"><tr className="text-left text-xs text-muted">
            {['Person', 'Groups', 'LeetCode', 'Daily target', 'Role', 'Leads', 'Joined'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-line first:border-t-0">
                <td className="px-4 py-2.5"><PersonLink person={p} sub={p.email} /></td>
                <td className="px-4 py-2.5 text-muted">{groupNames(p.id).join(', ') || <span className="text-faint">None</span>}</td>
                <td className="px-4 py-2.5">{p.leetcode_username ? `@${p.leetcode_username}` : <span className="text-faint">Not linked</span>}</td>
                <td className="px-4 py-2.5">
                  <select className="input h-9 w-[110px]" value={p.daily_target} aria-label={`Daily target for ${p.full_name}`}
                    onChange={(e) => run(() => api.updateProfile(p.id, { daily_target: Number(e.target.value) }), 'Daily target saved', ['profiles', 'lcSummary'])}>
                    {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'None' : `${i} / day`}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  {me.isAdmin ? (
                    <select className="input h-9 w-[130px]" value={p.role} onChange={(e) => setRole(p, e.target.value)} aria-label={`Role for ${p.full_name}`}>
                      <option value="trainer">Trainer</option><option value="admin">Admin</option>
                    </select>
                  ) : <span>{p.role === 'admin' ? 'Admin' : 'Trainer'}</span>}
                </td>
                <td className="px-4 py-2.5 text-muted">{leadOf(p.id).join(', ') || <span className="text-faint">—</span>}</td>
                <td className="px-4 py-2.5 text-muted whitespace-nowrap">{fmtDate(p.created_at)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7}><EmptyState icon={Users} title="No members found" /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Groups
function Groups() {
  const { confirm } = useFeedback()
  const run = useAction()
  const groups = useGroups()
  const people = useProfiles()
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(null)
  if (groups.error || people.error) return <ErrorNote error={groups.error || people.error} />
  if (!groups.data || !people.data) return <PageSkeleton />
  const byId = Object.fromEntries(people.data.map((p) => [p.id, p]))
  const grouped = new Set(groups.data.flatMap((g) => g.members.map((m) => m.user_id)))
  const ungrouped = people.data.filter((p) => p.role === 'trainer' && !grouped.has(p.id))

  async function remove(g) {
    if (!(await confirm({ title: `Delete “${g.name}”?`, message: 'Members stay in SkillTrack; only the group and its lead roles are removed.', confirmLabel: 'Delete group', danger: true }))) return
    run(() => api.deleteGroup(g.id), 'Group deleted', ['groups'])
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className="m-0 text-sm text-muted max-w-2xl">Trainers see teammates who share a group. Group leads get Today, Approvals and 1:1 tools for their members.</p>
        <Button icon={Plus} onClick={() => setEditing({})}>New group</Button>
      </div>
      {ungrouped.length > 0 && (
        <div className="text-sm bg-warn-bg text-warn-fg rounded-lg px-4 py-3 flex gap-2 items-start">
          <TriangleAlert size={16} className="mt-0.5 flex-none" aria-hidden />
          <span><b>{ungrouped.length} trainer{ungrouped.length === 1 ? ' is' : 's are'} not in a group</b> and have no lead: {ungrouped.map((p) => p.full_name || p.email).join(', ')}.</span>
        </div>
      )}
      {groups.data.length === 0 ? <div className="card"><EmptyState icon={Layers} title="No groups yet" action={<Button icon={Plus} onClick={() => setEditing({})}>Create a group</Button>}>Create a group, add trainers and pick a lead.</EmptyState></div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.data.map((g) => {
            const members = [...g.members].sort((a, b) => (b.is_lead - a.is_lead) || (byId[a.user_id]?.full_name || '').localeCompare(byId[b.user_id]?.full_name || ''))
            return (
              <section key={g.id} className="card p-5 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h2 className="m-0 text-base font-semibold">{g.name}</h2>
                    {g.description && <p className="m-0 mt-0.5 text-[13px] text-muted">{g.description}</p>}
                    <p className="m-0 mt-1 text-xs text-muted">{members.length} member{members.length === 1 ? '' : 's'} · {members.filter((m) => m.is_lead).length || 'no'} lead{members.filter((m) => m.is_lead).length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex flex-none">
                    <IconButton icon={Pencil} label={`Edit ${g.name}`} onClick={() => setEditing(g)} />
                    <IconButton icon={Trash2} label={`Delete ${g.name}`} onClick={() => remove(g)} />
                  </div>
                </div>
                <ul className="list-none p-0 m-0">
                  {members.length === 0 && <li className="text-sm text-muted py-2">No members yet.</li>}
                  {members.map((m) => {
                    const p = byId[m.user_id]
                    return (
                      <li key={m.user_id} className="flex items-center gap-2 py-2 border-t border-line">
                        <div className="flex-1 min-w-0"><PersonLink person={p} size={28} sub={m.is_lead && <span className="inline-flex items-center gap-1 text-info-fg font-semibold"><Crown size={12} aria-hidden />Group lead</span>} /></div>
                        <Button size="sm" variant="ghost" onClick={() => run(() => api.setGroupLead(g.id, m.user_id, !m.is_lead), m.is_lead ? 'Lead removed' : 'Lead added', ['groups'])}>{m.is_lead ? 'Unset' : 'Make lead'}</Button>
                        <IconButton icon={UserMinus} label={`Remove ${p?.full_name} from ${g.name}`} onClick={() => run(() => api.removeGroupMember(g.id, m.user_id), 'Removed from group', ['groups'])} />
                      </li>
                    )
                  })}
                </ul>
                <Button variant="secondary" icon={Plus} className="mt-auto" onClick={() => setAdding(g)}>Add members</Button>
              </section>
            )
          })}
        </div>
      )}
      {editing && <GroupForm group={editing} onClose={() => setEditing(null)} />}
      {adding && <AddMembers group={adding} people={people.data} onClose={() => setAdding(null)} />}
    </div>
  )
}

function GroupForm({ group, onClose }) {
  const [name, setName] = useState(group.name || '')
  const [description, setDescription] = useState(group.description || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = useAction()
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await api.saveGroup({ id: group.id, name: name.trim(), description: description.trim() }); await run(async () => {}, group.id ? 'Group saved' : 'Group created', ['groups']); onClose() }
    catch (err) { setError(/duplicate|unique/i.test(err.message) ? 'A group with that name already exists.' : err) }
    finally { setBusy(false) }
  }
  return (
    <Modal title={group.id ? 'Edit group' : 'New group'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">Group name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. GenAI Team" /></label>
        <label className="label">Description <span className="text-faint font-normal">(optional)</span><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="What this group works on" /></label>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim()}>{group.id ? 'Save' : 'Create group'}</Button></div>
      </form>
    </Modal>
  )
}

function AddMembers({ group, people, onClose }) {
  const inGroup = new Set(group.members.map((m) => m.user_id))
  const candidates = people.filter((p) => !inGroup.has(p.id))
  const [picked, setPicked] = useState(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const run = useAction()
  const shown = candidates.filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(filter.toLowerCase()))
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  async function submit() {
    setBusy(true)
    if (await run(() => api.addGroupMembers(group.id, [...picked]), `Added ${picked.size} to ${group.name}`, ['groups'])) onClose()
    setBusy(false)
  }
  return (
    <Modal title={`Add members to ${group.name}`} onClose={onClose}>
      {candidates.length === 0 ? <p className="text-sm text-muted m-0">Everyone is already in this group.</p> : (
        <div className="flex flex-col gap-3">
          <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search name or email" aria-label="Search" />
          <ul className="list-none p-0 m-0 max-h-[50vh] overflow-y-auto border border-line rounded-lg">
            {shown.map((p) => (
              <li key={p.id} className="border-b border-line last:border-0">
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-canvas">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#3B4BD8]" />
                  <span className="flex-1 min-w-0"><span className="block text-sm font-semibold">{p.full_name || '—'}</span><span className="block text-xs text-muted">{p.email}</span></span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">No matches.</li>}
          </ul>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={picked.size === 0}>Add {picked.size || ''} member{picked.size === 1 ? '' : 's'}</Button></div>
        </div>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------------ Skill areas
function SkillAreas() {
  const areas = useSkillAreas()
  const run = useAction()
  const { confirm, toast } = useFeedback()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)
  if (areas.error) return <ErrorNote error={areas.error} />
  if (!areas.data) return <PageSkeleton />
  async function remove(a) {
    if (!(await confirm({ title: `Delete “${a.name}”?`, message: 'This only works if no goals use it. Otherwise rename it.', confirmLabel: 'Delete', danger: true }))) return
    try { await api.deleteSkillArea(a.id); await run(async () => {}, 'Skill area deleted', ['skillAreas']) }
    catch (e) { toast(/foreign key/i.test(e.message) ? 'Some goals still use this skill area. Rename it instead.' : e.message, 'bad') }
  }
  return (
    <div className="card p-5 flex flex-col gap-4 max-w-2xl">
      <ul className="list-none p-0 m-0">
        {areas.data.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-2 border-t border-line first:border-t-0">
            {editing?.id === a.id ? (
              <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.renameSkillArea(a.id, editing.name.trim()), 'Renamed', ['skillAreas', 'goals'])) setEditing(null) }}>
                <input className="input h-9" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Skill area name" autoFocus />
                <Button size="sm" type="submit">Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : <>
              <span className="flex-1 text-sm font-semibold">{a.name}</span>
              <IconButton icon={Pencil} label={`Rename ${a.name}`} onClick={() => setEditing({ id: a.id, name: a.name })} />
              <IconButton icon={Trash2} label={`Delete ${a.name}`} onClick={() => remove(a)} />
            </>}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim() && await run(() => api.addSkillArea(name.trim(), areas.data.length + 1), 'Skill area added', ['skillAreas'])) setName('') }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New skill area, e.g. Cloud & DevOps" aria-label="New skill area" />
        <Button type="submit" variant="secondary" icon={Plus} disabled={!name.trim()}>Add</Button>
      </form>
    </div>
  )
}

function RolesHelp() {
  const roles = [
    { name: 'Trainer', who: 'Everyone', what: 'Sets their own goals, logs LeetCode, submits finished goals for approval, and sees teammates in their groups.' },
    { name: 'Group lead', who: 'A trainer you mark as lead in Groups', what: 'Also gets Today, Approvals, 1:1 notes and LeetCode targets for the people in the groups they lead.' },
    { name: 'Admin', who: 'Chosen in the Role column below', what: 'Sees everyone, manages groups and skill areas, changes roles, and can approve any goal.' },
  ]
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="grid md:grid-cols-3 gap-3">
        {roles.map((r) => (
          <div key={r.name} className="rounded-lg bg-canvas p-3">
            <div className="text-sm font-semibold">{r.name}</div>
            <div className="text-xs text-muted mb-1">{r.who}</div>
            <div className="text-[13px] text-ink-2">{r.what}</div>
          </div>
        ))}
      </div>
      <p className="m-0 text-[13px] text-muted">Admins and group leads are trainers too. Use the <b className="text-ink">Viewing as</b> menu at the bottom of the sidebar to switch to the trainer view and work on your own goals. Trainers join by signing up with their @{ALLOWED_DOMAIN} email.</p>
    </div>
  )
}
