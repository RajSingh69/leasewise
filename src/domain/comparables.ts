// Comparable selection, adjustment and long-lease valuation.
//
// Evidence: HM Land Registry completed sales (never asking prices), restated to today with
// the UK House Price Index, sized with EPC floor area where a certificate matches reliably.
// Land Registry records no lease length, so a sale only counts as long-lease evidence when
// the user has verified it.

import type { Comparable, HpiInfo } from './types'

// --- UK HPI -------------------------------------------------------------------------------

/** Trailing 3-month average, to damp noise in small local-authority flat series. */
export function smoothIndex(raw: Record<string, number>): Record<string, number> {
  const months = Object.keys(raw).sort()
  const out: Record<string, number> = {}
  months.forEach((m, i) => {
    const w = months.slice(Math.max(0, i - 2), i + 1).map((k) => raw[k])
    out[m] = w.reduce((a, b) => a + b, 0) / w.length
  })
  return out
}

/** Factor to restate a sale to the latest index month. undefined if the index doesn't cover the sale. */
export function hpiFactor(saleDate: string, hpi: Pick<HpiInfo, 'index' | 'latestMonth'>): number | undefined {
  const months = Object.keys(hpi.index).sort()
  const m = saleDate.slice(0, 7)
  if (!months.length || m < months[0]) return undefined
  // Use the sale month, or the latest published month before it.
  const saleMonth = [...months].reverse().find((k) => k <= m)!
  const now = hpi.index[hpi.latestMonth]
  const then = hpi.index[saleMonth]
  return now > 0 && then > 0 ? now / then : undefined
}

// --- Scoring ------------------------------------------------------------------------------

export interface Subject {
  floorAreaSqm?: number
}

const MONTH = 30.44 * 86400_000

/** Floor area usable for valuation: manual sales the user entered, or a high-confidence / approved EPC match. */
export function usableArea(c: Comparable): number | undefined {
  if (c.userAreaSqm && c.userAreaSqm >= 10) return c.userAreaSqm
  const a = c.epc?.floorAreaSqm
  if (!a || a < 10) return undefined
  return c.epc!.confidence === 'high' || c.epcApproved ? a : undefined
}

export function scoreComparable(c: Comparable, subject: Subject, today = new Date()): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let s = 0
  if (c.samePostcode) {
    s += 30
    reasons.push('Same postcode.')
  } else if (c.distanceM != null) {
    s += Math.max(0, 30 * (1 - c.distanceM / 2000))
    reasons.push(`${(c.distanceM / 1609).toFixed(2)} miles away.`)
  } else reasons.push('Distance unknown.')
  if (c.sameStreet && !c.samePostcode) {
    s += 3
    reasons.push('Same street.')
  }
  const months = (today.getTime() - new Date(c.date).getTime()) / MONTH
  s += months <= 12 ? 15 : Math.max(0, 15 * (1 - (months - 12) / 60))
  reasons.push(months < 12 ? `Sold ${Math.max(0, Math.round(months))} months ago.` : `Sold ${(months / 12).toFixed(1)} years ago.`)
  if (c.propertyType === 'flat-maisonette') {
    s += 15
    reasons.push('Flat or maisonette.')
  } else reasons.push(`Different property type (${c.propertyType}).`)
  const area = usableArea(c)
  if (area && subject.floorAreaSqm) {
    const diff = Math.abs(area - subject.floorAreaSqm) / subject.floorAreaSqm
    s += 25 * Math.max(0, 1 - diff / 0.4)
    reasons.push(`${area} m² vs this flat's ${subject.floorAreaSqm} m² (${Math.round(diff * 100)}% different).`)
  } else if (area) reasons.push(`${area} m² — add this flat's floor area to compare size.`)
  else reasons.push('Floor area not verified, so size similarity is unknown.')
  if (c.leaseStatus === 'long') {
    s += 15
    reasons.push('You verified it was a long-lease sale.')
  } else if (c.leaseStatus === 'unknown') reasons.push('Lease length unknown.')
  if (c.newBuild) {
    s -= 10
    reasons.push('New build.')
  }
  return { score: Math.round(Math.max(0, Math.min(100, s))), reasons }
}

