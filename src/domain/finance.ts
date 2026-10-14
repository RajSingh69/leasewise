// Connected financial model for a short-lease flat project: buy, extend the lease, improve,
// hold, then sell / let / refinance. Every figure carries its provenance so the UI and the
// risk engine can tell a quoted fee from a planning default.

import { calculateSdlt, type SdltResult } from './sdlt'
import type { Deal, FinancingType, InputKey, NumFact, Provenance, Settings } from './types'

export type Unit = 'gbp' | 'pct' | 'months' | 'weeks'
export type InputGroup = 'financing' | 'acquisition' | 'lease' | 'improvements' | 'holding' | 'exit' | 'rental' | 'refinance'

export interface Range {
  low: number
  base: number
  high: number
}

export interface ModelContext {
  settings: Settings
  leaseYears?: number
  premiumRange?: Range // indicative premium (calculated)
  valueRange?: Range // long-lease value from comparables (calculated)
}

interface InputDef {
  key: InputKey
  label: string
  group: InputGroup
  unit: Unit
  help: string
  /** Planning default when the user has not entered a figure. undefined = missing. */
  fallback?: (deal: Deal, ctx: ModelContext) => { value: number; provenance: Provenance; source?: string } | undefined
}

const assume = (value: number, source = 'Leasewise planning allowance — replace with a quote') => () => ({
  value,
  provenance: 'assumption' as const,
  source,
})
const byFinancing =
  (v: Record<FinancingType, number>, source?: string) =>
  (d: Deal) => ({ value: v[d.financing], provenance: 'assumption' as const, source: source ?? 'Typical market level — confirm with a broker' })

