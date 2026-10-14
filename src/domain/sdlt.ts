// Stamp Duty Land Tax for residential purchases in England (not Wales: LTT; not Scotland: LBTT).
// Rate tables are effective-dated so historic and future changes can be added without
// touching the calculation. Source: https://www.gov.uk/stamp-duty-land-tax/residential-property-rates
// (checked 14 Oct 2026). Excludes company purchases, linked transactions, multiple dwellings
// and other reliefs; those need a solicitor or HMRC's own calculator.

import type { BuyerCircumstances } from './types'

interface Band {
  upTo: number // Infinity for the top band
  rate: number
}

interface RateTable {
  from: string // ISO date, inclusive
  standard: Band[]
  firstTimeBuyer: Band[]
  firstTimeBuyerMaxPrice: number
  additionalSurcharge: number
  additionalMinPrice: number
  nonResidentSurcharge: number
}

const TABLES: RateTable[] = [
  {
    from: '2022-09-23',
    standard: [
      { upTo: 250_000, rate: 0 },
      { upTo: 925_000, rate: 0.05 },
      { upTo: 1_500_000, rate: 0.1 },
      { upTo: Infinity, rate: 0.12 },
    ],
    firstTimeBuyer: [
      { upTo: 425_000, rate: 0 },
      { upTo: 625_000, rate: 0.05 },
    ],
    firstTimeBuyerMaxPrice: 625_000,
    additionalSurcharge: 0.03,
    additionalMinPrice: 40_000,
    nonResidentSurcharge: 0.02,
  },
  {
    from: '2024-10-31',
    standard: [
      { upTo: 250_000, rate: 0 },
      { upTo: 925_000, rate: 0.05 },
      { upTo: 1_500_000, rate: 0.1 },
      { upTo: Infinity, rate: 0.12 },
    ],
    firstTimeBuyer: [
      { upTo: 425_000, rate: 0 },
      { upTo: 625_000, rate: 0.05 },
    ],
    firstTimeBuyerMaxPrice: 625_000,
    additionalSurcharge: 0.05,
    additionalMinPrice: 40_000,
    nonResidentSurcharge: 0.02,
  },
  {
    from: '2025-04-01',
    standard: [
      { upTo: 125_000, rate: 0 },
      { upTo: 250_000, rate: 0.02 },
      { upTo: 925_000, rate: 0.05 },
      { upTo: 1_500_000, rate: 0.1 },
      { upTo: Infinity, rate: 0.12 },
    ],
    firstTimeBuyer: [
      { upTo: 300_000, rate: 0 },
      { upTo: 500_000, rate: 0.05 },
    ],
    firstTimeBuyerMaxPrice: 500_000,
    additionalSurcharge: 0.05,
    additionalMinPrice: 40_000,
    nonResidentSurcharge: 0.02,
  },
]

export const SDLT_SOURCE = 'https://www.gov.uk/stamp-duty-land-tax/residential-property-rates'
export const SDLT_CHECKED = '2026-10-14'

export interface SdltBreakdownLine {
  from: number
  to: number
  rate: number
  tax: number
}

export interface SdltResult {
  tax: number
  lines: SdltBreakdownLine[]
  tableFrom: string
  reliefApplied: 'first-time-buyer' | null
  notes: string[]
}

function tableFor(date: string): RateTable {
  const t = [...TABLES].reverse().find((x) => date >= x.from)
  if (!t) throw new Error(`No SDLT rate table for ${date}`)
  return t
}

function applyBands(price: number, bands: Band[], surcharge: number): SdltBreakdownLine[] {
  const lines: SdltBreakdownLine[] = []
  let lower = 0
  for (const b of bands) {
    if (price <= lower) break
    const top = Math.min(price, b.upTo)
    const rate = b.rate + surcharge
    lines.push({ from: lower, to: top, rate, tax: (top - lower) * rate })
    lower = b.upTo
  }
  return lines
}

export function calculateSdlt(
  price: number,
  buyer: BuyerCircumstances,
  completionDate = new Date().toISOString().slice(0, 10),
): SdltResult {
  const t = tableFor(completionDate)
  const notes: string[] = []
  if (!(price > 0)) return { tax: 0, lines: [], tableFrom: t.from, reliefApplied: null, notes: ['No price entered.'] }

  let surcharge = 0
  if (buyer.additionalProperty && price >= t.additionalMinPrice) {
    surcharge += t.additionalSurcharge
    notes.push(`Higher rates for additional dwellings: +${t.additionalSurcharge * 100}% on every band.`)
  }
  if (buyer.nonResident) {
    surcharge += t.nonResidentSurcharge
    notes.push(`Non-UK resident surcharge: +${t.nonResidentSurcharge * 100}%.`)
  }

  const ftbEligible = buyer.firstTimeBuyer && !buyer.additionalProperty && price <= t.firstTimeBuyerMaxPrice
  if (buyer.firstTimeBuyer && !ftbEligible) {
    notes.push(
      buyer.additionalProperty
        ? 'First-time buyer relief does not apply when you will own more than one home.'
        : `First-time buyer relief is unavailable above £${t.firstTimeBuyerMaxPrice.toLocaleString('en-GB')}.`,
    )
  }
  const lines = applyBands(price, ftbEligible ? t.firstTimeBuyer : t.standard, surcharge)
  const tax = Math.floor(lines.reduce((s, l) => s + l.tax, 0))
  if (ftbEligible) notes.push('First-time buyer relief applied (must be your only or main residence).')
  notes.push('Assumes England, residential, individual buyer, single dwelling. Confirm with your conveyancer.')
  return { tax, lines, tableFrom: t.from, reliefApplied: ftbEligible ? 'first-time-buyer' : null, notes }
}
