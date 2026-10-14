import { describe, expect, it } from 'vitest'
import { valueComparables } from '../domain/comparables'
import { fetchHpi, regionSlug } from './hpi'
import { parsePpd } from './landRegistry'

const lit = (value: string) => ({ value })

describe('Land Registry parsing', () => {
  const bindings = [
    { tx: lit('http://landregistry.data.gov.uk/data/ppi/transaction/AAA-1/current'), saon: lit('FLAT 4'), paon: lit('ALBION HOUSE'), street: lit('CHERTSEY ROAD'), postcode: lit('GU21 5AB'), amount: lit('185000'), date: lit('2025-05-01'), ptype: lit('http://landregistry.data.gov.uk/def/common/flat-maisonette'), estate: lit('http://landregistry.data.gov.uk/def/common/leasehold'), newbuild: lit('false') },
    // Same transaction returned twice must be de-duplicated.
    { tx: lit('http://landregistry.data.gov.uk/data/ppi/transaction/AAA-1/current'), saon: lit('FLAT 4'), paon: lit('ALBION HOUSE'), street: lit('CHERTSEY ROAD'), postcode: lit('GU21 5AB'), amount: lit('185000'), date: lit('2025-05-01'), ptype: lit('x/flat-maisonette'), estate: lit('x/leasehold') },
  ]
  it('keeps address parts, unique ids, unknown lease status and a source link', () => {
    const items = parsePpd(bindings, { dist: new Map([['GU21 5AB', 120]]), centrePostcode: 'GU21 6XR', street: 'Chertsey Road' })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'AAA-1', saon: 'FLAT 4', paon: 'ALBION HOUSE', price: 185_000, distanceM: 120, sameStreet: true, leaseStatus: 'unknown', estate: 'leasehold' })
    expect(items[0].sourceUrl).toContain('AAA-1')
  })
  it('slugs region names for the HPI', () => {
    expect(regionSlug('Surrey Heath')).toBe('surrey-heath')
    expect(regionSlug('Woking')).toBe('woking')
  })
})

// Live checks against the public APIs. Run with: LIVE=1 npx vitest run src/providers
const LIVE = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.LIVE
describe.skipIf(!LIVE)('live public data', () => {
  it('fetches the Woking flat HPI series', async () => {
    const h = await fetchHpi('Woking', '2023-01')
    expect(h.series).toBe('flat-maisonette')
    expect(Object.keys(h.index).length).toBeGreaterThan(24)
  }, 60_000)
  it('values real Woking sales end to end (no EPC)', async () => {
    const { fetchComparables } = await import('./landRegistry')
    const r = await fetchComparables({ postcode: 'GU22 7AA', radiusM: 800, yearsBack: 5 })
    expect(r.items.length).toBeGreaterThan(3)
    const v = valueComparables(r.items, {}, { hpi: r.hpi, radiusM: r.radiusM, yearsBack: r.yearsBack })
    expect(v.leaseBasis).toBe('unverified') // nothing verified by a user yet
    console.log(r.sources?.map((s) => s.message).join('\n'), '\n', v.confidence, v.low, v.base, v.high, v.selectedCount)
  }, 90_000)
})