export const INPUT_DEFS: InputDef[] = [
  // Financing
  { key: 'depositPct', label: 'Deposit', group: 'financing', unit: 'pct', help: 'Share of the price paid from your own cash. Cash purchase = 100%.', fallback: byFinancing({ cash: 100, mortgage: 25, bridging: 30 }) },
  { key: 'interestRatePct', label: 'Interest rate (annual)', group: 'financing', unit: 'pct', help: 'Bridging loans are usually quoted monthly; 0.9% a month ≈ 11% a year.', fallback: byFinancing({ cash: 0, mortgage: 5.5, bridging: 11 }) },
  { key: 'lenderFees', label: 'Lender arrangement fees', group: 'financing', unit: 'gbp', help: 'Product, arrangement and valuation fees.', fallback: byFinancing({ cash: 0, mortgage: 999, bridging: 2500 }) },
  { key: 'brokerFee', label: 'Broker fee', group: 'financing', unit: 'gbp', help: 'Some brokers charge nothing; others a fixed fee.', fallback: byFinancing({ cash: 0, mortgage: 500, bridging: 995 }) },
  { key: 'exitFeePct', label: 'Loan exit fee', group: 'financing', unit: 'pct', help: 'Charged by some bridging lenders on repayment.', fallback: byFinancing({ cash: 0, mortgage: 0, bridging: 1 }) },
  // Acquisition
  { key: 'purchasePrice', label: 'Purchase price', group: 'acquisition', unit: 'gbp', help: 'What you expect to pay. Defaults to the asking price.', fallback: (d) => (d.facts.askingPrice.value ? { value: d.facts.askingPrice.value, provenance: d.facts.askingPrice.provenance, source: 'Asking price' } : undefined) },
  { key: 'sdltOverride', label: 'Stamp Duty (override)', group: 'acquisition', unit: 'gbp', help: 'Leave blank to use the Leasewise SDLT calculation for your circumstances.' },
  { key: 'conveyancing', label: 'Conveyancing (purchase)', group: 'acquisition', unit: 'gbp', help: 'Leasehold purchases cost more than freehold.', fallback: assume(1800) },
  { key: 'searches', label: 'Searches & disbursements', group: 'acquisition', unit: 'gbp', help: 'Local, drainage, environmental searches; Land Registry fee; management pack.', fallback: assume(650) },
  { key: 'survey', label: 'Building survey', group: 'acquisition', unit: 'gbp', help: 'RICS Level 2 or 3 survey.', fallback: assume(600) },
  { key: 'auctionFees', label: "Auction buyer's fees", group: 'acquisition', unit: 'gbp', help: "Buyer's premium / administration fee — check the auction catalogue.", fallback: (d) => (d.flags.auction ? { value: 1800, provenance: 'assumption', source: 'Typical auction buyer fee — check the catalogue' } : { value: 0, provenance: 'calculated', source: 'Not an auction' }) },
  { key: 'legalPackReview', label: 'Legal pack review', group: 'acquisition', unit: 'gbp', help: 'Solicitor review of the auction legal pack before bidding.', fallback: (d) => (d.flags.auction ? { value: 600, provenance: 'assumption' } : { value: 0, provenance: 'calculated', source: 'Not an auction' }) },
  { key: 'otherAcquisition', label: 'Other buying costs', group: 'acquisition', unit: 'gbp', help: 'Anything else at purchase.', fallback: assume(0, 'None assumed') },
  // Lease extension
  { key: 'premium', label: 'Lease extension premium', group: 'lease', unit: 'gbp', help: 'Paid to the freeholder. Use a specialist valuation when you have one.', fallback: (_d, ctx) => (ctx.premiumRange ? { value: ctx.premiumRange.base, provenance: 'calculated', source: 'Leasewise indicative estimate' } : ctx.leaseYears != null && ctx.leaseYears >= 90 ? { value: 0, provenance: 'calculated', source: 'No extension planned at 90+ years' } : undefined) },
  { key: 'leaseSolicitor', label: 'Your solicitor (extension)', group: 'lease', unit: 'gbp', help: 'Statutory lease extension legal work.', fallback: assume(1500) },
  { key: 'leaseValuer', label: 'Your specialist valuer', group: 'lease', unit: 'gbp', help: 'RICS lease-extension valuation report.', fallback: assume(900) },
  { key: 'freeholderCosts', label: "Freeholder's recoverable costs", group: 'lease', unit: 'gbp', help: "Under current law you pay the freeholder's reasonable legal and valuation costs.", fallback: assume(2000) },
  { key: 'landRegistryFees', label: 'Land Registry & other', group: 'lease', unit: 'gbp', help: 'Registering the new lease and minor disbursements.', fallback: assume(100) },
  { key: 'leaseContingencyPct', label: 'Extension contingency', group: 'lease', unit: 'pct', help: 'Allowance for a higher-than-expected premium or dispute costs.', fallback: assume(10, 'Conservative default') },
  // Improvements
  { key: 'refurb', label: 'Refurbishment budget', group: 'improvements', unit: 'gbp', help: 'Kitchen, bathroom, decoration, flooring.', fallback: assume(8000, 'Placeholder — get builder quotes') },
  { key: 'layout', label: 'Layout alterations', group: 'improvements', unit: 'gbp', help: 'Structural or layout changes need freeholder consent under most leases.', fallback: assume(0, 'None assumed') },
  { key: 'permissionsFees', label: 'Consents & professional fees', group: 'improvements', unit: 'gbp', help: 'Licence for alterations, architect, structural engineer.', fallback: assume(0, 'None assumed') },
  { key: 'buildingRegs', label: 'Building regulations', group: 'improvements', unit: 'gbp', help: 'Building control fees where works require them.', fallback: assume(0, 'None assumed') },
  { key: 'improvementContingencyPct', label: 'Works contingency', group: 'improvements', unit: 'pct', help: 'Refurbishments routinely overrun.', fallback: assume(15, 'Conservative default') },
  // Holding
  { key: 'holdingMonths', label: 'Holding period', group: 'holding', unit: 'months', help: 'Purchase to sale, including the extension claim and works.', fallback: assume(9, 'Typical extension + refurbish + sell timeline') },
  { key: 'serviceChargeAnnual', label: 'Service charge (per year)', group: 'holding', unit: 'gbp', help: 'From the listing or management pack.', fallback: (d) => (d.facts.serviceCharge.value != null ? { value: d.facts.serviceCharge.value, provenance: d.facts.serviceCharge.provenance } : undefined) },
  { key: 'groundRentAnnual', label: 'Ground rent (per year)', group: 'holding', unit: 'gbp', help: 'Stops after a statutory extension (peppercorn).', fallback: (d) => (d.facts.groundRent.value != null ? { value: d.facts.groundRent.value, provenance: d.facts.groundRent.provenance } : undefined) },
  { key: 'councilTaxMonthly', label: 'Council tax (per month)', group: 'holding', unit: 'gbp', help: 'Empty homes may still be charged in full.', fallback: assume(150, 'Approximate Woking band B/C — check the band') },
  { key: 'insuranceAnnual', label: 'Contents / unoccupied cover', group: 'holding', unit: 'gbp', help: 'Building insurance is usually in the service charge.', fallback: assume(250) },
  { key: 'utilitiesMonthly', label: 'Utilities (per month)', group: 'holding', unit: 'gbp', help: 'Standing charges while empty.', fallback: assume(80) },
  { key: 'maintenanceMonthly', label: 'Maintenance (per month)', group: 'holding', unit: 'gbp', help: '', fallback: assume(30) },
  { key: 'otherMonthly', label: 'Other monthly costs', group: 'holding', unit: 'gbp', help: '', fallback: assume(0, 'None assumed') },
  // Exit (sale)
  { key: 'resaleValue', label: 'Resale value (extended lease)', group: 'exit', unit: 'gbp', help: 'Defaults to the middle of the comparable-sales range.', fallback: (_d, ctx) => (ctx.valueRange ? { value: ctx.valueRange.base, provenance: 'calculated', source: 'Median of selected comparables' } : undefined) },
  { key: 'agentFeePct', label: 'Estate agent fee', group: 'exit', unit: 'pct', help: 'Including VAT.', fallback: assume(1.8, '1.5% + VAT') },
  { key: 'sellingLegal', label: 'Selling legal fees', group: 'exit', unit: 'gbp', help: '', fallback: assume(1300) },
  { key: 'taxRatePct', label: 'Tax on profit (illustrative)', group: 'exit', unit: 'pct', help: 'Capital gains or income tax depends on your circumstances and whether HMRC sees the project as trading. Take tax advice.', fallback: assume(24, 'Residential CGT higher rate — illustrative only') },
  // Rental
  { key: 'monthlyRent', label: 'Monthly rent', group: 'rental', unit: 'gbp', help: 'Check current local lettings for similar flats.' },
  { key: 'voidWeeks', label: 'Void weeks per year', group: 'rental', unit: 'weeks', help: 'Weeks without a tenant.', fallback: assume(4, 'Conservative default') },
  { key: 'lettingAgentPct', label: 'Letting agent fee', group: 'rental', unit: 'pct', help: 'Percentage of rent including VAT. 0 if self-managing.', fallback: assume(14.4, '12% + VAT full management') },
  { key: 'rentalMaintenancePct', label: 'Repairs allowance', group: 'rental', unit: 'pct', help: 'Percentage of rent set aside for repairs.', fallback: assume(8) },
  { key: 'landlordInsuranceAnnual', label: 'Landlord insurance (per year)', group: 'rental', unit: 'gbp', help: '', fallback: assume(300) },
  { key: 'complianceAnnual', label: 'Safety & compliance (per year)', group: 'rental', unit: 'gbp', help: 'Gas safety, EICR share, EPC, deposit protection, any licensing.', fallback: assume(350) },
  // Refinance
  { key: 'postWorksValue', label: 'Post-works valuation', group: 'refinance', unit: 'gbp', help: "A lender's surveyor sets this, often more cautiously than you.", fallback: (_d, ctx) => (ctx.valueRange ? { value: ctx.valueRange.low, provenance: 'calculated', source: 'Lower quartile of comparables (cautious)' } : undefined) },
  { key: 'refiLtvPct', label: 'Refinance loan-to-value', group: 'refinance', unit: 'pct', help: 'Buy-to-let lenders typically 60–75%, subject to rental cover tests.', fallback: assume(75, 'Typical maximum — not guaranteed') },
  { key: 'refiRatePct', label: 'Refinance rate (annual)', group: 'refinance', unit: 'pct', help: '', fallback: assume(5.75) },
  { key: 'refiFees', label: 'Refinance fees', group: 'refinance', unit: 'gbp', help: 'Arrangement, valuation, legal.', fallback: assume(1800) },
]

