// Lease-extension intelligence for flats in England and Wales.
//
// The premium estimate follows the valuation structure of the Leasehold Reform, Housing and
// Urban Development Act 1993 (Schedule 13), which is the law currently applied to statutory
// lease extensions: loss of ground rent (term) + loss of reversion + 50% marriage value
// when 80 years or fewer remain. It is an INDICATIVE range only. Real premiums depend on
// tribunal-tested rates, relativity evidence, lease terms and negotiation; a specialist
// RICS valuer must advise before any decision.

export const LEGAL_CHECKED = '2026-10-14'

export type LegalStatus = 'in-force' | 'not-commenced' | 'proposed' | 'uncertain'

export interface LegalItem {
  id: string
  status: LegalStatus
  title: string
  summary: string
  impact: string
  source: { label: string; url: string }
}

export const LEGAL_REGISTER: LegalItem[] = [
  {
    id: 'lr-1993',
    status: 'in-force',
    title: 'Statutory lease extension (1993 Act)',
    summary:
      'A qualifying flat leaseholder can claim a new lease adding 90 years to the remaining term at a peppercorn (zero) ground rent, by serving a Section 42 notice.',
    impact: 'This is the route Leasewise values. The premium is set by agreement or by the First-tier Tribunal.',
    source: { label: 'legislation.gov.uk — LRHUDA 1993', url: 'https://www.legislation.gov.uk/ukpga/1993/28/contents' },
  },
  {
    id: 'marriage-value',
    status: 'in-force',
    title: 'Marriage value at 80 years or fewer',
    summary:
      'When 80 years or fewer remain at the date the claim is made, the premium includes 50% of the "marriage value" (the increase in total value released by the extension).',
    impact: 'Premiums rise sharply below 80 years. The Leasewise estimate includes marriage value for these leases.',
    source: { label: 'legislation.gov.uk — 1993 Act, Schedule 13', url: 'https://www.legislation.gov.uk/ukpga/1993/28/schedule/13' },
  },
  {
    id: 'two-year-rule',
    status: 'in-force',
    title: 'Two-year ownership requirement removed',
    summary:
      'Since 31 January 2025 leaseholders no longer need to have owned the flat for two years before claiming a statutory extension.',
    impact: 'A buyer can claim straight after completion. A seller can also start a claim and assign the notice to the buyer.',
    source: { label: 'legislation.gov.uk — Leasehold and Freehold Reform Act 2024', url: 'https://www.legislation.gov.uk/ukpga/2024/22/contents' },
  },
  {
    id: 'landlord-costs',
    status: 'in-force',
    title: "Leaseholder pays the freeholder's reasonable costs",
    summary:
      "Under section 60 of the 1993 Act, the leaseholder pays the freeholder's reasonable legal and valuation costs of a statutory claim, on top of their own.",
    impact: 'Leasewise budgets for both sides\' professional costs.',
    source: { label: 'legislation.gov.uk — 1993 Act s.60', url: 'https://www.legislation.gov.uk/ukpga/1993/28/section/60' },
  },
  {
    id: 'ground-rent-2022',
    status: 'in-force',
    title: 'Ground Rent Act 2022 (new leases)',
    summary:
      'Most new residential long leases granted from 30 June 2022, including voluntary lease extensions, cannot charge ground rent above a peppercorn for the new term.',
    impact: 'An informal (voluntary) extension offer that keeps or raises ground rent needs careful legal advice.',
    source: { label: 'legislation.gov.uk — Leasehold Reform (Ground Rent) Act 2022', url: 'https://www.legislation.gov.uk/ukpga/2022/1/contents' },
  },
  {
    id: 'lafra-valuation',
    status: 'not-commenced',
    title: 'Abolition of marriage value and new valuation method',
    summary:
      'The 2024 Act abolishes marriage value and sets prescribed deferment and capitalisation rates. These provisions are enacted but need secondary legislation and are not yet in force.',
    impact: 'Claims made today are still valued under the current rules, including marriage value. Do not price a purchase on the assumption that reform will apply.',
    source: { label: 'legislation.gov.uk — 2024 Act', url: 'https://www.legislation.gov.uk/ukpga/2024/22/contents' },
  },
  {
    id: 'lafra-990',
    status: 'not-commenced',
    title: '990-year extensions and leaseholder cost protection',
    summary:
      'The 2024 Act provides for 990-year extensions as standard and generally for each side to bear its own costs. These are not yet in force.',
    impact: 'Leasewise currently models a 90-year statutory extension and leaseholder-paid freeholder costs.',
    source: { label: 'legislation.gov.uk — 2024 Act', url: 'https://www.legislation.gov.uk/ukpga/2024/22/contents' },
  },
  {
    id: 'arc-time',
    status: 'uncertain',
    title: 'Freeholder challenge to the 2024 reforms',
    summary:
      'In October 2025 the High Court dismissed freeholders\' human-rights challenge to the 2024 Act reforms (R (ARC Time Freehold Income Authorised Fund) v SSHCLG [2025] EWHC 2751 (Admin)). Any further appeal could affect timing.',
    impact: 'Reform timing remains uncertain; check the current position with your solicitor.',
    source: { label: 'Judiciary summary', url: 'https://www.judiciary.uk/wp-content/uploads/2025/10/Arc-Time-Freehold-Income-Authorised-Fund-and-others-v-Secretary-of-State-for-Housing-Communities-and-Local-Government-SUMMARY-1.pdf' },
  },
  {
    id: 'clr-bill',
    status: 'proposed',
    title: 'Commonhold and Leasehold Reform Bill',
    summary:
      'A draft Bill was published in January 2026 and announced in the May 2026 King\'s Speech, including proposals on ground rent for existing leases. Its final content and timing are not settled.',
    impact: 'Treat as possible future change only. It is not used in any Leasewise calculation.',
    source: { label: 'GOV.UK search — Commonhold and Leasehold Reform Bill', url: 'https://www.gov.uk/search/all?keywords=commonhold+and+leasehold+reform+bill&order=updated-newest' },
  },
]

