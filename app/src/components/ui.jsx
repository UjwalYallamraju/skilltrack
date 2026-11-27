import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, CircleDashed, Clock, Hourglass, Loader2, Minus,
  TriangleAlert, X,
} from 'lucide-react'

const cx = (...c) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------- Button
export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className = '', children, ...props }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-sm',
    secondary: 'bg-white text-ink border border-line hover:bg-soft shadow-sm',
    ghost: 'bg-transparent text-ink-2 hover:bg-soft',
    danger: 'bg-white text-bad-fg border border-[#F2C9C9] hover:bg-bad-bg',
    success: 'bg-ok text-white hover:bg-[#116530] shadow-sm',
  }
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2' }
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx('inline-flex items-center justify-center rounded-lg font-semibold cursor-pointer whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed', styles[variant], sizes[size], className)}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : Icon && <Icon size={size === 'sm' ? 15 : 16} aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button {...props} aria-label={label} title={label}
      className={cx('inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted hover:text-ink hover:bg-soft cursor-pointer transition-colors', className)}>
      <Icon size={18} aria-hidden />
    </button>
  )
}

// ---------------------------------------------------------------- Badges & status
const TONES = {
  neutral: 'bg-soft text-ink-2',
  ok: 'bg-ok-bg text-ok-fg',
  warn: 'bg-warn-bg text-warn-fg',
  bad: 'bg-bad-bg text-bad-fg',
  info: 'bg-info-bg text-info-fg',
}
export function Badge({ tone = 'neutral', icon: Icon, children, className = '' }) {
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>
      {Icon && <Icon size={13} aria-hidden />}{children}
    </span>
  )
}

export const STATUS = {
  completed: { label: 'Completed', tone: 'info', icon: CircleCheck, bar: 'bg-accent' },
  in_review: { label: 'Awaiting approval', tone: 'info', icon: Hourglass, bar: 'bg-accent' },
  overdue: { label: 'Overdue', tone: 'bad', icon: CircleAlert, bar: 'bg-bad' },
  at_risk: { label: 'At risk', tone: 'warn', icon: TriangleAlert, bar: 'bg-warn' },
  on_track: { label: 'On track', tone: 'ok', icon: Clock, bar: 'bg-ok' },
  not_started: { label: 'Not started', tone: 'neutral', icon: CircleDashed, bar: 'bg-faint' },
}

export function StatusBadge({ status, children }) {
  const s = STATUS[status] || STATUS.not_started
  return <Badge tone={s.tone} icon={s.icon}>{children || s.label}</Badge>
}

