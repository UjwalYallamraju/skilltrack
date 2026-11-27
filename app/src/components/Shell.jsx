import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChartColumn, ClipboardCheck, Code, House, LogOut, Menu, Search, Settings, Target, Users, X,
} from 'lucide-react'
import { useMe } from '../lib/me'
import { useGoals, useGroups, useProfiles } from '../lib/queries'
import { scopeIds } from '../lib/insights'
import { Avatar, Modal } from './ui'

function useNav() {
  const me = useMe()
  const goals = useGoals().data || []
  const groups = useGroups().data || []
  const people = useProfiles().data || []
  const ids = useMemo(() => (me.isManager ? scopeIds(me.profile, { people, groups }) : new Set()), [me, people, groups])
  const reviews = goals.filter((g) => g.status === 'in_review' && ids.has(g.user_id)).length
  if (me.isManager) {
    return [
      { to: '/today', label: 'Today', icon: House },
      { to: '/team', label: 'Team', icon: Users },
      { to: '/approvals', label: 'Approvals', icon: ClipboardCheck, badge: reviews },
      { to: '/leetcode', label: 'LeetCode', icon: Code },
      { to: '/reports', label: 'Reports', icon: ChartColumn },
      { to: '/my', label: 'My work', icon: Target },
      { to: '/settings', label: 'Settings', icon: Settings },
    ]
  }
  return [
    { to: '/my', label: 'My work', icon: Target },
    { to: '/team', label: 'Team', icon: Users },
    { to: '/leetcode', label: 'LeetCode', icon: Code },
    { to: '/reports', label: 'Reports', icon: ChartColumn },
  ]
}

function NavItems({ onNavigate }) {
  const items = useNav()
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-3 h-10 px-3 rounded-lg text-sm no-underline transition-colors ${isActive ? 'bg-accent-soft text-accent-dark font-semibold' : 'text-ink-2 hover:bg-soft hover:text-ink'}`}>
          <it.icon size={18} aria-hidden />
          <span className="flex-1">{it.label}</span>
          {it.badge > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold flex items-center justify-center">{it.badge}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

// Admins and group leads also train: switch between managing and your own trainer view
function RoleSwitch() {
  const { canManage, realAdmin, mode, setMode } = useMe()
  const navigate = useNavigate()
  if (!canManage) return null
  const manager = realAdmin ? 'Admin' : 'Group lead'
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted" title="Admins and group leads are trainers too. Switch to Trainer to work on your own goals.">
      Viewing as
      <select className="input h-9 text-[13px] font-semibold text-ink" value={mode}
        onChange={(e) => { setMode(e.target.value); navigate(e.target.value === 'trainer' ? '/my' : '/today') }}>
        <option value="manager">{manager}</option>
        <option value="trainer">Trainer</option>
      </select>
    </label>
  )
}

function UserCard() {
  const { profile, isAdmin, isLead, mode, signOut } = useMe()
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl border border-line bg-white">
      <Avatar name={profile.full_name || profile.email} size={34} />
      <button onClick={() => navigate('/profile')} className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer">
        <div className="text-sm font-semibold truncate">{profile.full_name || profile.email}</div>
        <div className="text-xs text-muted">{isAdmin ? 'Admin' : isLead ? 'Group lead' : mode === 'trainer' ? 'Trainer view' : 'Trainer'}</div>
      </button>
      <button onClick={signOut} aria-label="Sign out" title="Sign out" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-soft cursor-pointer bg-transparent border-0">
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  )
}

function SearchButton({ onOpen }) {
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  return (
    <button onClick={onOpen} className="w-full h-9 flex items-center gap-2 px-3 rounded-lg border border-line bg-white text-muted text-[13px] cursor-pointer hover:border-[#D1D5DB]">
      <Search size={15} aria-hidden /><span className="flex-1 text-left">Find a person…</span>
      <kbd className="text-[11px] font-sans bg-soft rounded px-1.5 py-0.5">{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  )
}

function PeopleSearch({ onClose }) {
  const people = useProfiles().data || []
  const groups = useGroups().data || []
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const list = people.filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
  const go = (p) => { onClose(); navigate(`/people/${encodeURIComponent(p.id)}`) }
  return (
    <Modal title="Find a person" onClose={onClose}>
      <input className="input" placeholder="Type a name or email" value={q} autoFocus
        onChange={(e) => { setQ(e.target.value); setI(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, list.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
          if (e.key === 'Enter' && list[i]) go(list[i])
        }} aria-label="Search people" />
      <ul className="list-none p-0 m-0 mt-3 flex flex-col">
        {list.map((p, k) => (
          <li key={p.id}>
            <button onClick={() => go(p)} onMouseEnter={() => setI(k)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left border-0 cursor-pointer ${k === i ? 'bg-soft' : 'bg-transparent'}`}>
              <Avatar name={p.full_name || p.email} size={30} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{p.full_name || p.email}</span>
                <span className="block text-xs text-muted truncate">{groups.filter((g) => g.members.some((m) => m.user_id === p.id)).map((g) => g.name).join(', ') || p.email}</span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-muted px-3 py-4">No one matches “{q}”.</li>}
      </ul>
    </Modal>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#3B4BD8" /><path d="M8 21l6-6 4 4 6-8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="font-semibold text-[17px] tracking-tight">SkillTrack</span>
    </div>
  )
}

export default function Shell({ children }) {
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)
  const loc = useLocation()
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sidebar = (
    <div className="flex flex-col gap-5 h-full">
      <Brand />
      <SearchButton onOpen={() => setSearch(true)} />
      <NavItems onNavigate={() => setDrawer(false)} />
      <div className="mt-auto flex flex-col gap-3"><RoleSwitch /><UserCard /></div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className="no-print hidden lg:block fixed inset-y-0 left-0 w-[248px] border-r border-line bg-[#FBFBFC] px-4 py-5">{sidebar}</aside>

      {/* mobile top bar */}
      <div className="no-print lg:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 bg-white/95 backdrop-blur border-b border-line">
        <button onClick={() => setDrawer(true)} aria-label="Open menu" className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-soft bg-transparent border-0 cursor-pointer"><Menu size={20} aria-hidden /></button>
        <Brand />
        <button onClick={() => setSearch(true)} aria-label="Find a person" className="ml-auto w-10 h-10 rounded-lg flex items-center justify-center hover:bg-soft bg-transparent border-0 cursor-pointer"><Search size={19} aria-hidden /></button>
      </div>
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[rgba(17,24,39,.4)]" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside className="pop-in absolute inset-y-0 left-0 w-[280px] bg-[#FBFBFC] px-4 py-5 shadow-[var(--shadow-pop)]">
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-4 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-soft bg-transparent border-0 cursor-pointer"><X size={18} aria-hidden /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="lg:pl-[248px]">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">{children}</div>
      </main>
      {search && <PeopleSearch onClose={() => setSearch(false)} />}
    </div>
  )
}
