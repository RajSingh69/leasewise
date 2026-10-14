import { describe, expect, it } from 'vitest'
import { calculateSdlt } from './sdlt'
import { analyseLease, currentLeaseYears, estimatePremium, premiumFor, relativityBand } from './lease'
import { scoreComparable, valueComparables } from './comparables'
import { runModel } from './finance'
import { analyseDeal } from './analysis'
import { defaultSettings, newDeal, agentFact } from './factories'
import { findDuplicate, identifyListing, parseListingText } from './listing'
import { draftLetter } from './letters'
import type { Comparable, Deal } from './types'

const none = { firstTimeBuyer: false, additionalProperty: false, nonResident: false }

describe('SDLT (England, from 1 April 2025)', () => {
  const d = '2026-10-14'
  it('standard rates', () => {
    expect(calculateSdlt(120_000, none, d).tax).toBe(0)
    expect(calculateSdlt(150_000, none, d).tax).toBe(500)
    expect(calculateSdlt(300_000, none, d).tax).toBe(5_000)
  })
  it('first-time buyer relief and its cap', () => {
    const ftb = { ...none, firstTimeBuyer: true }
    expect(calculateSdlt(300_000, ftb, d).tax).toBe(0)
    expect(calculateSdlt(400_000, ftb, d).tax).toBe(5_000)
    expect(calculateSdlt(510_000, ftb, d).tax).toBe(15_500)
  })
  it('additional dwelling surcharge applies to every band', () => {
    expect(calculateSdlt(150_000, { ...none, additionalProperty: true }, d).tax).toBe(8_000)
    expect(calculateSdlt(35_000, { ...none, additionalProperty: true }, d).tax).toBe(0)
  })
  it('uses the table in force at completion', () => {
    expect(calculateSdlt(150_000, none, '2025-03-01').tax).toBe(0)
  })
})

describe('lease analysis and premium', () => {
  it('bands lease lengths', () => {
    expect(analyseLease(undefined).band).toBe('unknown')
    expect(analyseLease(55).mortgageability).toBe('likely-difficult')
    expect(analyseLease(75).marriageValueApplies).toBe(true)
    expect(analyseLease(85).marriageValueApplies).toBe(false)
  })
  it('ages a stated lease length', () => {
    expect(currentLeaseYears(70, '2024-10-14', new Date('2026-10-14'))).toBeCloseTo(68, 0)
  })
  it('produces a plausible premium for a 70-year lease', () => {
    const p = premiumFor({ years: 70, groundRent: 100, longLeaseValue: 250_000, freeholdUpliftPct: 1, relativity: 0.855, deferment: 0.05, capitalisation: 0.065 })
    expect(p.marriageValue).toBeGreaterThan(0)
    expect(p.premium).toBeGreaterThan(18_000)
    expect(p.premium).toBeLessThan(26_000)
  })
  it('has no marriage value above 80 years and falls as the term lengthens', () => {
    const run = (years: number) => estimatePremium({ years, groundRent: 100, longLeaseValue: { low: 240_000, base: 250_000, high: 260_000 } })
    expect(run(85).base!.marriageValue).toBe(0)
    expect(run(60).base!.premium).toBeGreaterThan(run(70).base!.premium)
    const r = run(65)
    expect(r.low!.premium).toBeLessThan(r.base!.premium)
    expect(r.high!.premium).toBeGreaterThan(r.base!.premium)
  })
  it('refuses to estimate below 30 years', () => {
    expect(relativityBand(25)).toBeNull()
    expect(estimatePremium({ years: 25, groundRent: 0, longLeaseValue: { low: 1, base: 1, high: 1 } }).ok).toBe(false)
  })
})

const comp = (price: number, i: number, extra: Partial<Comparable> = {}): Comparable => ({
  id: String(i),
  address: `Flat ${i}`,
  postcode: 'GU21 6XR',
  price,
  date: '2026-03-01',
  propertyType: 'flat-maisonette',
  estate: 'leasehold',
  newBuild: false,
  sameStreet: false,
  samePostcode: false,
  distanceM: 500,
  leaseStatus: 'unknown',
  source: 'hmlr-ppd',
  ...extra,
})