export function ProgressBar({ value, status, className = '' }) {
  const s = STATUS[status] || STATUS.on_track
  return (
    <div className={cx('flex-1 h-2 bg-soft rounded-full overflow-hidden', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-2 rounded-full transition-[width]', s.bar)} style={{ width: `${value}%` }} />
    </div>
  )
}

// ---------------------------------------------------------------- Avatar
const AVATAR_BG = ['#E0E7FF', '#DCFCE7', '#FEF3C7', '#FCE7F3', '#E0F2FE', '#EDE9FE', '#FFE4E6', '#ECFCCB']
const AVATAR_FG = ['#3730A3', '#166534', '#92400E', '#9D174D', '#075985', '#5B21B6', '#9F1239', '#3F6212']
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
export function Avatar({ name, size = 32, className = '' }) {
  const h = [...(name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_BG.length
  return (
    <span aria-hidden className={cx('inline-flex items-center justify-center rounded-full font-semibold flex-none select-none', className)}
      style={{ width: size, height: size, background: AVATAR_BG[h], color: AVATAR_FG[h], fontSize: Math.round(size * 0.38) }}>
      {initials(name)}
    </span>
  )
}

// ---------------------------------------------------------------- Layout pieces
export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <header className="flex flex-wrap gap-4 items-end justify-between mb-6">
      <div className="min-w-0">
        <h1 className="m-0 text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 mb-0 text-muted text-sm">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2 items-center no-print">{actions}</div>}
    </header>
  )
}

export function Card({ title, subtitle, actions, children, className = '', bodyClass = 'p-5', as: Tag = 'section' }) {
  return (
    <Tag className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="m-0 text-[15px] font-semibold">{title}</h2>}
            {subtitle && <p className="m-0 mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-2 items-center">{actions}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </Tag>
  )
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-line overflow-x-auto', className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('relative h-10 px-3 text-sm whitespace-nowrap cursor-pointer bg-transparent border-0 flex items-center gap-1.5',
            value === t.id ? 'text-ink font-semibold' : 'text-muted hover:text-ink')}>
          {t.icon && <t.icon size={15} aria-hidden />}{t.label}
          {t.count != null && t.count > 0 && <span className="text-[11px] font-semibold bg-soft text-ink-2 rounded-full px-1.5 py-px">{t.count}</span>}
          {value === t.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent rounded-full" />}
        </button>
      ))}
    </div>
  )
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 bg-soft p-0.5 rounded-lg">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cx('h-8 px-3 rounded-md text-[13px] cursor-pointer border-0 whitespace-nowrap',
            value === o.value ? 'bg-white font-semibold shadow-sm text-ink' : 'bg-transparent text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatTile({ label, value, hint, delta, deltaGood = true, deltaSuffix = '', icon: Icon }) {
  const up = delta > 0, down = delta < 0
  const good = (up && deltaGood) || (down && !deltaGood)
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-2 text-[13px] text-muted">{Icon && <Icon size={15} aria-hidden />}{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[26px] font-semibold tracking-tight">{value}</span>
        {delta != null && (
          <span className={cx('inline-flex items-center text-xs font-semibold', delta === 0 ? 'text-muted' : good ? 'text-ok-fg' : 'text-bad-fg')}>
            {up ? <ArrowUpRight size={14} aria-hidden /> : down ? <ArrowDownRight size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
            {delta === 0 ? 'same' : `${up ? '+' : ''}${delta}${deltaSuffix}`}
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  )
}
// kept for older pages
export function Kpi({ label, value, dot }) {
  return <StatTile label={label} value={value} />
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 gap-2">
      {Icon && <span className="w-11 h-11 rounded-full bg-soft text-muted flex items-center justify-center mb-1"><Icon size={20} aria-hidden /></span>}
      <div className="font-semibold text-[15px]">{title}</div>
      {children && <div className="text-sm text-muted max-w-sm">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
export function Empty({ children }) {
  return <div className="card"><EmptyState title={children} /></div>
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={cx('skeleton', className)} />
}
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-5">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px]" />)}</div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}
export const Spinner = PageSkeleton

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="m-0 flex gap-2 items-start text-sm text-bad-fg bg-bad-bg rounded-lg px-3 py-2">
      <CircleAlert size={16} className="mt-0.5 flex-none" aria-hidden />{String(error.message || error)}
    </p>
  )
}

// ---------------------------------------------------------------- Modal
export function Modal({ title, onClose, children, wide = false, footer }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => ref.current?.querySelector('input,textarea,select,button:not([data-close])')?.focus(), 30)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = ''; prev?.focus?.() }
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(17,24,39,.45)] flex items-end sm:items-start justify-center sm:p-4 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={cx('pop-in bg-white w-full rounded-t-2xl sm:rounded-2xl sm:mt-[8vh] shadow-[var(--shadow-pop)] flex flex-col max-h-[92vh]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold m-0">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} data-close />
        </div>
        <div className="px-6 pb-6 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Toasts & confirm dialogs
const FeedbackCtx = createContext(null)
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const toast = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])
  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })), [])
  const close = (v) => { confirmState?.resolve(v); setConfirmState(null) }
  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      <div aria-live="polite" className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 flex flex-col gap-2 w-[min(92vw,380px)]">
        {toasts.map((t) => (
          <div key={t.id} className="pop-in flex items-start gap-2 bg-night text-white text-sm rounded-xl px-4 py-3 shadow-[var(--shadow-pop)]">
            {t.tone === 'bad' ? <CircleAlert size={18} className="text-[#FCA5A5] flex-none" aria-hidden /> : <CircleCheck size={18} className="text-[#86EFAC] flex-none" aria-hidden />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {confirmState && (
        <Modal title={confirmState.title} onClose={() => close(false)}
          footer={<>
            <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
            <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{confirmState.confirmLabel || 'Confirm'}</Button>
          </>}>
          <p className="m-0 text-sm text-ink-2">{confirmState.message}</p>
        </Modal>
      )}
    </FeedbackCtx.Provider>
  )
}
export const useFeedback = () => useContext(FeedbackCtx)