export const INPUT_DEF_BY_KEY = Object.fromEntries(INPUT_DEFS.map((d) => [d.key, d])) as Record<InputKey, InputDef>

export interface ResolvedInput {
  key: InputKey
  value: number | undefined
  provenance: Provenance
  source?: string
}

export function resolveInputs(deal: Deal, ctx: ModelContext): Record<InputKey, ResolvedInput> {
  const out = {} as Record<InputKey, ResolvedInput>
  for (const def of INPUT_DEFS) {
    const own: NumFact | undefined = deal.inputs[def.key]
    if (own && own.value != null && own.provenance !== 'missing') {
      out[def.key] = { key: def.key, value: own.value, provenance: own.provenance, source: own.source }
      continue
    }
    const fb = def.fallback?.(deal, ctx)
    out[def.key] = fb ? { key: def.key, ...fb } : { key: def.key, value: undefined, provenance: 'missing' }
  }
  return out
}

export type Scenario = 'best' | 'base' | 'worst'

export interface Line {
  label: string
  amount: number
  provenance: Provenance
  key?: InputKey
}

export interface ModelResult {
  scenario: Scenario
  inputs: Record<InputKey, ResolvedInput>
  price: number
  deposit: number
  loan: number
  sdlt: SdltResult
  acquisition: { lines: Line[]; total: number }
  lease: { lines: Line[]; total: number }
  improvements: { lines: Line[]; total: number }
  holding: { lines: Line[]; total: number; months: number }
  cashRequired: number
  headroom: number
  affordable: boolean | null
  exit: {
    resale: number
    agentFees: number
    sellingLegal: number
    loanRepayment: number
    totalProjectCost: number
    profitPreTax: number
    tax: number
    netProfit: number
    roiOnCash: number
    complete: boolean
  }
  rental: {
    complete: boolean
    annualRentAfterVoids: number
    costs: Line[]
    annualFinance: number
    annualCashflow: number
    monthlyCashflow: number
    grossYield: number
    netYield: number
  }
  refinance: {
    complete: boolean
    newLoan: number
    repayExisting: number
    fees: number
    cashReleased: number
    cashLeftIn: number
  }
  missing: { key: InputKey; label: string; affects: string }[]
  cashComplete: boolean
}