export const LEASE_SOURCES = [
  { label: 'LEASE (Leasehold Advisory Service) lease extension calculator', url: 'https://www.lease-advice.org/lease-extension-calculator/' },
  { label: 'LEASE guide: extending the lease of a flat', url: 'https://www.lease-advice.org/lease-extension/flats/getting-started/' },
]

export type LeaseBand = 'unknown' | 'very-short' | 'short' | 'marriage-value' | 'watch' | 'long'

export interface LeaseAnalysis {
  years?: number
  band: LeaseBand
  headline: string
  marriageValueApplies: boolean | null
  mortgageability: 'unknown' | 'likely-difficult' | 'restricted' | 'check' | 'generally-ok'
  mortgageNote: string
  routes: string[]
  timeline: string
}

/** Years remaining today, adjusting a stated figure for the time since it was observed. */
export function currentLeaseYears(stated: number | undefined, asAt?: string, today = new Date()): number | undefined {
  if (stated == null || !(stated >= 0)) return undefined
  if (!asAt) return stated
  const elapsed = (today.getTime() - new Date(asAt).getTime()) / (365.25 * 86400_000)
  return Math.max(0, +(stated - Math.max(0, elapsed)).toFixed(1))
}

export function analyseLease(years: number | undefined): LeaseAnalysis {
  const routes = [
    'Statutory extension under the 1993 Act: +90 years, peppercorn ground rent, premium set by agreement or tribunal.',
    'Informal (voluntary) extension negotiated with the freeholder: can be faster but terms vary; get legal advice before agreeing.',
    'Ask the seller to serve a Section 42 notice before completion and assign it to you, so the claim starts at today\'s lease length.',
  ]
  const timeline =
    'Statutory claims commonly take several months; disputed claims that go to the First-tier Tribunal can take a year or more.'
  if (years == null)
    return {
      band: 'unknown',
      headline: 'Lease length not known — this is the single most important fact to verify.',
      marriageValueApplies: null,
      mortgageability: 'unknown',
      mortgageNote: 'Cannot assess lender appetite until the unexpired term is confirmed from the lease or title register.',
      routes,
      timeline,
    }
  const marriage = years <= 80
  if (years < 60)
    return {
      years,
      band: 'very-short',
      headline: `${years} years: very short lease. Extension premium likely to be a large share of value.`,
      marriageValueApplies: true,
      mortgageability: 'likely-difficult',
      mortgageNote: 'Most mainstream lenders are unlikely to lend at this term. Plan on cash or specialist finance and confirm with a broker.',
      routes,
      timeline,
    }
  if (years < 70)
    return {
      years,
      band: 'short',
      headline: `${years} years: short lease. Marriage value applies and many lenders will decline.`,
      marriageValueApplies: true,
      mortgageability: 'restricted',
      mortgageNote: 'Lender criteria vary; many want a minimum unexpired term at the end of the mortgage. Check with a broker before relying on a mortgage.',
      routes,
      timeline,
    }
  if (marriage)
    return {
      years,
      band: 'marriage-value',
      headline: `${years} years: below 80, so marriage value applies and the premium rises every year you wait.`,
      marriageValueApplies: true,
      mortgageability: 'check',
      mortgageNote: 'Some lenders will lend; terms often depend on years remaining at the end of the mortgage. Confirm with a broker.',
      routes,
      timeline,
    }
  if (years < 90)
    return {
      years,
      band: 'watch',
      headline: `${years} years: above 80 today. Extending before it drops to 80 avoids marriage value.`,
      marriageValueApplies: false,
      mortgageability: 'check',
      mortgageNote: 'Usually mortgageable but check lender minimums.',
      routes,
      timeline,
    }
  return {
    years,
    band: 'long',
    headline: `${years} years: not a short lease in the usual sense.`,
    marriageValueApplies: false,
    mortgageability: 'generally-ok',
    mortgageNote: 'Lease length is unlikely to be the main lender concern.',
    routes,
    timeline,
  }
}

