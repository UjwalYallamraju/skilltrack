import { useCallback, useEffect, useState } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/react'
import { supabase, setTokenGetter } from './lib/supabase'
import Auth, { NoAccess } from './pages/Auth'
import MyGoals from './pages/MyGoals'
import Dashboard from './pages/Dashboard'
import Members from './pages/Members'
import Profile from './pages/Profile'
import Groups from './pages/Groups'
import Daily from './pages/Daily'
import Reports from './pages/Reports'
import { getMyMemberships } from './lib/data'
import { Spinner } from './components/ui'

// access: 'all' | 'admin' | 'lead' (admins and group leads)
const PAGES = {
  goals: { label: 'My Goals', component: MyGoals, access: 'all' },
  team: { label: 'Team Dashboard', component: Dashboard, access: 'all' },
  daily: { label: 'Daily Progress', component: Daily, access: 'all' },
  reports: { label: 'Reports', component: Reports, access: 'all' },
  groups: { label: 'Groups', component: Groups, access: 'admin' },
  members: { label: 'Team Members', component: Members, access: 'lead' },
  profile: { label: 'My Profile', component: Profile, access: 'all' },
}

function usePage() {
  const read = () => (window.location.hash.replace('#/', '') || '').split('?')[0]
  const [page, setPage] = useState(read)
  useEffect(() => {
    const on = () => setPage(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return page
}

export default function App() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [profile, setProfile] = useState(null)
  const [denied, setDenied] = useState(null)
  const page = usePage()

  // Every Supabase request carries the Clerk session token
  useEffect(() => { setTokenGetter(() => getToken()) }, [getToken])

  // Fetch (or create on first sign-in) my SkillTrack profile
  const loadProfile = useCallback(async () => {
    if (!isSignedIn) { setProfile(null); setDenied(null); return }
    const { data, error } = await supabase.rpc('ensure_profile', { p_full_name: user?.fullName || '' })
    if (error) { setDenied(error.message); setProfile(null); return }
    const memberships = await getMyMemberships(data.id).catch(() => [])
    setDenied(null)
    setProfile({
      ...data, memberships,
      groupNames: memberships.map((m) => m.group?.name).filter(Boolean),
      leadGroupIds: memberships.filter((m) => m.is_lead).map((m) => m.group_id),
    })
  }, [isSignedIn, userId, user?.fullName])

  useEffect(() => { loadProfile() }, [loadProfile])

  if (!isLoaded) return <Spinner />
  if (!isSignedIn) return <Auth />
  if (denied) return <NoAccess message={denied} onSignOut={() => signOut()} />
  if (!profile) return <Spinner />

  const isAdmin = profile.role === 'admin'
  const isLead = profile.leadGroupIds.length > 0
  const allowed = (k) => PAGES[k] && (PAGES[k].access === 'all' || isAdmin || (PAGES[k].access === 'lead' && isLead))
  const defaultPage = isAdmin ? 'team' : 'goals'
  const key = allowed(page) ? page : defaultPage
  const Page = PAGES[key].component
  const navOrder = (isAdmin ? ['team', 'daily', 'reports', 'goals', 'groups', 'members', 'profile'] : ['goals', 'team', 'daily', 'reports', 'members', 'profile']).filter(allowed)

  return (
    <div className="min-h-screen flex flex-wrap">
      <nav aria-label="Main" className="no-print flex-[1_1_220px] max-w-[260px] max-md:max-w-none bg-night text-[#E6E8EE] px-4 py-6 flex flex-col gap-1 md:min-h-screen">
        <div className="font-display font-bold text-xl px-3 pb-6">SkillTrack</div>
        {navOrder.map((k) => (
          <a
            key={k}
            href={`#/${k}`}
            aria-current={k === key ? 'page' : undefined}
            className={`px-3 py-3 rounded-lg text-sm no-underline ${k === key ? 'bg-night-2 text-white font-semibold' : 'text-[#B4B9C6] hover:text-white'}`}
          >
            {PAGES[k].label}
          </a>
        ))}
        <div className="mt-auto pt-4 px-3 border-t border-night-2 text-[13px] text-[#B4B9C6]">
          Signed in as
          <div className="text-white font-semibold">{profile.full_name || profile.email} {isAdmin ? '(Admin)' : isLead ? '(Group lead)' : ''}</div>
          <button onClick={() => signOut()} className="mt-3 text-[#B4B9C6] hover:text-white underline cursor-pointer bg-transparent border-0 p-0 text-[13px]">Sign out</button>
        </div>
      </nav>
      <main className="flex-[999_1_560px] min-w-0 px-5 md:px-10 py-8">
        <Page profile={profile} reloadProfile={loadProfile} />
      </main>
    </div>
  )
}