// --- Valuation ----------------------------------------------------------------------------

export type CompStatus = 'selected' | 'reserve' | 'excluded'
export type Confidence = 'insufficient' | 'provisional' | 'low' | 'moderate' | 'good'

export interface EvaluatedComp {
  c: Comparable
  adjusted: number
  factor?: number
  area?: number
  ppsm?: number
  score: number
  scoreReasons: string[]
  status: CompStatus
  statusReason: string
}

export interface Valuation {
  ok: boolean
  method: 'price-per-sqm' | 'sale-price' | null
  low: number
  base: number
  high: number
  ppsm?: { low: number; base: number; high: number }
  confidence: Confidence
  leaseBasis: 'verified-long' | 'unverified'
  selectedCount: number
  confirmedLong: number
  dispersion: number
  hpiApplied: boolean
  items: EvaluatedComp[]
  explanation: string[]
  warnings: string[]
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: 'Not enough evidence',
  provisional: 'Provisional',
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  good: 'Good evidence',
}

const SELECT_MIN = 45
const PROVISIONAL_MIN = 30
const MAX_SELECTED = 10

function wQuantile(vals: { v: number; w: number }[], q: number): number {
  const s = [...vals].sort((a, b) => a.v - b.v)
  const total = s.reduce((n, x) => n + x.w, 0)
  let acc = 0
  for (const x of s) {
    acc += x.w
    if (acc / total >= q) return x.v
  }
  return s[s.length - 1].v
}

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo)
}

/** Tukey fences on the values; returns the indexes that are outliers. Needs 5+ values. */
export function outlierIndexes(values: number[]): Set<number> {
  const out = new Set<number>()
  if (values.length < 5) return out
  const s = [...values].sort((a, b) => a - b)
  const q1 = quantile(s, 0.25)
  const q3 = quantile(s, 0.75)
  const iqr = q3 - q1
  values.forEach((v, i) => {
    if (v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr) out.add(i)
  })
  return out
}

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')

