import { useState } from 'react'
import { supabase, ALLOWED_DOMAIN } from '../lib/supabase'
import { Button, ErrorNote } from '../components/ui'

const redirectTo = () => window.location.origin + window.location.pathname

export default function Auth() {
  const [mode, setMode] = useState('signin') // signin | signup | forgot
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const domainOk = (e) => e.trim().toLowerCase().endsWith('@' + ALLOWED_DOMAIN)

  async function submit(e) {
    e.preventDefault()
    setError(null); setInfo(null)
    if (mode !== 'signin' && !domainOk(email)) return setError(`Please use your @${ALLOWED_DOMAIN} email address.`)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Please enter your full name.')
        if (password.length < 8) throw new Error('Password must be at least 8 characters.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo() },
        })
        if (error) throw error
        if (!data.session) setInfo(`Almost done! We sent a confirmation link to ${email.trim()}. Open it, then sign in here.`)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
        if (error) throw error
        setInfo('If that email has an account, a password reset link is on its way.')
      }
    } catch (err) {
      const msg = String(err.message || err)
      setError(/Database error saving new user|Only @/.test(msg) ? `Only @${ALLOWED_DOMAIN} email addresses can sign up.` : msg)
    } finally {
      setBusy(false)
    }
  }

  const tab = (m, label) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); setInfo(null) }}
      className={`h-10 rounded-lg text-sm cursor-pointer border-0 ${mode === m ? 'bg-white font-semibold' : 'bg-transparent text-muted'}`}>{label}</button>
  )

  return (
    <div className="min-h-screen flex flex-wrap">
      <section className="flex-[1_1_420px] bg-night text-[#E6E8EE] p-10 md:p-16 flex flex-col justify-center gap-5">
        <div className="font-display font-bold text-[22px]">SkillTrack</div>
        <h1 className="m-0 font-display text-4xl md:text-[44px] leading-tight text-white max-w-[520px]">Keep the whole training team learning, together.</h1>
        <p className="m-0 text-base leading-relaxed text-[#B4B9C6] max-w-[480px]">Set upskilling goals in programming languages, full stack, GenAI, agentic AI and emerging tech. Log progress as you go, track daily LeetCode practice, and see what the rest of the team is learning.</p>
      </section>
      <section className="flex-[1_1_420px] flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="card w-full max-w-[400px] p-8 flex flex-col gap-4">
          {mode === 'forgot' ? (
            <h2 className="m-0 text-lg">Reset your password</h2>
          ) : (
            <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 bg-[#E9ECF1] p-1 rounded-[10px]">
              {tab('signin', 'Sign in')}{tab('signup', 'Create account')}
            </div>
          )}
          {mode === 'signup' && (
            <label className="label">Full name
              <input className="input font-normal" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="label">Work email
            <input className="input font-normal" type="email" placeholder={`name@${ALLOWED_DOMAIN}`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          {mode !== 'forgot' && (
            <label className="label">Password
              <input className="input font-normal" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required />
            </label>
          )}
          <ErrorNote error={error} />
          {info && <p className="m-0 text-sm text-ok-fg bg-ok-bg rounded-lg px-3 py-2">{info}</p>}
          <Button type="submit" disabled={busy} className="h-12 text-[15px]">
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </Button>
          {mode === 'signin' && <button type="button" onClick={() => setMode('forgot')} className="text-[13px] text-accent bg-transparent border-0 cursor-pointer">Forgot password?</button>}
          {mode === 'forgot' && <button type="button" onClick={() => setMode('signin')} className="text-[13px] text-accent bg-transparent border-0 cursor-pointer">Back to sign in</button>}
          <p className="m-0 text-xs text-muted text-center border-t border-soft pt-3.5">Only @{ALLOWED_DOMAIN} email addresses can create an account.</p>
        </form>
      </section>
    </div>
  )
}

export function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error)
    onDone()
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-[400px] p-8 flex flex-col gap-4">
        <h1 className="m-0 text-xl">Choose a new password</h1>
        <label className="label">New password
          <input className="input font-normal" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <ErrorNote error={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
      </form>
    </div>
  )
}
