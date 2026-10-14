import { useEffect, useState, type ReactNode } from 'react'
import { PROVENANCE_LABEL } from '../domain/format'
import { STATUS_LABEL, type DealStatus, type Severity } from '../domain/risk'
import type { Provenance } from '../domain/types'

// --- Routing (hash based, works on any static host) ------------------------------------
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [r, setR] = useState(read)
  useEffect(() => {
    const h = () => {
      setR(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return r
}
export const go = (path: string) => (window.location.hash = '#/' + path.replace(/^\//, ''))

// --- Primitives ------------------------------------------------------------------------
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'plain' | 'quiet' }) {
  return <div className={cx('rounded-xl border border-line p-4 sm:p-5', tone === 'quiet' ? 'bg-paper' : 'bg-card', className)}>{children}</div>
}

export function Button({
  children,
  onClick,
  kind = 'primary',
  type = 'button',
  disabled,
  className,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  title?: string
}) {
  const styles = {
    primary: 'bg-forest text-white hover:bg-[#173d32]',
    secondary: 'bg-forest-soft text-forest hover:bg-[#d4e3da]',
    ghost: 'bg-transparent text-ink border border-line hover:bg-white',
    danger: 'bg-transparent text-danger border border-danger/30 hover:bg-danger-soft',
  }
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50', styles[kind], className)}>
      {children}
    </button>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1 block text-xs font-medium text-muted">
      {children}
      {hint && <span className="font-normal"> · {hint}</span>}
    </span>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  )
}

/** Numeric input that keeps typing smooth and reports undefined when cleared. */
export function NumberInput({ value, onChange, placeholder, step, min = 0 }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; step?: number; min?: number }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  return (
    <input
      inputMode="decimal"
      className="tabular"
      value={text}
      placeholder={placeholder}
      step={step}
      min={min}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.replace(/[£,\s%]/g, '')
        if (t === '') return onChange(undefined)
        const n = Number(t)
        if (Number.isFinite(n)) onChange(n)
        else setText(value == null ? '' : String(value))
      }}
    />
  )
}

const PROV_STYLE: Record<Provenance, string> = {
  verified: 'bg-ok-soft text-ok',
  quote: 'bg-ok-soft text-ok',
  agent: 'bg-warn-soft text-warn',
  calculated: 'bg-info-soft text-info',
  estimate: 'bg-brass-soft text-brass',
  assumption: 'bg-[#eeeae0] text-muted',
  missing: 'bg-danger-soft text-danger',
}

export function ProvenanceBadge({ p, title }: { p: Provenance; title?: string }) {
  return (
    <span title={title} className={cx('inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium', PROV_STYLE[p])}>
      {PROVENANCE_LABEL[p]}
    </span>
  )
}

const STATUS_STYLE: Record<DealStatus, string> = {
  'worth-investigating': 'bg-ok-soft text-ok border-ok/20',
  'more-info': 'bg-info-soft text-info border-info/20',
  'high-risk': 'bg-danger-soft text-danger border-danger/20',
  unaffordable: 'bg-warn-soft text-warn border-warn/20',
}

export function StatusBadge({ s, size = 'sm' }: { s: DealStatus; size?: 'sm' | 'lg' }) {
  return <span className={cx('inline-block rounded-full border font-medium', size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs', STATUS_STYLE[s])}>{STATUS_LABEL[s]}</span>
}

const SEV_STYLE: Record<Severity, string> = {
  critical: 'bg-danger text-white',
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
}
export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={cx('inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', SEV_STYLE[s])}>{s}</span>
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'ok' | 'warn' }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular font-display text-2xl font-semibold sm:text-[28px]', color)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' }) {
  const s = { info: 'bg-info-soft text-[#2c4363] border-info/20', warn: 'bg-warn-soft text-[#6f4a0c] border-warn/20', danger: 'bg-danger-soft text-danger border-danger/20' }
  return <div className={cx('rounded-lg border px-3.5 py-2.5 text-sm', s[tone])}>{children}</div>
}

export function Disclosure({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-line bg-white/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium">
        <span>{summary}</span>
        <span className="text-muted transition group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-line px-3.5 py-3 text-sm">{children}</div>
    </details>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onChange(t.id)} className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition', value === t.id ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
            {t.count ? <span className="ml-1.5 rounded-full bg-danger-soft px-1.5 text-[11px] text-danger">{t.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
      <div className="font-display text-lg">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brass">{eyebrow}</div>}
      <h1 className="text-[28px] font-semibold sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-muted">{children}</div>}
    </div>
  )
}

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-forest">
      {children} ↗
    </a>
  )
}

export function download(filename: string, content: string, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
