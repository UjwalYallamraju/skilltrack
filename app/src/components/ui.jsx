import { useEffect } from 'react'

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-dark border-0',
    secondary: 'bg-white text-ink border border-[#D5D9E1] hover:bg-canvas',
    danger: 'bg-white text-bad-fg border border-[#E8C4C4] hover:bg-bad-bg',
    ghost: 'bg-transparent text-muted hover:bg-soft border-0',
  }
  return (
    <button
      {...props}
      className={`h-11 px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  )
}

export const STATUS = {
  completed: { label: 'Completed', bg: 'bg-done-bg', fg: 'text-accent-dark', bar: 'bg-accent' },
  overdue: { label: 'Overdue', bg: 'bg-bad-bg', fg: 'text-bad-fg', bar: 'bg-bad' },
  at_risk: { label: 'At risk', bg: 'bg-warn-bg', fg: 'text-warn-fg', bar: 'bg-warn' },
  on_track: { label: 'On track', bg: 'bg-ok-bg', fg: 'text-ok-fg', bar: 'bg-ok' },
  not_started: { label: 'Not started', bg: 'bg-soft', fg: 'text-muted', bar: 'bg-muted' },
}

export function StatusBadge({ status, children }) {
  const s = STATUS[status] || STATUS.not_started
  return <span className={`inline-block px-2.5 py-1 rounded-md text-[13px] font-semibold whitespace-nowrap ${s.bg} ${s.fg}`}>{children || s.label}</span>
}

export function ProgressBar({ value, status, height = 'h-2.5' }) {
  const s = STATUS[status] || STATUS.on_track
  return (
    <div className={`flex-1 ${height} bg-soft rounded-full overflow-hidden`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${height} ${s.bar}`} style={{ width: `${value}%` }} />
    </div>
  )
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} mt-[6vh] p-6 shadow-xl`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold m-0">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg hover:bg-soft text-muted cursor-pointer text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p className="m-0 text-sm text-bad-fg bg-bad-bg rounded-lg px-3 py-2">{String(error.message || error)}</p>
}

export function Empty({ children }) {
  return <div className="card p-8 text-center text-muted text-sm">{children}</div>
}

export function Spinner() {
  return <div className="p-10 text-center text-muted text-sm">Loading…</div>
}

export function Kpi({ label, value, dot }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-[13px] text-muted flex items-center gap-2">
        {dot && <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <div className="font-display text-[32px] font-bold mt-1">{value}</div>
    </div>
  )
}
