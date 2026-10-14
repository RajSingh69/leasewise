import { describe, expect, it } from 'vitest'
import { matchAddress, tokens, unitId } from './addressMatch'
import { hpiFactor, outlierIndexes, scoreComparable, smoothIndex, usableArea, valueComparables } from './comparables'
import type { Comparable, HpiInfo } from './types'

const TODAY = new Date('2026-10-14')
let n = 0
const comp = (price: number, extra: Partial<Comparable> = {}): Comparable => ({
  id: String(++n),
  address: `Flat ${n}`,
  postcode: 'GU22 7AA',
  price,
  date: '2026-03-01',
  propertyType: 'flat-maisonette',
  estate: 'leasehold',
  newBuild: false,
  sameStreet: false,
  samePostcode: false,
  distanceM: 300,
  leaseStatus: 'unknown',
  source: 'hmlr-ppd',
  ...extra,
})
const withArea = (price: number, area: number, extra: Partial<Comparable> = {}) =>
  comp(price, { epc: { certificateNumber: 'x', address: 'x', floorAreaSqm: area, confidence: 'high', reasons: [] }, ...extra })

describe('address matching (EPC ↔ Land Registry)', () => {
  const cands = [
    { id: 'A', lines: ['Flat 4, Albion House', 'Chertsey Road'], postcode: 'GU21 5AB' },
    { id: 'B', lines: ['Flat 14, Albion House', 'Chertsey Road'], postcode: 'GU21 5AB' },
    { id: 'C', lines: ['Flat 4, Station Court', 'Chertsey Road'], postcode: 'GU21 5AB' },
  ]
  it('normalises tokens and unit ids', () => {
    expect(tokens('Apartment 3a, Example Rd')).toEqual(['FLAT', '3A', 'EXAMPLE', 'RD'])
    expect(unitId('FLAT 42')).toBe('42')
    expect(unitId('Albion House')).toBeUndefined()
  })
  it('matches on postcode + flat + building + street with high confidence', () => {
    const m = matchAddress({ saon: 'FLAT 4', paon: 'ALBION HOUSE', street: 'CHERTSEY ROAD', postcode: 'GU21 5AB' }, cands)
    expect(m.confidence).toBe('high')
    expect(m.candidate?.id).toBe('A')
  })
  it('never matches on postcode alone', () => {
    expect(matchAddress({ saon: 'FLAT 9', paon: 'ALBION HOUSE', street: 'CHERTSEY ROAD', postcode: 'GU21 5AB' }, cands).confidence).toBe('none')
    expect(matchAddress({ saon: 'FLAT 4', paon: 'ALBION HOUSE', postcode: 'GU99 9ZZ' }, cands).confidence).toBe('none')
  })
  it('flags ambiguity when the building is missing from the sale record', () => {
    expect(matchAddress({ saon: 'FLAT 4', street: 'CHERTSEY ROAD', postcode: 'GU21 5AB' }, cands).confidence).toBe('ambiguous')
  })
  it('is low confidence when the street differs', () => {
    expect(matchAddress({ saon: 'FLAT 4', paon: 'ALBION HOUSE', street: 'OTHER ROAD', postcode: 'GU21 5AB' }, cands).confidence).toBe('low')
  })
  it('only uses high-confidence, approved or user-verified areas', () => {
    const low = comp(1, { epc: { certificateNumber: 'x', address: 'x', floorAreaSqm: 50, confidence: 'low', reasons: [] } })
    expect(usableArea(low)).toBeUndefined()
    expect(usableArea({ ...low, epcApproved: true })).toBe(50)
    expect(usableArea(comp(1, { userAreaSqm: 61 }))).toBe(61)
  })
})

describe('UK HPI adjustment', () => {
  const hpi: HpiInfo = { region: 'Woking', series: 'flat-maisonette', latestMonth: '2026-07', index: { '2024-01': 80, '2025-01': 88, '2026-07': 96 } }
  it('restates to the latest month', () => {
    expect(hpiFactor('2024-01-15', hpi)).toBeCloseTo(1.2)
    expect(hpiFactor('2024-06-15', hpi)).toBeCloseTo(1.2) // latest month at or before the sale
    expect(hpiFactor('2026-09-01', hpi)).toBeCloseTo(1) // after the latest index: no growth added
    expect(hpiFactor('2020-01-01', hpi)).toBeUndefined()
  })
  it('smooths with a trailing 3-month average', () => {
    expect(smoothIndex({ '2026-01': 90, '2026-02': 93, '2026-03': 96 })['2026-03']).toBeCloseTo(93)
  })
  it('applies the adjustment once and keeps the original price', () => {
    const v = valueComparables([comp(200_000, { date: '2024-01-10' }), comp(200_000, { date: '2024-01-20' }), comp(200_000, { date: '2024-01-25' })], {}, { hpi, today: TODAY })
    expect(v.items[0].adjusted).toBe(240_000)
    expect(v.items[0].c.price).toBe(200_000)
    expect(v.base).toBe(240_000)
    expect(v.hpiApplied).toBe(true)
  })
})

