// Capital-protection and risk engine. Deliberately conservative: unknowns never improve the
// verdict, and no status implies a property is safe or profitable.

import type { ModelResult } from './finance'
import type { LeaseAnalysis } from './lease'
import { CONFIDENCE_LABEL, type Valuation } from './comparables'
import type { Deal, Settings } from './types'
import type { LetterTemplateId } from './letters'

export type Severity = 'critical' | 'high' | 'medium' | 'info'
export type DealStatus = 'worth-investigating' | 'more-info' | 'high-risk' | 'unaffordable'

export const STATUS_LABEL: Record<DealStatus, string> = {
  'worth-investigating': 'Worth investigating',
  'more-info': 'More information needed',
  'high-risk': 'High risk',
  unaffordable: 'Unaffordable under current assumptions',
}

export const STATUS_EXPLAIN: Record<DealStatus, string> = {
  'worth-investigating': 'Nothing so far rules it out on your figures. That is a reason to dig deeper, not to buy.',
  'more-info': 'Key facts or costs are unknown, so Leasewise will not give it a positive verdict yet.',
  'high-risk': 'One or more serious problems need specialist advice before spending money on it.',
  unaffordable: 'The cash needed is more than you have available after your reserve.',
}

export interface RiskFlag {
  id: string
  severity: Severity
  title: string
  why: string
  action?: { label: string; letter?: LetterTemplateId; task?: string }
  /** true when the flag exists because information is missing. */
  missingInfo?: boolean
}

export interface RiskReport {
  status: DealStatus
  flags: RiskFlag[]
  reasons: string[]
}

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')