describe('comparables (basic)', () => {
  it('scores closer, recent flats higher', () => {
    const near = scoreComparable({ ...comp(1, 1), distanceM: 100 }, {}, new Date('2026-10-14'))
    const far = scoreComparable({ ...comp(1, 2), distanceM: 1900, date: '2021-01-01' }, {}, new Date('2026-10-14'))
    expect(near.score).toBeGreaterThan(far.score)
    expect(near.reasons.length).toBeGreaterThan(2)
  })
  it('needs three sales for a range', () => {
    expect(valueComparables([comp(200_000, 1), comp(210_000, 2)], {}).ok).toBe(false)
    const r = valueComparables([comp(200_000, 1), comp(210_000, 2), comp(220_000, 3), comp(230_000, 4)], {})
    expect(r.ok).toBe(true)
    expect(r.low).toBeLessThanOrEqual(r.base)
    expect(r.base).toBeLessThanOrEqual(r.high)
    expect(r.leaseBasis).toBe('unverified')
  })
})

function sampleDeal(): Deal {
  const d = newDeal('local', 'Flat 3, Test Court, Woking')
  d.postcode = 'GU21 6XR'
  d.facts.askingPrice = agentFact(100_000)
  d.facts.leaseYears = agentFact(65)
  d.facts.groundRent = agentFact(150)
  d.facts.serviceCharge = agentFact(1500)
  d.flags.retirement = 'no'
  d.flags.sharedOwnership = 'no'
  d.comps = { fetchedAt: '', centrePostcode: 'GU21 6XR', radiusM: 1000, yearsBack: 5, items: [comp(170_000, 1), comp(180_000, 2), comp(185_000, 3), comp(190_000, 4)] }
  return d
}

describe('financial model and risk engine', () => {
  const settings = defaultSettings()
  it('a £100k cash purchase is unaffordable on £20k', () => {
    const a = analyseDeal(sampleDeal(), settings)
    expect(a.base.cashRequired).toBeGreaterThan(100_000)
    expect(a.base.affordable).toBe(false)
    expect(a.risk.status).toBe('unaffordable')
  })
  it('weak automated valuation keeps status off worth-investigating even when profitable', () => {
    const d = sampleDeal()
    d.facts.askingPrice = agentFact(60_000)
    const a = analyseDeal(d, { ...settings, capital: 500_000 })
    expect(a.risk.flags.some((f) => f.id === 'valuation-weak')).toBe(true)
    expect(a.risk.status).not.toBe('worth-investigating')
  })
  it('a professional valuation is never replaced by the automated one', () => {
    const d = sampleDeal()
    d.inputs.resaleValue = { value: 150_000, provenance: 'quote', source: 'RICS valuer' }
    const a = analyseDeal(d, settings)
    expect(a.base.inputs.resaleValue).toMatchObject({ value: 150_000, provenance: 'quote' })
    expect(a.split.longLeaseSource).toBe('professional')
    expect(a.risk.flags.some((f) => f.id === 'valuation-weak')).toBe(false)
  })
  it('worst-case resale never exceeds the bottom of the evidence range', () => {
    const a = analyseDeal(sampleDeal(), settings)
    expect(a.worst.exit.resale).toBeLessThanOrEqual(a.values!.low)
    expect(a.best.exit.resale).toBeLessThanOrEqual(a.values!.high)
  })
  it('worst case costs more than base, best less', () => {
    const a = analyseDeal(sampleDeal(), { ...settings, capital: 500_000 })
    expect(a.worst.cashRequired).toBeGreaterThan(a.base.cashRequired)
    expect(a.best.exit.netProfit).toBeGreaterThan(a.worst.exit.netProfit)
    expect(a.premium?.ok).toBe(true)
    expect(a.base.lease.lines[0].provenance).toBe('calculated')
  })
  it('missing lease length means more information needed, never positive', () => {
    const d = sampleDeal()
    d.facts.leaseYears = { provenance: 'missing' }
    const a = analyseDeal(d, { ...settings, capital: 500_000 })
    expect(a.risk.status).toBe('more-info')
    expect(a.base.cashComplete).toBe(false)
    expect(a.base.affordable).toBeNull()
  })
  it('flags comparables far above the asking price', () => {
    const d = sampleDeal()
    d.comps!.items = [comp(300_000, 1), comp(310_000, 2), comp(320_000, 3)]
    expect(analyseDeal(d, settings).risk.flags.some((f) => f.id === 'comps-mismatch')).toBe(true)
    expect(analyseDeal(sampleDeal(), settings).risk.flags.some((f) => f.id === 'comps-mismatch')).toBe(false)
  })
  it('retirement restriction is high risk regardless of numbers', () => {
    const d = sampleDeal()
    d.flags.retirement = 'yes'
    expect(analyseDeal(d, { ...settings, capital: 500_000 }).risk.status).toBe('high-risk')
  })
  it('mortgage on a 65-year lease raises a critical finance flag', () => {
    const d = sampleDeal()
    d.financing = 'mortgage'
    const a = analyseDeal(d, settings)
    expect(a.risk.flags.find((f) => f.id === 'mortgage')?.severity).toBe('critical')
    expect(a.base.loan).toBe(75_000)
  })
  it('user overrides win over defaults and keep provenance', () => {
    const d = sampleDeal()
    d.inputs.conveyancing = { value: 2200, provenance: 'quote', source: 'Smith & Co' }
    const r = runModel(d, analyseDeal(d, settings).ctx)
    expect(r.inputs.conveyancing).toMatchObject({ value: 2200, provenance: 'quote' })
  })
})