interface ScenarioAdjust {
  resale: number
  refurb: number
  holding: number
  rent: number
  rateAdd: number
  voids: number
  premium: 'low' | 'base' | 'high'
  premiumFactor: number
}

const ADJUST: Record<Scenario, ScenarioAdjust> = {
  best: { resale: 1.05, refurb: 0.9, holding: 0.8, rent: 1.05, rateAdd: -0.5, voids: 0.5, premium: 'low', premiumFactor: 0.95 },
  base: { resale: 1, refurb: 1, holding: 1, rent: 1, rateAdd: 0, voids: 1, premium: 'base', premiumFactor: 1 },
  worst: { resale: 0.9, refurb: 1.3, holding: 1.5, rent: 0.9, rateAdd: 1.5, voids: 2, premium: 'high', premiumFactor: 1.15 },
}

export const SCENARIO_NOTES: Record<Scenario, string> = {
  best: 'Resale +5%, works −10%, holding −20%, premium at low end of range, rent +5%, rate −0.5%.',
  base: 'Your figures and Leasewise defaults as entered.',
  worst: 'Resale −10%, works +30%, holding +50%, premium at high end (+15% on quotes), rent −10%, rate +1.5%, voids doubled.',
}

export function runModel(deal: Deal, ctx: ModelContext, scenario: Scenario = 'base', override?: Partial<Record<InputKey, number>>): ModelResult {
  const inputs = resolveInputs(deal, ctx)
  const a = ADJUST[scenario]
  const v = (k: InputKey) => override?.[k] ?? inputs[k].value ?? 0
  const p = (k: InputKey) => inputs[k].provenance

  const missing: ModelResult['missing'] = []
  const need = (k: InputKey, affects: string) => {
    if (inputs[k].value == null && override?.[k] == null) missing.push({ key: k, label: INPUT_DEF_BY_KEY[k].label, affects })
  }
  need('purchasePrice', 'cash required')
  need('premium', 'cash required')
  need('serviceChargeAnnual', 'holding costs')
  need('groundRentAnnual', 'holding costs')
  need('resaleValue', 'profit')
  need('monthlyRent', 'rental')

  const price = v('purchasePrice')
  const depositPct = Math.min(100, Math.max(0, v('depositPct')))
  const deposit = deal.financing === 'cash' ? price : (price * depositPct) / 100
  const loan = price - deposit
  const rate = Math.max(0, v('interestRatePct') + (deal.financing === 'cash' ? 0 : a.rateAdd)) / 100

  const sdlt = calculateSdlt(price, ctx.settings.buyer)
  const sdltAmount = inputs.sdltOverride.value ?? sdlt.tax
  const acqLines: Line[] = ([
    { label: 'Stamp Duty Land Tax', amount: sdltAmount, provenance: inputs.sdltOverride.value != null ? p('sdltOverride') : 'calculated', key: 'sdltOverride' },
    { label: 'Conveyancing', amount: v('conveyancing'), provenance: p('conveyancing'), key: 'conveyancing' },
    { label: 'Searches & disbursements', amount: v('searches'), provenance: p('searches'), key: 'searches' },
    { label: 'Survey', amount: v('survey'), provenance: p('survey'), key: 'survey' },
    { label: "Auction buyer's fees", amount: v('auctionFees'), provenance: p('auctionFees'), key: 'auctionFees' },
    { label: 'Legal pack review', amount: v('legalPackReview'), provenance: p('legalPackReview'), key: 'legalPackReview' },
    { label: 'Lender fees', amount: v('lenderFees'), provenance: p('lenderFees'), key: 'lenderFees' },
    { label: 'Broker fee', amount: v('brokerFee'), provenance: p('brokerFee'), key: 'brokerFee' },
    { label: 'Other', amount: v('otherAcquisition'), provenance: p('otherAcquisition'), key: 'otherAcquisition' },
  ] satisfies Line[]).filter((l) => l.amount !== 0 || l.provenance !== 'calculated')
  const acqTotal = sum(acqLines)

  // Premium: specialist figures (quote/verified) get a factor; calculated estimates use the range.
  let premium = v('premium')
  let premiumProv = p('premium')
  if (override?.premium == null) {
    if (premiumProv === 'calculated' && ctx.premiumRange) premium = ctx.premiumRange[a.premium]
    else premium = premium * a.premiumFactor
  } else premiumProv = 'estimate'
  const leaseSub = premium + v('leaseSolicitor') + v('leaseValuer') + v('freeholderCosts') + v('landRegistryFees')
  const leaseApplies = !(ctx.leaseYears != null && ctx.leaseYears >= 90 && inputs.premium.value === 0)
  const leaseLines: Line[] = leaseApplies
    ? [
        { label: 'Premium to freeholder', amount: premium, provenance: premiumProv, key: 'premium' },
        { label: 'Your solicitor', amount: v('leaseSolicitor'), provenance: p('leaseSolicitor'), key: 'leaseSolicitor' },
        { label: 'Your valuer', amount: v('leaseValuer'), provenance: p('leaseValuer'), key: 'leaseValuer' },
        { label: "Freeholder's costs", amount: v('freeholderCosts'), provenance: p('freeholderCosts'), key: 'freeholderCosts' },
        { label: 'Land Registry & other', amount: v('landRegistryFees'), provenance: p('landRegistryFees'), key: 'landRegistryFees' },
        { label: `Contingency (${v('leaseContingencyPct')}%)`, amount: (leaseSub * v('leaseContingencyPct')) / 100, provenance: p('leaseContingencyPct'), key: 'leaseContingencyPct' },
      ]
    : []
  const leaseTotal = sum(leaseLines)

  const works = (v('refurb') + v('layout')) * a.refurb + v('permissionsFees') + v('buildingRegs')
  const impLines: Line[] = [
    { label: 'Refurbishment', amount: v('refurb') * a.refurb, provenance: p('refurb'), key: 'refurb' },
    { label: 'Layout alterations', amount: v('layout') * a.refurb, provenance: p('layout'), key: 'layout' },
    { label: 'Consents & professional fees', amount: v('permissionsFees'), provenance: p('permissionsFees'), key: 'permissionsFees' },
    { label: 'Building regulations', amount: v('buildingRegs'), provenance: p('buildingRegs'), key: 'buildingRegs' },
    { label: `Contingency (${v('improvementContingencyPct')}%)`, amount: (works * v('improvementContingencyPct')) / 100, provenance: p('improvementContingencyPct'), key: 'improvementContingencyPct' },
  ]
  const impTotal = sum(impLines)

  const months = v('holdingMonths') * a.holding
  const holdLines: Line[] = ([
    { label: `Interest (${months.toFixed(0)} months)`, amount: (loan * rate * months) / 12, provenance: p('interestRatePct'), key: 'interestRatePct' },
    { label: 'Service charge', amount: (v('serviceChargeAnnual') * months) / 12, provenance: p('serviceChargeAnnual'), key: 'serviceChargeAnnual' },
    { label: 'Ground rent', amount: (v('groundRentAnnual') * months) / 12, provenance: p('groundRentAnnual'), key: 'groundRentAnnual' },
    { label: 'Council tax', amount: v('councilTaxMonthly') * months, provenance: p('councilTaxMonthly'), key: 'councilTaxMonthly' },
    { label: 'Insurance', amount: (v('insuranceAnnual') * months) / 12, provenance: p('insuranceAnnual'), key: 'insuranceAnnual' },
    { label: 'Utilities', amount: v('utilitiesMonthly') * months, provenance: p('utilitiesMonthly'), key: 'utilitiesMonthly' },
    { label: 'Maintenance', amount: v('maintenanceMonthly') * months, provenance: p('maintenanceMonthly'), key: 'maintenanceMonthly' },
    { label: 'Other', amount: v('otherMonthly') * months, provenance: p('otherMonthly'), key: 'otherMonthly' },
  ] satisfies Line[]).filter((l) => l.amount !== 0 || l.provenance === 'missing')
  const holdTotal = sum(holdLines)

  const cashRequired = deposit + acqTotal + leaseTotal + impTotal + holdTotal
  const cashComplete = !missing.some((m) => m.affects === 'cash required')
  const headroom = ctx.settings.capital - ctx.settings.reserve - cashRequired
  const affordable = cashComplete ? headroom >= 0 : null

  // Sale
  // Automated valuations use the evidence range: the worst case is never better than the
  // bottom of the range and the best case never above its top. User / professional figures
  // keep the standard ±% scenario adjustments.
  let resale = v('resaleValue') * a.resale
  if (override?.resaleValue == null && inputs.resaleValue.provenance === 'calculated' && ctx.valueRange) {
    if (scenario === 'worst') resale = Math.min(ctx.valueRange.low, resale)
    if (scenario === 'best') resale = Math.min(ctx.valueRange.high, resale)
  }
  const agentFees = (resale * v('agentFeePct')) / 100
  const exitFee = (loan * v('exitFeePct')) / 100
  const totalProjectCost = price + acqTotal + leaseTotal + impTotal + holdTotal + exitFee
  const profitPreTax = resale - agentFees - v('sellingLegal') - totalProjectCost
  const tax = Math.max(0, profitPreTax) * (v('taxRatePct') / 100)
  const netProfit = profitPreTax - tax
  const exitComplete = cashComplete && inputs.resaleValue.value != null

  // Refinance (after works, instead of selling)
  const postValue = v('postWorksValue') * (scenario === 'worst' ? 0.95 : 1)
  const newLoan = (postValue * v('refiLtvPct')) / 100
  const refiFees = v('refiFees')
  const repayExisting = loan + exitFee
  const cashReleased = newLoan - repayExisting - refiFees
  const refiComplete = cashComplete && inputs.postWorksValue.value != null

  // Rental (after works). Finance: refinanced loan if refinance figures exist, else the purchase loan.
  const rent = v('monthlyRent') * a.rent
  const voidWeeks = Math.min(52, v('voidWeeks') * a.voids)
  const annualRent = rent * 12 * ((52 - voidWeeks) / 52)
  const rentalCosts: Line[] = [
    { label: 'Letting agent', amount: (annualRent * v('lettingAgentPct')) / 100, provenance: p('lettingAgentPct'), key: 'lettingAgentPct' },
    { label: 'Repairs allowance', amount: (annualRent * v('rentalMaintenancePct')) / 100, provenance: p('rentalMaintenancePct'), key: 'rentalMaintenancePct' },
    { label: 'Service charge', amount: v('serviceChargeAnnual'), provenance: p('serviceChargeAnnual'), key: 'serviceChargeAnnual' },
    { label: 'Ground rent', amount: leaseApplies ? 0 : v('groundRentAnnual'), provenance: leaseApplies ? 'calculated' : p('groundRentAnnual'), key: 'groundRentAnnual' },
    { label: 'Landlord insurance', amount: v('landlordInsuranceAnnual'), provenance: p('landlordInsuranceAnnual'), key: 'landlordInsuranceAnnual' },
    { label: 'Safety & compliance', amount: v('complianceAnnual'), provenance: p('complianceAnnual'), key: 'complianceAnnual' },
  ]
  const opCosts = sum(rentalCosts)
  const refiRate = (v('refiRatePct') + a.rateAdd) / 100
  const annualFinance = refiComplete ? newLoan * refiRate : loan * rate
  const annualCashflow = annualRent - opCosts - annualFinance
  const invested = price + acqTotal + leaseTotal + impTotal
  const rentalComplete = cashComplete && inputs.monthlyRent.value != null

  return {
    scenario,
    inputs,
    price,
    deposit,
    loan,
    sdlt,
    acquisition: { lines: acqLines, total: acqTotal },
    lease: { lines: leaseLines, total: leaseTotal },
    improvements: { lines: impLines, total: impTotal },
    holding: { lines: holdLines, total: holdTotal, months },
    cashRequired,
    headroom,
    affordable,
    exit: {
      resale,
      agentFees,
      sellingLegal: v('sellingLegal'),
      loanRepayment: loan + exitFee,
      totalProjectCost,
      profitPreTax,
      tax,
      netProfit,
      roiOnCash: cashRequired > 0 ? netProfit / cashRequired : 0,
      complete: exitComplete,
    },
    rental: {
      complete: rentalComplete,
      annualRentAfterVoids: annualRent,
      costs: rentalCosts,
      annualFinance,
      annualCashflow,
      monthlyCashflow: annualCashflow / 12,
      grossYield: price > 0 ? (rent * 12) / price : 0,
      netYield: invested > 0 ? (annualRent - opCosts) / invested : 0,
    },
    refinance: {
      complete: refiComplete,
      newLoan,
      repayExisting,
      fees: refiFees,
      cashReleased,
      cashLeftIn: cashRequired - cashReleased,
    },
    missing,
    cashComplete,
  }
}

