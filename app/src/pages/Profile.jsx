import { useState } from 'react'
import { updateProfile } from '../lib/data'
import { Button, ErrorNote } from '../components/ui'

export default function Profile({ profile, reloadProfile }) {
  const [name, setName] = useState(profile.full_name)
  const [lc, setLc] = useState(profile.leetcode_username || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null); setOk(false)
    try {
      const u = lc.trim().replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/)?/i, '').replace(/\/+$/, '')
      await updateProfile(profile.id, { full_name: name.trim(), leetcode_username: u || null })
      await reloadProfile()
      setOk(true)
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <h1 className="m-0 font-display text-3xl">My Profile</h1>
      <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
        <label className="label">Full name
          <input className="input font-normal" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="label">Email
          <input className="input font-normal bg-canvas" value={profile.email} disabled />
        </label>
        <label className="label">LeetCode username
          <input className="input font-normal" value={lc} onChange={(e) => setLc(e.target.value)} placeholder="e.g. nehak_dev" />
          <span className="text-xs text-muted font-normal">Your profile must be public on LeetCode for the daily sync to work.</span>
        </label>
        <div className="text-sm text-muted">Daily LeetCode target: <b className="text-ink">{profile.daily_target === 0 ? 'None' : `${profile.daily_target} a day`}</b> (set by your team lead)</div>
        <ErrorNote error={error} />
        {ok && <p className="m-0 text-sm text-ok-fg bg-ok-bg rounded-lg px-3 py-2">Saved.</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      </form>
    </div>
  )
}