describe('listings', () => {
  it('identifies portal listings', () => {
    expect(identifyListing('https://www.rightmove.co.uk/properties/123456789#/')).toMatchObject({ provider: 'rightmove', ref: '123456789' })
    expect(identifyListing('https://www.zoopla.co.uk/for-sale/details/67890/')).toMatchObject({ provider: 'zoopla', ref: '67890' })
    expect(identifyListing('not a url')).toBeNull()
  })
  it('parses pasted listing text', () => {
    const p = parseListingText('Guide price £95,000. 1 bedroom flat, GU21 5AB. Lease: 62 years remaining. Ground rent £250 pa. Service charge £1,800 per annum.')
    expect(p).toMatchObject({ price: 95_000, bedrooms: 1, postcode: 'GU21 5AB', leaseYears: 62, groundRent: 250, serviceCharge: 1800 })
    expect(p.auction).toBeUndefined()
  })
  it('respects negations and detects real restrictions', () => {
    const neg = parseListingText('Not a retirement property. No shared ownership.')
    expect(neg.retirement).toBeUndefined()
    expect(neg.sharedOwnership).toBeUndefined()
    expect(parseListingText('Retirement apartment for the over 60s').retirement).toBe(true)
    expect(parseListingText('For sale by online auction').auction).toBe(true)
  })
  it('detects duplicates by listing ref and by address', () => {
    const d = sampleDeal()
    d.sources = [{ provider: 'rightmove', ref: '42', observedAt: '' }]
    expect(findDuplicate([d], { address: 'x', source: { provider: 'rightmove', ref: '42', observedAt: '' } })).toBe(d)
    expect(findDuplicate([d], { address: 'flat 3 test court woking', postcode: 'gu216xr' })).toBe(d)
    expect(findDuplicate([d], { address: 'Flat 4, Test Court, Woking' })).toBeUndefined()
  })
})

describe('letters', () => {
  it('populates property details and asks only for unknowns', () => {
    const d = sampleDeal()
    d.facts.groundRent = { provenance: 'missing' }
    const l = draftLetter('agent-lease', { deal: d, settings: defaultSettings() })
    expect(l.subject).toContain('Test Court')
    expect(l.body).toContain('£100,000')
    expect(l.body.toLowerCase()).toContain('ground rent')
    expect(l.body.toLowerCase()).not.toContain('age or occupancy')
  })
})
