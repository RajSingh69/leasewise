// Plain-English "at a glance" summary: what is known, estimated and missing, whether the
// deal is affordable, and the single most useful next step.

import type { DealAnalysis } from './analysis'
import { gbp } from './format'
import type { Deal, DealFacts } from './types'

export interface GlanceItem {
  label: string
  detail: string
}

export interface Glance {
  known: GlanceItem[]
  estimated: GlanceItem[]
  missing: GlanceItem[]
  affordable: { answer: 'yes' | 'no' | 'unknown'; text: string }
  next: { title: string; why: string; flagId?: string }
}

const FACT_LABEL: Record<keyof DealFacts, string> = {
  askingPrice: 'Asking price',
  leaseYears: 'Lease remaining',
  groundRent: 'Ground rent',
  serviceCharge: 'Service charge',
  bedrooms: 'Bedrooms',
  floorAreaSqm: 'Floor area',
  propertyType: 'Property type',
  listingDate: 'Listing date',
}

function factText(k: keyof DealFacts, v: unknown): string {
  if (v == null) return ''
  if (k === 'askingPrice') return gbp(v as number)
  if (k === 'leaseYears') return `${v} years`
  if (k === 'groundRent' || k === 'serviceCharge') return `${gbp(v as number)} a year`
  if (k === 'floorAreaSqm') return `${v} m²`
  return String(v)
}

export function buildGlance(deal: Deal, a: DealAnalysis): Glance {
  const known: GlanceItem[] = []
  const estimated: GlanceItem[] = []
  const missing: GlanceItem[] = []

  for (const k of Object.keys(FACT_LABEL) as (keyof DealFacts)[]) {
    if (k === 'listingDate' || k === 'propertyType') continue
    const f = deal.facts[k]
    const text = factText(k, f.value)
    if (f.value == null || f.provenance === 'missing') missing.push({ label: FACT_LABEL[k], detail: 'Not known yet' })
    else if (f.provenance === 'verified' || f.provenance === 'quote') known.push({ label: FACT_LABEL[k], detail: `${text} — checked${f.source ? ` (${f.source})` : ''}` })
    else estimated.push({ label: FACT_LABEL[k], detail: `${text} — ${f.provenance === 'agent' ? "agent's claim, not yet checked" : 'your estimate'}` })
  }
  for (const [k, label] of [
    ['retirement', 'Age restrictions'],
    ['sharedOwnership', 'Shared ownership'],
  ] as const) {
    const v = deal.flags[k]
    if (v === 'unknown') missing.push({ label, detail: 'Not ruled out' })
    else known.push({ label, detail: v === 'yes' ? 'Yes — a serious restriction' : 'None' })
  }

  const i = a.base.inputs
  const v = a.values
  if (i.resaleValue.value != null) {
    const r = i.resaleValue
    const line = { label: 'Value with a long lease', detail: gbp(r.value) }
    if (r.provenance === 'quote' || r.provenance === 'verified') known.push({ ...line, detail: `${line.detail} — professional valuation` })
    else estimated.push({ ...line, detail: `${line.detail} — ${r.provenance === 'calculated' && v ? `from ${v.selectedCount} sold flats nearby, ${v.confidence === 'good' || v.confidence === 'moderate' ? v.confidence + ' confidence' : 'weak evidence'}` : 'your estimate'}` })
  } else missing.push({ label: 'Value with a long lease', detail: v && !v.ok ? 'Not enough sold-price evidence' : 'Fetch sold prices nearby' })
  if (i.premium.value != null && a.base.lease.lines.length) {
    const p = i.premium
    const line = { label: 'Lease extension premium', detail: gbp(p.value) }
    if (p.provenance === 'quote' || p.provenance === 'verified') known.push({ ...line, detail: `${line.detail} — from a specialist` })
    else estimated.push({ ...line, detail: a.premium?.ok ? `${gbp(a.premium.low!.premium)}–${gbp(a.premium.high!.premium)} — Leasewise estimate, needs a valuer` : `${line.detail} — estimate` })
  } else if (a.lease.years == null || a.lease.years < 90) missing.push({ label: 'Lease extension premium', detail: 'Needs lease length and a long-lease value' })
  const allowances = Object.values(i).filter((x) => x.provenance === 'assumption').length
  if (allowances) estimated.push({ label: 'Fees and running costs', detail: `${allowances} figures are typical allowances, not quotes` })

  const b = a.base
  const capital = a.ctx.settings.capital - a.ctx.settings.reserve
  const affordable: Glance['affordable'] = !b.cashComplete
    ? { answer: 'unknown', text: `Can't tell yet — ${b.missing.filter((m) => m.affects === 'cash required').map((m) => m.label.toLowerCase()).join(' and ')} unknown.` }
    : b.affordable
      ? { answer: 'yes', text: `On current figures you'd need ${gbp(b.cashRequired)} of your ${gbp(capital)}${a.worst.headroom < 0 ? ' — but not in the worst case' : ''}.` }
      : { answer: 'no', text: `You'd need ${gbp(b.cashRequired)}, which is ${gbp(-b.headroom)} more than the ${gbp(capital)} you can use.` }

  const flags = a.risk.flags
  const pick = flags.find((f) => f.severity === 'critical' && f.action) ?? flags.find((f) => f.missingInfo && f.action) ?? flags.find((f) => f.severity === 'high' && f.action)
  const next: Glance['next'] = pick
    ? { title: pick.action!.label, why: pick.title, flagId: pick.id }
    : a.risk.status === 'unaffordable'
      ? { title: 'Look for cheaper flats or review funding', why: 'This one needs more cash than you have.' }
      : { title: 'Book a viewing and get professional quotes', why: 'Nothing major is missing on paper; check it in person.' }
  return { known, estimated, missing, affordable, next }
}
