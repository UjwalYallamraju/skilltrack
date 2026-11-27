import { useRef, useState } from 'react'

// Small dependency-free SVG charts. Colours come from a validated palette:
// categorical slots in fixed order, an ordinal blue ramp for ordered levels.
export const SERIES = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647']
export const ORDINAL_BLUE = ['#84b9f3', '#257de0', '#0f4a96']
export const NEUTRAL = '#b3b3b3'

const W = 720
const H = 240
const M = { top: 12, right: 28, bottom: 30, left: 40 }
const IW = W - M.left - M.right
const IH = H - M.top - M.bottom

// Axis max = 4 × a "nice" whole step, so the 5 gridlines land on round numbers
function niceMax(v) {
  if (v <= 0) return 4
  const raw = v / 4
  const p = Math.max(1, Math.pow(10, Math.floor(Math.log10(raw))))
  return Math.max(4, Math.ceil(raw / p) * p * 4)
}

function Grid({ max, fmt }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  return ticks.map((t) => {
    const y = M.top + IH - (t / max) * IH
    return (
      <g key={t}>
        <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke="#EEF0F4" strokeWidth="1" />
        <text x={M.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#5B6170">{fmt ? fmt(t) : Math.round(t)}</text>
      </g>
    )
  })
}

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div role="status" className="pointer-events-none absolute z-10 bg-white border border-line rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]"
      style={{ left: `min(max(${tip.x}%, 0%), calc(100% - 160px))`, top: 0 }}>
      <div className="font-semibold text-ink mb-1">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted">
          {r.color && <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span><span className="font-semibold text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }) {
  if (items.length < 2) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={i.line ? 'w-4 h-0.5' : 'w-2.5 h-2.5 rounded-sm'} style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  )
}

function DataTable({ labels, series, fmt }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-accent text-[13px] w-fit">Show as table</summary>
      <div className="overflow-x-auto mt-2">
        <table className="border-collapse text-[13px] min-w-full">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 pr-4 font-semibold border-b border-line">Period</th>
              {series.map((s) => <th key={s.label} className="py-1.5 pr-4 font-semibold border-b border-line">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}>
                <td className="py-1 pr-4 border-b border-soft">{l}</td>
                {series.map((s) => <td key={s.label} className="py-1 pr-4 border-b border-soft">{s.values[i] == null ? '—' : fmt ? fmt(s.values[i]) : s.values[i]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// Stacked (or single-series) column chart. series: [{ label, color, values[] }]
export function BarChart({ labels, series, ariaLabel, unit = '' }) {
  const [tip, setTip] = useState(null)
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0))
  const max = niceMax(Math.max(...totals))
  const step = IW / labels.length
  const bw = Math.max(6, Math.min(36, step * 0.6))
  const labelEvery = Math.ceil(labels.length / 12)
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={ariaLabel} onMouseLeave={() => setTip(null)}>
          <Grid max={max} />
          <line x1={M.left} x2={W - M.right} y1={M.top + IH} y2={M.top + IH} stroke="#D5D9E1" />
          {labels.map((l, i) => {
            const cx = M.left + step * i + step / 2
            let y = M.top + IH
            const segs = series.map((s) => ({ s, v: s.values[i] || 0 })).filter((x) => x.v > 0)
            return (
              <g key={l}>
                {segs.map(({ s, v }, k) => {
                  const h = (v / max) * IH
                  const top = k === segs.length - 1
                  const gap = k > 0 ? 2 : 0
                  const y0 = y - h
                  const rect = { x: cx - bw / 2, y: y0, w: bw, h: Math.max(0, h - gap) }
                  y = y0
                  if (!top) return <rect key={s.label} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={s.color} />
                  const r = Math.min(4, rect.h)
                  return <path key={s.label} fill={s.color} d={`M${rect.x},${rect.y + rect.h} V${rect.y + r} Q${rect.x},${rect.y} ${rect.x + r},${rect.y} H${rect.x + rect.w - r} Q${rect.x + rect.w},${rect.y} ${rect.x + rect.w},${rect.y + r} V${rect.y + rect.h} Z`} />
                })}
                {i % labelEvery === 0 && <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="#5B6170">{l}</text>}
                {/* hit target: the full column */}
                <rect x={cx - step / 2} y={M.top} width={step} height={IH} fill="transparent"
                  onMouseEnter={() => setTip({ x: (cx / W) * 100, title: l, rows: [...series.map((s) => ({ label: s.label, color: series.length > 1 ? s.color : null, value: `${s.values[i] || 0}${unit}` })), ...(series.length > 1 ? [{ label: 'Total', value: `${totals[i]}${unit}` }] : [])] })} />
              </g>
            )
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable labels={labels} series={series} />
    </div>
  )
}

// Line chart with a crosshair tooltip. values may contain null (no data).
export function LineChart({ labels, series, ariaLabel, max: fixedMax, fmt = (v) => v }) {
  const [hover, setHover] = useState(null)
  const ref = useRef(null)
  const all = series.flatMap((s) => s.values).filter((v) => v != null)
  const max = fixedMax ?? niceMax(Math.max(0, ...all))
  const x = (i) => M.left + (labels.length === 1 ? IW / 2 : (IW * i) / (labels.length - 1))
  const y = (v) => M.top + IH - (v / max) * IH
  const labelEvery = Math.ceil(labels.length / 12)
  function move(e) {
    const r = ref.current.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - M.left) / IW) * (labels.length - 1))
    setHover(Math.max(0, Math.min(labels.length - 1, i)))
  }
  const tip = hover == null ? null : {
    x: (x(hover) / W) * 100, title: labels[hover],
    rows: series.map((s) => ({ label: s.label, color: series.length > 1 ? s.color : null, value: s.values[hover] == null ? '—' : fmt(s.values[hover]) })),
  }
  return (
    <div>
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={ariaLabel}
          onMouseMove={move} onMouseLeave={() => setHover(null)}>
          <Grid max={max} fmt={fmt} />
          <line x1={M.left} x2={W - M.right} y1={M.top + IH} y2={M.top + IH} stroke="#D5D9E1" />
          {labels.map((l, i) => i % labelEvery === 0 && (
            <text key={l} x={x(i)} y={H - 10} fontSize="11" fill="#5B6170"
              textAnchor={i === 0 && labels.length > 1 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{l}</text>
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + IH} stroke="#8A90A0" strokeDasharray="3 3" />}
          {series.map((s) => {
            // break the line where there is no data
            const parts = []
            let cur = []
            s.values.forEach((v, i) => { if (v == null) { if (cur.length) parts.push(cur); cur = [] } else cur.push([x(i), y(v)]) })
            if (cur.length) parts.push(cur)
            return (
              <g key={s.label}>
                {parts.map((p, k) => p.length > 1
                  ? <polyline key={k} points={p.map((q) => q.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  : <circle key={k} cx={p[0][0]} cy={p[0][1]} r="3" fill={s.color} />)}
                {hover != null && s.values[hover] != null && (
                  <circle cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
                )}
              </g>
            )
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable labels={labels} series={series} fmt={fmt} />
    </div>
  )
}
