import { useCallback, useEffect, useState } from 'react'
import { supabase, ALLOWED_DOMAIN } from '../lib/supabase'
import { getGroups, getProfiles, getSkillAreas, updateProfile } from '../lib/data'
import { fmtDate } from '../lib/dates'
import { Button, ErrorNote, Spinner } from '../components/ui'

export default function Members({ profile }) {
  const [people, setPeople] = useState(null)
  const [areas, setAreas] = useState([])
  const [groups, setGroups] = useState([])
  const isAdmin = profile.role === 'admin'
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  const load = useCallback(async () => {
    try {
      const [p, a, g] = await Promise.all([getProfiles(), getSkillAreas(), getGroups()])
      // Leads manage only people in the groups they lead
      const led = new Set(g.filter((x) => profile.leadGroupIds.includes(x.id)).flatMap((x) => x.members.map((m) => m.user_id)))
      setPeople(isAdmin ? p : p.filter((x) => led.has(x.id) && x.id !== profile.id))
      setAreas(a); setGroups(g)
    } catch (e) { setError(e) }
  }, [isAdmin, profile.id, profile.leadGroupIds])
  useEffect(() => { load() }, [load])

  async function save(p, fields) {
    setError(null)
    if (fields.role === 'trainer' && p.id === profile.id && !window.confirm('Remove your own admin access? You will lose access to this page.')) return
    try {
      await updateProfile(p.id, fields)
      setSaved(p.id); setTimeout(() => setSaved(null), 1500)
      load()
    } catch (e) { setError(e) }
  }

  if (!people) return error ? <ErrorNote error={error} /> : <Spinner />
  const groupNames = (id) => groups.filter((g) => g.members.some((m) => m.user_id === id)).map((g) => g.name).join(', ')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="m-0 font-display text-3xl">Team Members</h1>
        <p className="mt-1.5 mb-0 text-muted text-sm">{isAdmin
          ? <>Trainers join by creating an account with their @{ALLOWED_DOMAIN} email. Set each trainer's daily LeetCode target here, and put them into teams on the <a href="#/groups" className="text-accent">Groups</a> page.</>
          : <>Members of the group{profile.leadGroupIds.length === 1 ? '' : 's'} you lead. Set each person's daily LeetCode target here.</>}</p>
      </header>
      <ErrorNote error={error} />
      <section className="card px-6 py-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-muted text-xs uppercase tracking-wide">
              {['Name', 'Email', 'Groups', 'LeetCode', 'Daily target', 'Role', 'Joined'].map((h) => <th key={h} className="py-2.5 px-2 border-b border-line font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td className="py-2 px-2 border-b border-soft font-semibold">{p.full_name || '—'}</td>
                <td className="py-2 px-2 border-b border-soft text-muted">{p.email}</td>
                <td className="py-2 px-2 border-b border-soft text-muted">{groupNames(p.id) || <span className="text-[#8A90A0]">None</span>}</td>
                <td className="py-2 px-2 border-b border-soft">{p.leetcode_username ? `@${p.leetcode_username}` : <span className="text-[#8A90A0]">Not linked</span>}</td>
                <td className="py-2 px-2 border-b border-soft">
                  <label className="sr-only" htmlFor={`t-${p.id}`}>Daily target for {p.full_name}</label>
                  <select id={`t-${p.id}`} className="input w-24" value={p.daily_target} onChange={(e) => save(p, { daily_target: Number(e.target.value) })}>
                    {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'None' : `${i} / day`}</option>)}
                  </select>
                  {saved === p.id && <span className="ml-2 text-xs text-ok-fg">Saved</span>}
                </td>
                <td className="py-2 px-2 border-b border-soft">
                  <label className="sr-only" htmlFor={`r-${p.id}`}>Role for {p.full_name}</label>
                  {isAdmin ? (
                    <select id={`r-${p.id}`} className="input w-32" value={p.role} onChange={(e) => save(p, { role: e.target.value })}>
                      <option value="trainer">Trainer</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : <span id={`r-${p.id}`} className="capitalize">{p.role}</span>}
                </td>
                <td className="py-2 px-2 border-b border-soft text-muted">{fmtDate(p.created_at)}</td>
              </tr>
            ))}
            {people.length === 0 && <tr><td colSpan={7} className="py-4 px-2 text-muted">No members yet.</td></tr>}
          </tbody>
        </table>
      </section>
      {isAdmin && <SkillAreas areas={areas} onChange={load} />}
    </div>
  )
}

function SkillAreas({ areas, onChange }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  async function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase.from('skill_areas').insert({ name: name.trim(), sort_order: areas.length + 1 })
    if (error) return setError(error)
    setName(''); onChange()
  }
  async function rename(a) {
    const n = window.prompt('Rename skill area', a.name)
    if (!n || n.trim() === a.name) return
    const { error } = await supabase.from('skill_areas').update({ name: n.trim() }).eq('id', a.id)
    if (error) return setError(error)
    onChange()
  }
  async function remove(a) {
    if (!window.confirm(`Delete the skill area "${a.name}"? This only works if no goals use it.`)) return
    const { error } = await supabase.from('skill_areas').delete().eq('id', a.id)
    if (error) return setError(/foreign key/i.test(error.message) ? 'Some goals still use this skill area, so it can’t be deleted. Rename it instead.' : error)
    onChange()
  }
  return (
    <section className="card px-6 py-5 flex flex-col gap-4" aria-labelledby="areas-h">
      <h2 id="areas-h" className="m-0 text-[17px] font-semibold">Skill areas</h2>
      <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
        {areas.map((a) => (
          <li key={a.id} className="flex items-center gap-1 bg-canvas border border-line rounded-lg pl-3 pr-1 py-1 text-sm">
            {a.name}
            <button onClick={() => rename(a)} className="text-xs text-accent bg-transparent border-0 cursor-pointer px-2 py-2">Rename</button>
            <button onClick={() => remove(a)} className="text-xs text-bad-fg bg-transparent border-0 cursor-pointer px-2 py-2">Delete</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
        <label className="label flex-1 min-w-[220px]">New skill area
          <input className="input font-normal" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud & DevOps" />
        </label>
        <Button type="submit" variant="secondary">Add</Button>
      </form>
      <ErrorNote error={error} />
    </section>
  )
}