// --- Relativity -----------------------------------------------------------------------
// Relativity = value of the existing short lease (without statutory rights) as a % of the
// freehold vacant possession value. Valuers use published graphs and market evidence;
// the band below is an approximate, deliberately wide range informed by commonly cited
// Greater-London-derived graphs (e.g. Savills 2015 unenhanced, Gerald Eve 2016). It is a
// planning aid, not evidence, and outside London relativities can differ.
const RELATIVITY: [years: number, low: number, high: number][] = [
  [30, 0.49, 0.57],
  [40, 0.59, 0.67],
  [50, 0.68, 0.75],
  [60, 0.76, 0.82],
  [70, 0.83, 0.88],
  [75, 0.86, 0.91],
  [80, 0.89, 0.93],
  [85, 0.92, 0.95],
  [90, 0.94, 0.965],
  [99, 0.96, 0.98],
]

export function relativityBand(years: number): { low: number; high: number } | null {
  if (years < RELATIVITY[0][0]) return null
  if (years >= RELATIVITY[RELATIVITY.length - 1][0]) {
    const [, low, high] = RELATIVITY[RELATIVITY.length - 1]
    return { low, high }
  }
  for (let i = 0; i < RELATIVITY.length - 1; i++) {
    const [y0, l0, h0] = RELATIVITY[i]
    const [y1, l1, h1] = RELATIVITY[i + 1]
    if (years >= y0 && years <= y1) {
      const f = (years - y0) / (y1 - y0)
      return { low: l0 + (l1 - l0) * f, high: h0 + (h1 - h0) * f }
    }
  }
  return null
}

export interface PremiumInputs {
  years: number
  groundRent: number // current annual ground rent (£)
  longLeaseValue: number // value of the flat with an extended / long lease (£)
  freeholdUpliftPct?: number // freehold value premium over long lease, default 1%
  relativity?: number // override 0–1
  deferment?: number // default 5% (Cadogan v Sportelli)
  capitalisation?: number // default 6.5%
}

export interface PremiumBreakdown {
  term: number
  reversion: number
  newReversion: number
  diminution: number
  marriageValue: number
  premium: number
  relativity: number
  deferment: number
  capitalisation: number
}

