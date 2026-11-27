import { useState } from 'react'
import { SignIn, SignUp } from '@clerk/react'
import { ALLOWED_DOMAIN } from '../lib/supabase'
import { Button } from '../components/ui'

// Our own tabs switch between Clerk's sign-in and sign-up forms, so Clerk's
// footer links are hidden and nothing touches the page URL.
const appearance = {
  elements: {
    footerAction: { display: 'none' },
    card: { boxShadow: 'none', border: '1px solid #E3E6EC' },
    rootBox: { width: '100%' },
    cardBox: { width: '100%', maxWidth: '400px', boxShadow: 'none' },
  },
}

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const tab = (m, label) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
      className={`h-10 rounded-lg text-sm cursor-pointer border-0 ${mode === m ? 'bg-white font-semibold' : 'bg-transparent text-muted'}`}>{label}</button>
  )
  return (
    <div className="min-h-screen flex flex-wrap">
      <section className="flex-[1_1_420px] bg-night text-[#E6E8EE] p-10 md:p-16 flex flex-col justify-center gap-5">
        <div className="font-display font-bold text-[22px]">SkillTrack</div>
        <h1 className="m-0 font-display text-4xl md:text-[44px] leading-tight text-white max-w-[520px]">Keep the whole training team learning, together.</h1>
        <p className="m-0 text-base leading-relaxed text-[#B4B9C6] max-w-[480px]">Set upskilling goals in programming languages, full stack, GenAI, agentic AI and emerging tech. Log progress as you go, track daily LeetCode practice, and see what the rest of the team is learning.</p>
      </section>
      <section className="flex-[1_1_420px] flex flex-col items-center justify-center gap-4 px-6 py-12">
        <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 bg-[#E9ECF1] p-1 rounded-[10px] w-full max-w-[400px]">
          {tab('signin', 'Sign in')}{tab('signup', 'Create account')}
        </div>
        <div className="w-full max-w-[400px] flex justify-center">
          {mode === 'signin'
            ? <SignIn routing="virtual" appearance={appearance} />
            : <SignUp routing="virtual" appearance={appearance} />}
        </div>
        <p className="m-0 text-xs text-muted text-center max-w-[400px]">Use your @{ALLOWED_DOMAIN} email address. Other addresses can't access SkillTrack.</p>
      </section>
    </div>
  )
}

// Shown when a signed-in Clerk account can't use SkillTrack (e.g. wrong email domain)
export function NoAccess({ message, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card w-full max-w-[440px] p-8 flex flex-col gap-4">
        <h1 className="m-0 text-xl">Can't open SkillTrack</h1>
        <p className="m-0 text-sm text-bad-fg bg-bad-bg rounded-lg px-3 py-2">{message}</p>
        <p className="m-0 text-sm text-muted">Sign out and use your @{ALLOWED_DOMAIN} account instead.</p>
        <Button onClick={onSignOut}>Sign out</Button>
      </div>
    </div>
  )
}
