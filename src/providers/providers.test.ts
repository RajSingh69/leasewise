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

describe('provider errors are never silent', () => {
  it('names the provider on network failure and timeout', async () => {
    const { providerFetch } = await import('./http')
    const real = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    await expect(providerFetch('HM Land Registry', 'https://landregistry.data.gov.uk/x')).rejects.toThrow(/HM Land Registry could not be reached/)
    globalThis.fetch = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))))) as unknown as typeof fetch
    await expect(providerFetch('postcodes.io', 'https://api.postcodes.io/x', {}, 10)).rejects.toThrow(/did not respond/)
    globalThis.fetch = (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch
    await expect(providerFetch('UK House Price Index', 'https://x.test/')).rejects.toThrow(/having problems/)
    globalThis.fetch = real
  })
})

describe('PropertyData live listings mapping', () => {
  it('maps the documented response shape without images and with status, date and source', async () => {
    const { mapPdProperty } = await import('./propertyData')
    // Shape taken from PropertyData's published example response.
    const p = { id: 'R168299921', address: 'Stile Road, Headington Oxford, OX3', precise_address: '9, STILE ROAD, OXFORD, OXFORDSHIRE, OX3 8AG', postcode: 'OX3 8AG', type: 'Semi-detached', type_standardised: 'Semi-detached house', bedrooms: 3, price: 600000, sqf: 1290, days_on_market: 131, sstc: 0, distance_to: '0.37', price_history: [{ date: '2024-09-12', price: 625000 }, { date: '2025-01-08', price: 600000 }], url: 'https://propertydata.co.uk/outbound/rightmove/168299921', image_url: 'x', lists: ['short-lease-properties'], years_remaining: 64 }
    const l = mapPdProperty(p, '2026-10-14T12:00:00Z', { 'short-lease-properties': 'Short lease' })
    expect(l.record).toMatchObject({ provider: 'rightmove', ref: 'R168299921', price: 600000, postcode: 'OX3 8AG', leaseYears: 64, floorAreaSqm: 120, listingDate: '2026-06-05', priceReducedHint: true })
    expect(l.active).toBe('for-sale')
    expect(l.type).toBe('Semi-detached house')
    expect(l.lists).toEqual(['Short lease'])
    expect(JSON.stringify(l)).not.toContain('image')
  })
})