const pv = (rate: number, n: number) => Math.pow(1 + rate, -n)
const annuity = (rate: number, n: number) => (1 - pv(rate, n)) / rate

export function premiumFor(i: Required<Omit<PremiumInputs, 'freeholdUpliftPct'>> & { freeholdUpliftPct: number }): PremiumBreakdown {
  const fhvp = i.longLeaseValue * (1 + i.freeholdUpliftPct / 100)
  const term = i.groundRent > 0 ? i.groundRent * annuity(i.capitalisation, i.years) : 0
  const reversion = fhvp * pv(i.deferment, i.years)
  const newReversion = fhvp * pv(i.deferment, i.years + 90)
  const diminution = term + reversion - newReversion
  let marriageValue = 0
  if (i.years <= 80) {
    const existingLease = fhvp * i.relativity
    const after = i.longLeaseValue + newReversion
    const before = existingLease + term + reversion
    marriageValue = Math.max(0, 0.5 * (after - before))
  }
  return {
    term,
    reversion,
    newReversion,
    diminution,
    marriageValue,
    premium: diminution + marriageValue,
    relativity: i.relativity,
    deferment: i.deferment,
    capitalisation: i.capitalisation,
  }
}

export interface PremiumEstimate {
  ok: boolean
  reason?: string
  low?: PremiumBreakdown
  base?: PremiumBreakdown
  high?: PremiumBreakdown
  assumptions: string[]
}

/**
 * Indicative premium range. Low/high vary relativity, deferment and capitalisation rates
 * and, when supplied, the long-lease value range from comparable evidence.
 */
export function estimatePremium(
  input: Omit<PremiumInputs, 'longLeaseValue'> & { longLeaseValue: { low: number; base: number; high: number } },
): PremiumEstimate {
  const assumptions: string[] = []
  const { years, groundRent } = input
  if (!(years > 0)) return { ok: false, reason: 'Lease length unknown.', assumptions }
  if (!(input.longLeaseValue.base > 0)) return { ok: false, reason: 'No long-lease value available (add comparables or an estimate).', assumptions }
  const band = relativityBand(years)
  if (!band && input.relativity == null)
    return { ok: false, reason: 'Below 30 years the evidence is too thin for an indicative calculation. Get a specialist valuation.', assumptions }
  const rel = input.relativity != null ? { low: input.relativity, high: input.relativity } : band!
  const uplift = input.freeholdUpliftPct ?? 1
  const d = input.deferment ?? 0.05
  const c = input.capitalisation ?? 0.065

  assumptions.push(
    `Unexpired term ${years} years; ground rent £${groundRent.toLocaleString('en-GB')} a year treated as fixed (reviews or doubling clauses raise the premium).`,
    `Deferment rate ${(d * 100).toFixed(2)}% base (the Sportelli rate for flats), varied ±0.25% for the range.`,
    `Capitalisation rate ${(c * 100).toFixed(1)}% base, varied ±1%.`,
    input.relativity != null
      ? `Relativity fixed at ${(input.relativity * 100).toFixed(1)}% (your figure).`
      : `Relativity ${(rel.low * 100).toFixed(1)}%–${(rel.high * 100).toFixed(1)}% from an approximate published-graph band; local evidence may differ.`,
    `Freehold value taken as long-lease value + ${uplift}%.`,
    'Extension adds 90 years at a peppercorn rent (current statutory route). Excludes any compensation for other losses and all professional fees.',
  )
  const run = (llv: number, relativity: number, deferment: number, capitalisation: number) =>
    premiumFor({ years, groundRent, longLeaseValue: llv, freeholdUpliftPct: uplift, relativity, deferment, capitalisation })
  return {
    ok: true,
    low: run(input.longLeaseValue.low, rel.high, d + 0.0025, c + 0.01),
    base: run(input.longLeaseValue.base, (rel.low + rel.high) / 2, d, c),
    high: run(input.longLeaseValue.high, rel.low, d - 0.0025, c - 0.01),
    assumptions,
  }
}