describe('outliers and selection', () => {
  it('detects outliers with 5+ values only', () => {
    expect([...outlierIndexes([200, 205, 210, 215, 220, 90])]).toEqual([5])
    expect(outlierIndexes([200, 90, 210]).size).toBe(0)
  })
  it('excludes outliers, new builds, houses and short leases with reasons', () => {
    const v = valueComparables(
      [comp(200_000), comp(205_000), comp(210_000), comp(215_000), comp(220_000), comp(80_000), comp(400_000, { newBuild: true }), comp(300_000, { propertyType: 'terraced' }), comp(150_000, { leaseStatus: 'short' })],
      {},
      { today: TODAY },
    )
    const reason = (p: number) => v.items.find((e) => e.c.price === p)!.statusReason
    expect(reason(80_000)).toMatch(/Outlier/)
    expect(reason(400_000)).toMatch(/New build/)
    expect(reason(300_000)).toMatch(/Not a flat/)
    expect(reason(150_000)).toMatch(/Short lease/)
    expect(v.selectedCount).toBe(5)
  })
  it('prefers strong close matches over more sales', () => {
    const near = [1, 2, 3, 4].map(() => comp(200_000, { distanceM: 100 }))
    const far = [1, 2, 3, 4, 5, 6, 7, 8].map(() => comp(300_000, { distanceM: 1900, date: '2021-06-01' }))
    const v = valueComparables([...near, ...far], {}, { today: TODAY })
    expect(v.items.filter((e) => e.status === 'selected').every((e) => e.c.price === 200_000)).toBe(true)
  })
  it('falls back to provisional, then insufficient', () => {
    const weak = [1, 2, 3].map(() => comp(200_000, { distanceM: 900, date: '2023-06-01' }))
    expect(valueComparables(weak, {}, { today: TODAY }).confidence).toBe('provisional')
    expect(valueComparables([comp(1, { distanceM: 1999, date: '2020-01-01' })], {}, { today: TODAY }).confidence).toBe('insufficient')
  })
  it('honours user include and exclude', () => {
    const v = valueComparables([comp(200_000), comp(205_000), comp(210_000), comp(999_000, { userChoice: 'exclude' }), comp(300_000, { newBuild: true, userChoice: 'include' })], {}, { today: TODAY })
    expect(v.items.find((e) => e.c.price === 999_000)!.status).toBe('excluded')
    expect(v.items.find((e) => e.c.price === 300_000)!.status).toBe('selected')
  })
})

describe('valuation method and confidence', () => {
  it('uses price per m² when this flat and 3+ sales have verified areas', () => {
    const v = valueComparables([withArea(200_000, 50), withArea(210_000, 50), withArea(220_000, 55), withArea(190_000, 45)], { floorAreaSqm: 40 }, { today: TODAY })
    expect(v.method).toBe('price-per-sqm')
    expect(v.base).toBeGreaterThan(150_000)
    expect(v.base).toBeLessThan(180_000) // ~£4,000/m² × 40 m²
  })
  it('caps confidence while lease lengths are unverified', () => {
    const many = [1, 2, 3, 4, 5, 6].map((i) => withArea(200_000 + i * 1000, 50))
    expect(valueComparables(many, { floorAreaSqm: 50 }, { today: TODAY }).confidence).toBe('low')
    const verified = many.map((c) => ({ ...c, leaseStatus: 'long' as const }))
    const v = valueComparables(verified, { floorAreaSqm: 50 }, { today: TODAY })
    expect(v.leaseBasis).toBe('verified-long')
    expect(v.confidence).toBe('good')
  })
  it('enforces a minimum range width for small samples', () => {
    const v = valueComparables([comp(200_000), comp(200_000), comp(200_000)], {}, { today: TODAY })
    expect(v.low).toBeLessThanOrEqual(185_000)
    expect(v.high).toBeGreaterThanOrEqual(215_000)
  })
  it('explains the calculation in plain steps', () => {
    const v = valueComparables([comp(200_000), comp(205_000), comp(210_000)], {}, { today: TODAY })
    expect(v.explanation.length).toBeGreaterThanOrEqual(4)
    expect(v.explanation.join(' ')).toMatch(/Asking prices are never used/)
  })
  it('scores size similarity only with verified areas', () => {
    expect(scoreComparable(withArea(1, 50), { floorAreaSqm: 50 }, TODAY).score).toBeGreaterThan(scoreComparable(comp(1), { floorAreaSqm: 50 }, TODAY).score)
  })
})
