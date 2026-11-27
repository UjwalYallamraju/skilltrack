import { useState } from 'react'
import { useMe } from '../lib/me'
import { updateProfile } from '../lib/data'
import { useRefresh } from '../lib/queries'
import { Avatar, Badge, Button, ErrorNote, PageHeader, useFeedback } from '../components/ui'

export default function Profile() {
  const { profile, reloadProfile, realAdmin, realLead, signOut } = useMe()
  const [name, setName] = useState(profile.full_name || '')
  const [lc, setLc] = useState(profile.leetcode_username || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { toast } = useFeedback()
  const refresh = useRefresh()

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const u = lc.trim().replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/)?/i, '').replace(/\/+$/, '')
      await updateProfile(profile.id, { full_name: name.trim(), leetcode_username: u || null })
      await reloadProfile(); await refresh('profiles')
      toast('Profile saved')
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Profile" />
      <div className="card p-6 flex items-center gap-4 mb-4">
        <Avatar name={profile.full_name || profile.email} size={52} />
        <div className="min-w-0">
          <div className="font-semibold">{profile.full_name}</div>
          <div className="text-sm text-muted truncate">{profile.email}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <Badge tone="info">{realAdmin ? 'Admin' : realLead ? 'Group lead' : 'Trainer'}</Badge>{(realAdmin || realLead) && <Badge>Also a trainer</Badge>}
            {profile.groupNames?.map((g) => <Badge key={g}>{g}</Badge>)}
          </div>
        </div>
      </div>
      <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
        <label className="label">Full name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="label">LeetCode username
          <input className="input" value={lc} onChange={(e) => setLc(e.target.value)} placeholder="e.g. nehak_dev" />
          <span className="text-xs text-muted font-normal">Your LeetCode profile must be public for the automatic sync (every 2 hours).</span>
        </label>
        <div className="text-sm text-muted">Daily LeetCode target: <b className="text-ink">{profile.daily_target === 0 ? 'None' : `${profile.daily_target} a day`}</b>, set by your lead.</div>
        <ErrorNote error={error} />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={signOut}>Sign out</Button>
          <Button type="submit" loading={busy}>Save profile</Button>
        </div>
      </form>
    </div>
  )
}