export function assessRisk(input: {
  deal: Deal
  settings: Settings
  base: ModelResult
  worst: ModelResult
  lease: LeaseAnalysis
  values: Valuation | null
}): RiskReport {
  const { deal, settings, base, worst, lease, values } = input
  const flags: RiskFlag[] = []
  const add = (f: RiskFlag) => flags.push(f)
  const inp = base.inputs

  // --- Missing critical facts
  if (inp.purchasePrice.value == null)
    add({ id: 'no-price', severity: 'critical', missingInfo: true, title: 'Price unknown', why: 'Without a price nothing else can be assessed.', action: { label: 'Add the asking price' } })
  if (lease.years == null)
    add({ id: 'no-lease', severity: 'critical', missingInfo: true, title: 'Lease length not verified', why: 'The unexpired term drives the premium, mortgageability and resale value.', action: { label: 'Ask the agent for the lease details', letter: 'agent-lease' } })
  if (inp.premium.value == null && lease.years != null && lease.years < 90)
    add({ id: 'no-premium', severity: 'critical', missingInfo: true, title: 'Extension premium unknown', why: 'Leasewise cannot estimate the premium without a long-lease value. Add comparables or an estimate.', action: { label: 'Fetch comparable sales' } })

  // --- Capital
  if (base.affordable === false)
    add({ id: 'capital', severity: 'critical', title: `Needs ${gbp(-base.headroom)} more than you have`, why: `Base-case cash required is ${gbp(base.cashRequired)}; you have ${gbp(settings.capital)} with ${gbp(settings.reserve)} kept in reserve.` })
  else if (base.affordable && worst.headroom < 0)
    add({ id: 'capital-thin', severity: 'high', title: 'Little room for things going wrong', why: `In the worst case you would need ${gbp(-worst.headroom)} more than you have available.` })

  // --- Financing
  if (deal.financing !== 'cash') {
    if (lease.years != null && lease.years < 80)
      add({ id: 'mortgage', severity: lease.years < 70 ? 'critical' : 'high', title: 'Finance may not be available on this lease', why: `${lease.mortgageNote} The model assumes a ${deal.financing} you have not yet secured.`, action: { label: 'Ask a broker about short-lease lending', letter: 'broker' } })
    else
      add({ id: 'mortgage-unverified', severity: 'medium', title: 'Finance not yet agreed in principle', why: 'Having a deposit does not mean a lender will lend on this property or to you.', action: { label: 'Speak to a mortgage broker', letter: 'broker' } })
    if (base.loan / Math.max(1, base.price) > 0.75)
      add({ id: 'leverage', severity: 'medium', title: 'High borrowing', why: 'Borrowing above 75% of the price magnifies losses if values fall or costs rise.' })
    if (deal.financing === 'bridging')
      add({ id: 'bridging', severity: 'medium', title: 'Short-term bridging debt', why: 'Bridging is expensive and must be repaid by a fixed date; delays to the extension or sale increase costs quickly.' })
  } else if (inp.purchasePrice.value != null && inp.purchasePrice.value > settings.capital) {
    // Covered by the capital check, but explain the cash assumption.
    add({ id: 'cash-assumption', severity: 'info', title: 'Modelled as a cash purchase', why: 'Short leases are often unmortgageable, so cash is the conservative default. Change financing to explore other options.' })
  }

  // --- Lease and premium
  if (lease.marriageValueApplies)
    add({ id: 'marriage', severity: 'medium', title: 'Marriage value applies (80 years or fewer)', why: 'Half of the value released by the extension is added to the premium under current law. Abolition is enacted but not in force.' })
  if (inp.premium.provenance === 'calculated' && inp.premium.value && inp.premium.value > 0)
    add({ id: 'premium-unverified', severity: 'high', title: 'Premium is a Leasewise estimate', why: 'Indicative only. A specialist RICS valuation is needed before relying on it.', action: { label: 'Request a lease-extension valuation quote', letter: 'surveyor' } })
  if (deal.flags.groundRentReview === 'doubling')
    add({ id: 'gr-doubling', severity: 'high', title: 'Doubling ground rent', why: 'Escalating ground rents increase the premium and can make the flat hard to sell or mortgage.' })
  const gr = inp.groundRentAnnual.value
  if (gr != null && gr > 250)
    add({ id: 'gr-ast', severity: 'medium', title: `Ground rent ${gbp(gr)} a year`, why: 'Ground rent above £250 a year outside London (£1,000 in London) can raise legal and lender concerns. A solicitor should review the lease.' })
  if (gr == null)
    add({ id: 'no-gr', severity: 'medium', missingInfo: true, title: 'Ground rent unknown', why: 'Needed for holding costs and the premium calculation.', action: { label: 'Ask the agent', letter: 'agent-lease' } })
  const sc = inp.serviceChargeAnnual.value
  if (sc == null)
    add({ id: 'no-sc', severity: 'medium', missingInfo: true, title: 'Service charge unknown', why: 'Service charges can be large and rising; ask for the last three years and any planned major works.', action: { label: 'Ask the agent', letter: 'agent-lease' } })
  else if (sc > 4000) add({ id: 'sc-high', severity: 'high', title: `High service charge (${gbp(sc)} a year)`, why: 'Reduces rental return and resale appeal. Check what it covers and the reserve fund.' })
  else if (sc > 2500) add({ id: 'sc-mid', severity: 'medium', title: `Service charge ${gbp(sc)} a year`, why: 'Check what it covers, recent increases and any major works planned.' })

  // --- Restrictions
  if (deal.flags.retirement === 'yes')
    add({ id: 'retirement', severity: 'critical', title: 'Retirement / age-restricted property', why: 'Occupancy limits shrink the buyer and tenant pool; resale values and lending are heavily affected.' })
  else if (deal.flags.retirement === 'unknown')
    add({ id: 'retirement-unknown', severity: 'medium', missingInfo: true, title: 'Age restrictions not confirmed', why: 'Many cheap short-lease flats are retirement properties. Confirm before spending on research.', action: { label: 'Ask the agent', letter: 'agent-lease' } })
  if (deal.flags.sharedOwnership === 'yes')
    add({ id: 'shared', severity: 'critical', title: 'Shared ownership', why: 'You would not own 100%, there are resale and letting restrictions, and lease-extension rules differ.' })
  else if (deal.flags.sharedOwnership === 'unknown')
    add({ id: 'shared-unknown', severity: 'medium', missingInfo: true, title: 'Shared ownership not ruled out', why: 'Low advertised prices are sometimes for a part share.' })
  if (deal.flags.unusualLeaseTerms === 'yes')
    add({ id: 'lease-terms', severity: 'high', title: 'Unusual lease or title terms', why: 'Restrictive covenants, defective leases or title issues need a solicitor before you proceed.', action: { label: 'Request a solicitor quote', letter: 'solicitor' } })
  if (deal.flags.auction && !deal.flags.legalPackReviewed)
    add({ id: 'legal-pack', severity: 'high', title: 'Auction legal pack not reviewed', why: 'At auction you usually exchange contracts when the hammer falls, with completion around 28 days later. Have a solicitor review the pack first.', action: { label: 'Request the legal pack', letter: 'legal-pack' } })

  // --- Value evidence
  const resaleProv = inp.resaleValue.provenance
  const professionalValue = resaleProv === 'quote' || resaleProv === 'verified'
  const usesAutoValue = resaleProv === 'calculated'
  const weakValue = usesAutoValue && !!values?.ok && (values.confidence === 'provisional' || values.confidence === 'low' || values.leaseBasis === 'unverified')
  if (!values || !values.ok) {
    if (!professionalValue)
      add({ id: 'comps', severity: 'high', missingInfo: true, title: 'Not enough comparable sales evidence', why: values?.warnings[0] ?? 'No comparable sales fetched yet.', action: { label: 'Fetch comparable sales' } })
  } else if (weakValue) {
    const profitNote = base.exit.complete && base.exit.netProfit > 0 ? ' Any profit shown depends on this unproven figure.' : ''
    add({
      id: 'valuation-weak',
      severity: 'high',
      missingInfo: true,
      title: `Resale value is ${values.confidence === 'provisional' ? 'provisional' : 'not well evidenced'}`,
      why: `${CONFIDENCE_LABEL[values.confidence]}${values.leaseBasis === 'unverified' ? '; comparable lease lengths are unverified' : ''}.${profitNote} Verify long-lease sales and floor areas, or get a professional valuation.`,
      action: { label: 'Fetch comparable sales' },
    })
  }
  const price = inp.purchasePrice.value
  if (values?.ok && price && price < values.low * 0.5)
    add({ id: 'comps-mismatch', severity: 'high', title: 'Comparables may not match this flat', why: `The price (${gbp(price)}) is far below even the lower end of selected sales (${gbp(values.low)}). The sales may be larger or better flats, so resale value and premium could be overstated. Untick sales that aren't similar, or add verified sales of similar flats.` })
  if (values?.ok && inp.resaleValue.value != null && inp.resaleValue.provenance !== 'calculated' && inp.resaleValue.value > values.high * 1.02)
    add({ id: 'optimistic', severity: 'high', title: 'Resale assumption above the evidence', why: `Your resale figure ${gbp(inp.resaleValue.value)} is above the upper end of selected comparables (${gbp(values.high)}).` })

  // --- Contingency and outcomes
  if ((inp.leaseContingencyPct.value ?? 0) < 10 || (inp.improvementContingencyPct.value ?? 0) < 10)
    add({ id: 'contingency', severity: 'medium', title: 'Contingency below 10%', why: 'Extension disputes and building works regularly cost more than planned.' })
  if (base.exit.complete && base.exit.netProfit < 0)
    add({ id: 'loss-base', severity: 'high', title: 'Loss in the base case', why: `On your figures a sale after extension and works would lose ${gbp(-base.exit.netProfit)} after tax.` })
  if (worst.exit.complete && worst.exit.netProfit < 0)
    add({ id: 'loss-worst', severity: base.exit.netProfit < 0 ? 'info' : 'medium', title: `Could lose ${gbp(-worst.exit.netProfit)} in the worst case`, why: 'Lower resale, higher premium, longer holding and over-running works.' })
  if (base.rental.complete && base.rental.annualCashflow < 0)
    add({ id: 'cashflow', severity: 'medium', title: 'Negative rental cash flow', why: `Letting it would cost you ${gbp(-base.rental.monthlyCashflow)} a month on these figures.` })
  if (base.refinance.complete)
    add({ id: 'refi', severity: 'info', title: 'Refinancing is not guaranteed', why: "Depends on a lender's valuation, rental cover tests, your circumstances and rates at the time." })

  // --- Advice
  const quoted = (['leaseSolicitor', 'leaseValuer', 'conveyancing'] as const).filter((k) => inp[k].provenance === 'quote' || inp[k].provenance === 'verified')
  if (quoted.length < 3)
    add({ id: 'advice', severity: 'info', title: 'Professional fees are allowances, not quotes', why: 'Replace the solicitor, valuer and conveyancing allowances with real quotations.', action: { label: 'Request a solicitor quote', letter: 'solicitor' } })

  const order: Severity[] = ['critical', 'high', 'medium', 'info']
  flags.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))

  // --- Status
  const reasons: string[] = []
  let status: DealStatus
  const restriction = flags.find((f) => f.id === 'retirement' || f.id === 'shared')
  const criticalMissing = flags.filter((f) => f.severity === 'critical' && f.missingInfo)
  const highs = flags.filter((f) => f.severity === 'high' || (f.severity === 'critical' && !f.missingInfo))
  if (restriction) {
    status = 'high-risk'
    reasons.push(restriction.title)
  } else if (base.affordable === false) {
    status = 'unaffordable'
    reasons.push(flags.find((f) => f.id === 'capital')!.title)
  } else if (criticalMissing.length || (!values?.ok && !professionalValue) || weakValue) {
    status = 'more-info'
    reasons.push(...criticalMissing.map((f) => f.title))
    if (!values?.ok && !professionalValue) reasons.push('Not enough comparable sales evidence')
    if (weakValue) reasons.push('Resale value not supported by strong comparable evidence')
  } else if ((base.exit.complete && base.exit.netProfit < 0) || highs.length >= 3) {
    status = 'high-risk'
    reasons.push(...highs.slice(0, 3).map((f) => f.title))
  } else {
    status = 'worth-investigating'
    reasons.push('No disqualifying issue found on current figures — keep verifying.')
  }
  return { status, flags, reasons }
}
