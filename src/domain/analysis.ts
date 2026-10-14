// One entry point that connects lease, comparables, finance and risk for a deal.

import { migrateComparable, valueComparables, type Valuation } from './comparables'
import { runModel, sensitivity, type ModelContext, type ModelResult, type Range } from './finance'
import { analyseLease, currentLeaseYears, estimatePremium, relativityBand, type LeaseAnalysis, type PremiumEstimate } from './lease'
import { assessRisk, type RiskReport } from './risk'
import type { Deal, Settings } from './types'

export interface ValueSplit {
  /** Indicative value with the existing short lease (long-lease value × relativity). */
  existing?: Range
  /** Value with a long lease, from comparables or the user's own figure. */
  longLease?: Range
  longLeaseSource: 'professional' | 'own-estimate' | 'comparables' | 'none'
}

export interface DealAnalysis {
  lease: LeaseAnalysis
  values: Valuation | null
  split: ValueSplit
  premium: PremiumEstimate | null
  ctx: ModelContext
  best: ModelResult
  base: ModelResult
  worst: ModelResult
  risk: RiskReport
  sensitivity: ReturnType<typeof sensitivity>
}

export function analyseDeal(deal: Deal, settings: Settings): DealAnalysis {
  const years = currentLeaseYears(deal.facts.leaseYears.value, deal.leaseYearsAsAt)
  const lease = analyseLease(years)
  const values = deal.comps
    ? valueComparables(deal.comps.items.map(migrateComparable), { floorAreaSqm: deal.facts.floorAreaSqm.value }, { hpi: deal.comps.hpi, radiusM: deal.comps.radiusM, yearsBack: deal.comps.yearsBack })
    : null

  // Long-lease value: a professional or user figure always wins over the automated estimate.
  const own = deal.inputs.resaleValue
  const ownProf = own?.value != null && (own.provenance === 'quote' || own.provenance === 'verified')
  const llv: Range | undefined =
    own?.value != null && own.provenance !== 'missing'
      ? { low: own.value * 0.95, base: own.value, high: own.value * 1.05 }
      : values?.ok
        ? { low: values.low, base: values.base, high: values.high }
        : undefined
  const band = years != null ? relativityBand(years) : null
  const split: ValueSplit = {
    longLease: llv,
    longLeaseSource: !llv ? 'none' : ownProf ? 'professional' : own?.value != null ? 'own-estimate' : 'comparables',
    existing: llv && band && years != null && years < 90 ? { low: llv.low * band.low, base: llv.base * ((band.low + band.high) / 2), high: llv.high * band.high } : undefined,
  }

  let premium: PremiumEstimate | null = null
  if (years != null && years < 90 && llv) {
    premium = estimatePremium({ years, groundRent: deal.facts.groundRent.value ?? 0, longLeaseValue: llv })
    if (premium.ok && deal.facts.groundRent.value == null)
      premium.assumptions.unshift('Ground rent unknown — treated as £0, which understates the premium if a rent is payable.')
    if (premium.ok && split.longLeaseSource === 'comparables' && values && values.confidence !== 'good' && values.confidence !== 'moderate')
      premium.assumptions.unshift(`Long-lease value is ${values.confidence === 'provisional' ? 'provisional' : 'low-confidence'}, so this premium range is too.`)
  }
  const ctx: ModelContext = {
    settings,
    leaseYears: years,
    valueRange: values?.ok ? { low: values.low, base: values.base, high: values.high } : undefined,
    premiumRange: premium?.ok ? { low: premium.low!.premium, base: premium.base!.premium, high: premium.high!.premium } : undefined,
  }
  const best = runModel(deal, ctx, 'best')
  const base = runModel(deal, ctx, 'base')
  const worst = runModel(deal, ctx, 'worst')
  const risk = assessRisk({ deal, settings, base, worst, lease, values })
  return { lease, values, split, premium, ctx, best, base, worst, risk, sensitivity: sensitivity(deal, ctx) }
}