function sum(lines: Line[]) {
  return lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0)
}

export interface SensitivityRow {
  label: string
  netProfit: number
  delta: number
  cashRequired: number
}

/** How base-case net profit moves when one assumption changes. */
export function sensitivity(deal: Deal, ctx: ModelContext): { base: number; rows: SensitivityRow[] } {
  const base = runModel(deal, ctx, 'base')
  const i = base.inputs
  const val = (k: InputKey) => i[k].value ?? 0
  const cases: [string, Partial<Record<InputKey, number>>][] = [
    ['Resale value −10%', { resaleValue: val('resaleValue') * 0.9 }],
    ['Resale value +10%', { resaleValue: val('resaleValue') * 1.1 }],
    ['Premium +25%', { premium: base.lease.lines[0]?.amount * 1.25 || 0 }],
    ['Refurbishment +50%', { refurb: val('refurb') * 1.5 }],
    ['Holding period +6 months', { holdingMonths: val('holdingMonths') + 6 }],
    ['Interest rate +2%', { interestRatePct: val('interestRatePct') + 2 }],
    ['Buy 5% below asking', { purchasePrice: val('purchasePrice') * 0.95 }],
  ]
  const rows = cases.map(([label, o]) => {
    const r = runModel(deal, ctx, 'base', o)
    return { label, netProfit: r.exit.netProfit, delta: r.exit.netProfit - base.exit.netProfit, cashRequired: r.cashRequired }
  })
  return { base: base.exit.netProfit, rows }
}
