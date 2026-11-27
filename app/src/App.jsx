import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, useClerk, useUser } from '@clerk/react'
import { setTokenGetter } from './lib/supabase'
import { ensureProfile, getMyMemberships } from './lib/data'
import { MeContext } from './lib/me'
import { queryClient } from './lib/queries'
import Auth, { NoAccess } from './pages/Auth'
import Shell from './components/Shell'
import { PageSkeleton } from './components/ui'

const Today = lazy(() => import('./pages/Today'))
const Team = lazy(() => import('./pages/Team'))
const Person = lazy(() => import('./pages/Person'))
const Approvals = lazy(() => import('./pages/Approvals'))
const MyWork = lazy(() => import('./pages/MyWork'))
const Reports = lazy(() => import('./pages/Reports'))
const LeetCode = lazy(() => import('./pages/LeetCode'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))

export default function App() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [profile, setProfile] = useState(null)
  const [denied, setDenied] = useState(null)

  // Every Supabase request carries the Clerk session token
  useEffect(() => { setTokenGetter(() => getToken()) }, [getToken])

  // Fetch (or create on first sign-in) my SkillTrack profile
  const loadProfile = useCallback(async () => {
    if (!isSignedIn) { setProfile(null); setDenied(null); return }
    try {
      const data = await ensureProfile(user?.fullName)
      const memberships = await getMyMemberships(data.id).catch(() => [])
      setDenied(null)
      setProfile({
        ...data,
        groupNames: memberships.map((m) => m.group?.name).filter(Boolean),
        leadGroupIds: memberships.filter((m) => m.is_lead).map((m) => m.group_id),
      })
    } catch (e) {
      setDenied(e.message); setProfile(null)
    }
  }, [isSignedIn, userId, user?.fullName])
  useEffect(() => { loadProfile() }, [loadProfile])

  // Admins and group leads are trainers too: they can switch to the trainer view
  const [mode, setModeState] = useState(() => { try { return localStorage.getItem('skilltrack-mode') || 'manager' } catch { return 'manager' } })
  const setMode = useCallback((m) => { setModeState(m); try { localStorage.setItem('skilltrack-mode', m) } catch { /* ignore */ } }, [])

  const me = useMemo(() => {
    if (!profile) return null
    const realAdmin = profile.role === 'admin'
    const realLead = profile.leadGroupIds.length > 0
    const canManage = realAdmin || realLead
    const trainerView = canManage && mode === 'trainer'
    return {
      profile,
      isAdmin: realAdmin && !trainerView,
      isLead: realLead && !trainerView,
      isManager: canManage && !trainerView,
      canManage, realAdmin, realLead, mode: trainerView ? 'trainer' : 'manager', setMode,
      reloadProfile: loadProfile,
      signOut: () => { queryClient.clear(); signOut() },
    }
  }, [profile, loadProfile, signOut, mode, setMode])

  if (!isLoaded) return <div className="p-10"><PageSkeleton /></div>
  if (!isSignedIn) return <Auth />
  if (denied) return <NoAccess message={denied} onSignOut={() => signOut()} />
  if (!me) return <div className="p-10"><PageSkeleton /></div>

  const home = me.isManager ? '/today' : '/my'
  return (
    <MeContext.Provider value={me}>
      <Shell>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to={home} replace />} />
            <Route path="/today" element={me.isManager ? <Today /> : <Navigate to="/my" replace />} />
            <Route path="/team" element={<Team />} />
            <Route path="/people/:id" element={<Person />} />
            <Route path="/approvals" element={me.isManager ? <Approvals /> : <Navigate to="/my" replace />} />
            <Route path="/my" element={<MyWork />} />
            <Route path="/leetcode" element={<LeetCode />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings/*" element={me.isManager ? <Settings /> : <Navigate to="/my" replace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </MeContext.Provider>
  )
}
