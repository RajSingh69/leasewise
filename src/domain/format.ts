import type { Provenance } from './types'

export const gbp = (n: number | undefined | null, opts: { sign?: boolean } = {}) => {
  if (n == null || !Number.isFinite(n)) return '—'
  const s = '£' + Math.abs(Math.round(n)).toLocaleString('en-GB')
  if (n < 0) return '−' + s
  return opts.sign && n > 0 ? '+' + s : s
}

export const pct = (n: number, dp = 1) => (Number.isFinite(n) ? (n * 100).toFixed(dp) + '%' : '—')

export const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  verified: 'Verified',
  quote: 'Quote',
  agent: 'Agent claim',
  calculated: 'Calculated',
  estimate: 'Your estimate',
  assumption: 'Assumption',
  missing: 'Missing',
}