export function valueComparables(
  comps: Comparable[],
  subject: Subject,
  opts: { hpi?: HpiInfo; radiusM?: number; yearsBack?: number; today?: Date } = {},
): Valuation {
  const today = opts.today ?? new Date()
  const items: EvaluatedComp[] = comps.map((c) => {
    const factor = opts.hpi ? hpiFactor(c.date, opts.hpi) : undefined
    const adjusted = Math.round(c.price * (factor ?? 1))
    const area = usableArea(c)
    const { score, reasons } = scoreComparable(c, subject, today)
    return { c, adjusted, factor, area, ppsm: area ? adjusted / area : undefined, score, scoreReasons: reasons, status: 'reserve', statusReason: '' }
  })

  // 1. Exclusions with reasons. User inclusion overrides everything except a short lease.
  for (const e of items) {
    const c = e.c
    const ex = (r: string) => {
      e.status = 'excluded'
      e.statusReason = r
    }
    if (c.userChoice === 'exclude') ex('You excluded this sale.')
    else if (c.leaseStatus === 'short') ex('Short lease — not evidence of long-lease value.')
    else if (c.userChoice === 'include') continue
    else if (!(c.price > 0)) ex('No price.')
    else if (c.propertyType !== 'flat-maisonette') ex('Not a flat or maisonette.')
    else if (c.newBuild) ex('New build — these usually sell at a premium to resales.')
    else if (c.epc && (c.epc.confidence === 'high' || c.epcApproved) && c.epc.propertyType && !/flat|maisonette/i.test(c.epc.propertyType))
      ex(`EPC records it as a ${c.epc.propertyType.toLowerCase()}.`)
  }

  // 2. Method: price per m² when this flat's size is known and at least 3 candidates have verified areas.
  const candidates = () => items.filter((e) => e.status !== 'excluded')
  const withArea = candidates().filter((e) => e.area)
  const method: Valuation['method'] = subject.floorAreaSqm && withArea.length >= 3 ? 'price-per-sqm' : 'sale-price'
  if (method === 'price-per-sqm')
    for (const e of candidates()) if (!e.area && e.c.userChoice !== 'include') e.statusReason = 'Not used: no verified floor area.'

  // 3. Outliers on the metric actually used.
  const pool = candidates().filter((e) => (method === 'price-per-sqm' ? e.area : true) && e.c.userChoice !== 'include')
  const metric = (e: EvaluatedComp) => (method === 'price-per-sqm' ? e.ppsm! : e.adjusted)
  const outs = outlierIndexes(pool.map(metric))
  const med = pool.length ? quantile(pool.map(metric).sort((a, b) => a - b), 0.5) : 0
  pool.forEach((e, i) => {
    if (outs.has(i)) {
      e.status = 'excluded'
      const d = (metric(e) - med) / med
      e.statusReason = `Outlier: ${Math.round(Math.abs(d) * 100)}% ${d < 0 ? 'below' : 'above'} the typical ${method === 'price-per-sqm' ? 'price per m²' : 'price'} — possibly a short lease, non-market sale or very different flat.`
    }
  })

  // 4. Selection: strongest matches first.
  const eligible = candidates()
    .filter((e) => (method === 'price-per-sqm' ? e.area || e.c.userChoice === 'include' : true))
    .sort((a, b) => b.score - a.score)
  const forced = eligible.filter((e) => e.c.userChoice === 'include')
  let chosen = [...forced, ...eligible.filter((e) => e.c.userChoice !== 'include' && e.score >= SELECT_MIN)].slice(0, Math.max(MAX_SELECTED, forced.length))
  let provisional = false
  if (chosen.length < 3) {
    chosen = [...forced, ...eligible.filter((e) => e.c.userChoice !== 'include' && e.score >= PROVISIONAL_MIN)].slice(0, Math.max(6, forced.length))
    provisional = true
  }
  const chosenSet = new Set(chosen)
  for (const e of candidates()) {
    if (chosenSet.has(e)) {
      e.status = 'selected'
      e.statusReason = e.c.userChoice === 'include' ? 'You included this sale.' : provisional ? 'Best available, but below the normal quality bar.' : 'Strong match.'
    } else {
      e.status = 'reserve'
      if (!e.statusReason) e.statusReason = e.score < (provisional ? PROVISIONAL_MIN : SELECT_MIN) ? 'Too weak a match.' : 'Weaker than the selected sales.'
    }
  }

  const n = chosen.length
  const confirmedLong = chosen.filter((e) => e.c.leaseStatus === 'long').length
  const leaseBasis: Valuation['leaseBasis'] = confirmedLong >= 2 && confirmedLong >= n / 2 ? 'verified-long' : 'unverified'
  const hpiApplied = !!opts.hpi && chosen.some((e) => e.factor != null)
  const explanation: string[] = []
  const warnings: string[] = []
  const excludedCount = items.filter((e) => e.status === 'excluded').length

  explanation.push(
    `Found ${comps.length} completed sale${comps.length === 1 ? '' : 's'}${opts.radiusM ? ` within about ${Math.round(opts.radiusM)} m` : ''}${opts.yearsBack ? ` over the last ${opts.yearsBack} years` : ''} (HM Land Registry). Asking prices are never used.`,
  )
  explanation.push(
    opts.hpi
      ? `Restated each sale to ${opts.hpi.latestMonth} prices with the UK House Price Index (${opts.hpi.series === 'flat-maisonette' ? 'flats and maisonettes' : 'all property'}, ${opts.hpi.region}, 3-month average): adjusted price = sale price × index now ÷ index at sale. No further growth is assumed.`
      : 'House price index unavailable, so older sales are not adjusted for market movement.',
  )
  if (excludedCount) explanation.push(`Set aside ${excludedCount} sale${excludedCount === 1 ? '' : 's'} (different type, new build, short lease, outlier or your choice) — see each row for the reason.`)

  if (n < 3) {
    warnings.push(`Only ${n} usable sale${n === 1 ? '' : 's'}; at least 3 are needed. A reliable valuation can't be produced from this evidence.`)
    return { ok: false, method: null, low: 0, base: 0, high: 0, confidence: 'insufficient', leaseBasis, selectedCount: n, confirmedLong, dispersion: 0, hpiApplied, items, explanation, warnings }
  }

  const vals = chosen.map((e) => ({ v: method === 'price-per-sqm' && e.ppsm ? e.ppsm : e.adjusted, w: Math.max(1, e.score) }))
  let qLow = wQuantile(vals, 0.25)
  const qBase = wQuantile(vals, 0.5)
  let qHigh = wQuantile(vals, 0.75)
  const dispersion = qBase > 0 ? (qHigh - qLow) / qBase : 0
  // Small samples understate uncertainty: enforce a minimum width around the middle.
  const minHalf = provisional ? 0.125 : n < 5 ? 0.075 : 0.05
  qLow = Math.min(qLow, qBase * (1 - minHalf))
  qHigh = Math.max(qHigh, qBase * (1 + minHalf))
  const scale = method === 'price-per-sqm' ? subject.floorAreaSqm! : 1
  const round = (x: number) => Math.round((x * scale) / 1000) * 1000

  explanation.push(
    provisional
      ? `Too few strong matches, so the ${n} best available sales were used. Treat the result as provisional.`
      : `Used the ${n} best-matched sale${n === 1 ? '' : 's'} (quality score ${SELECT_MIN}+), weighting closer, more recent and similar-sized flats more heavily.`,
  )
  explanation.push(
    method === 'price-per-sqm'
      ? `Took the weighted middle of their adjusted price per m² (${gbp(qLow)}–${gbp(qHigh)}/m², central ${gbp(qBase)}) and applied it to this flat's ${subject.floorAreaSqm} m².`
      : `Took the weighted middle of their adjusted prices. Sizes aren't verified, so this assumes the flats are broadly similar to this one${subject.floorAreaSqm ? '' : ' — add this flat\'s floor area to value it by price per m²'}.`,
  )
  explanation.push(`The range is the middle half of the evidence, widened to at least ±${Math.round(minHalf * 100)}% because ${provisional ? 'the evidence is weak' : 'samples are small'}.`)

  let confidence: Confidence
  if (provisional) confidence = 'provisional'
  else if (n >= 5 && method === 'price-per-sqm' && confirmedLong >= 3 && dispersion <= 0.15) confidence = 'good'
  else if (n >= 4 && (method === 'price-per-sqm' || confirmedLong >= 2) && dispersion <= 0.25) confidence = 'moderate'
  else confidence = 'low'

  if (leaseBasis === 'unverified') {
    if (confidence === 'good' || confidence === 'moderate') confidence = 'low'
    warnings.push(
      confirmedLong
        ? `Only ${confirmedLong} of ${n} selected sales are verified long-lease sales. The rest may be short leases, which would understate long-lease value — or the range may not reflect a long lease at all.`
        : 'None of the selected sales are verified long-lease sales. This is the value of similar flats with unknown leases, not confirmed long-lease value.',
    )
    explanation.push('Lease lengths of the sales are unverified, so this is a provisional long-lease value.')
  } else explanation.push(`${confirmedLong} of ${n} selected sales are verified long-lease sales.`)
  if (dispersion > 0.3) warnings.push(`The selected sales vary widely (middle half spans ${Math.round(dispersion * 100)}% of the central value).`)
  if (method === 'sale-price') warnings.push('Not adjusted for size or condition — verify floor areas to improve accuracy.')
  if (!hpiApplied) warnings.push('Older sales are not adjusted for market movement.')

  return {
    ok: true,
    method,
    low: round(qLow),
    base: round(qBase),
    high: round(qHigh),
    ppsm: method === 'price-per-sqm' ? { low: qLow, base: qBase, high: qHigh } : undefined,
    confidence,
    leaseBasis,
    selectedCount: n,
    confirmedLong,
    dispersion,
    hpiApplied,
    items,
    explanation,
    warnings,
  }
}

/** True when the lease status came from the user (or a register match they approved), so automation must not change it. */
export function leaseSetByUser(c: Comparable): boolean {
  return c.leaseEvidence ? c.leaseEvidence.source !== 'registered-leases' || !!c.leaseEvidence.approved : c.leaseStatus !== 'unknown'
}

/** Bring v0.2 saved comparables up to the current shape without losing user choices. */
export function migrateComparable(c: Comparable): Comparable {
  if (c.leaseStatus) return c
  return { ...c, leaseStatus: c.longLeaseConfirmed ? 'long' : 'unknown' }
}
