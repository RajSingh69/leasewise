import { describe, expect, it } from 'vitest'
import { coverRadius, haversine, type NearbyPostcode } from '../providers/coverage'
import { leaseStatusFromYears, parseLeaseTerm, parseUkDate, yearsRemaining } from './leaseTerm'
import { leaseColumns, leaseForSale, toLeaseRow, type LeaseRow } from './registeredLeases'
import { dealFromRecord, ingest, parseAlertEmail, shortLeaseSignal, type ListingRecord } from './discovery'
import { buildGlance } from './glance'
import { analyseDeal } from './analysis'
import { agentFact, defaultSettings, newDeal } from './factories'
import type { SavedSearch } from './types'

describe('adaptive postcode coverage', () => {
  // Synthetic grid of postcodes every 50 m around a centre; the fake API caps at 100 results.
  const centre = { latitude: 51.32, longitude: -0.56 }
  const grid: NearbyPostcode[] = []
  for (let x = -1000; x <= 1000; x += 50)
    for (let y = -1000; y <= 1000; y += 50)
      grid.push({ postcode: `P${x}_${y}`, latitude: centre.latitude + y / 111_320, longitude: centre.longitude + x / (111_320 * Math.cos((centre.latitude * Math.PI) / 180)) })
  let calls = 0
  const api = async (lat: number, lon: number, r: number) => {
    calls++
    return grid
      .map((p) => ({ p, d: haversine({ latitude: lat, longitude: lon }, p) }))
      .filter((x) => x.d <= r)
      .sort((a, b) => a.d - b.d)
      .slice(0, 100)
      .map((x) => x.p)
  }
  it('covers the whole radius despite the 100-result cap', async () => {
    calls = 0
    const c = await coverRadius(centre, 600, api, 60)
    const expected = grid.filter((p) => haversine(centre, p) <= 600).length
    expect(c.complete).toBe(true)
    expect(c.postcodes.length).toBe(expected) // ~450 postcodes, far beyond one capped call
    expect(c.postcodes.every((p) => p.distance <= 600)).toBe(true)
    expect(calls).toBe(c.requests)
  })
  it('respects the request budget and reports what is reliably covered', async () => {
    const c = await coverRadius(centre, 900, api, 4)
    expect(c.requests).toBe(4)
    expect(c.complete).toBe(false)
    expect(c.reliableRadiusM).toBeLessThan(900)
  })
})

describe('lease term parsing', () => {
  it('reads UK dates', () => {
    expect(parseUkDate('24 June 1985')).toBe('1985-06-24')
    expect(parseUkDate('1st Jan 1990')).toBe('1990-01-01')
    expect(parseUkDate('24/06/1985')).toBe('1985-06-24')
    expect(parseUkDate('31.2.1990')).toBeNull()
  })
  it('reads common term wordings', () => {
    expect(parseLeaseTerm('99 years from 24 June 1985')).toMatchObject({ start: '1985-06-24', end: '2084-06-24', years: 99 })
    expect(parseLeaseTerm('125 years (less 3 days) from 1.1.1990')).toMatchObject({ end: '2115-01-01' })
    expect(parseLeaseTerm('From and including 25 March 1980 to and including 24 March 2079')).toMatchObject({ start: '1980-03-25', end: '2079-03-24', basis: 'date-range' })
    expect(parseLeaseTerm('999 years from the date of the lease', '12 May 2001')).toMatchObject({ start: '2001-05-12', years: 999 })
    expect(parseLeaseTerm('189 years commencing on 25 December 1987')).toMatchObject({ end: '2176-12-25' })
  })
  it('refuses to guess', () => {
    expect(parseLeaseTerm('As therein mentioned')).toBeNull()
    expect(parseLeaseTerm('99 years from the date of the lease')).toBeNull() // no lease date
    expect(parseLeaseTerm('')).toBeNull()
  })
  it('computes years left and status', () => {
    const p = parseLeaseTerm('99 years from 24 June 1985')!
    expect(yearsRemaining(p, '2025-06-24')).toBeCloseTo(59, 0)
    expect(leaseStatusFromYears(59)).toBe('short')
    expect(leaseStatusFromYears(85)).toBe('unknown')
    expect(leaseStatusFromYears(120)).toBe('long')
  })
})

describe('Registered Leases matching', () => {
  const header = ['Unique Identifier', 'Tenure', 'Register Property Description', 'County', 'Region', 'Associated Property Description ID', 'Associated Property Description', 'OS UPRN', 'Price Paid', 'Reg Order', 'Date of Lease', 'Term', 'Alienation Clause Indicator']
  const cols = leaseColumns(header)!
  const row = (uid: string, addr: string, date: string, term: string, order = '1') => toLeaseRow([uid, 'Leasehold', addr, 'SURREY', 'SOUTH EAST', '', addr, '', '', order, date, term, 'N'], cols, new Set(['GU21']))!
  it('keeps only wanted districts and leasehold rows', () => {
    expect(row('A', 'Flat 4, Albion House, Chertsey Road, Woking (GU21 5AB)', '24 June 1985', '99 years from 24 June 1985')).toMatchObject({ postcode: 'GU21 5AB' })
    expect(toLeaseRow(['B', 'Leasehold', 'Flat 1, X House, London (SE1 1AA)', '', '', '', 'Flat 1, X House (SE1 1AA)', '', '', '1', '', '99 years', ''], cols, new Set(['GU21']))).toBeNull()
  })
  const rows: LeaseRow[] = [
    row('A', 'Flat 4, Albion House, Chertsey Road, Woking (GU21 5AB)', '24 June 1985', '99 years from 24 June 1985'),
    // A later lease extension on the same title.
    row('A', 'Flat 4, Albion House, Chertsey Road, Woking (GU21 5AB)', '1 March 2024', '189 years from 24 June 1985', '2'),
    row('B', 'Flat 14, Albion House, Chertsey Road, Woking (GU21 5AB)', '1 May 2000', '125 years from 1 May 2000'),
  ]
  const sale = { saon: 'FLAT 4', paon: 'ALBION HOUSE', street: 'CHERTSEY ROAD', postcode: 'GU21 5AB' }
  it('uses the lease in force at the sale date, not a later extension', () => {
    const before = leaseForSale({ ...sale, date: '2020-01-01' }, rows)
    expect(before.confidence).toBe('high')
    expect(before.yearsAtSale).toBeCloseTo(64.5, 0)
    expect(before.status).toBe('short')
    const after = leaseForSale({ ...sale, date: '2025-01-01' }, rows)
    expect(after.status).toBe('long')
  })
  it('does not match a different flat in the same building', () => {
    expect(leaseForSale({ ...sale, saon: 'FLAT 9', date: '2020-01-01' }, rows).yearsAtSale).toBeUndefined()
  })
})

const rec = (o: Partial<ListingRecord>): ListingRecord => ({ provider: 'rightmove', channel: 'test', observedAt: '2026-10-01T00:00:00Z', address: 'Flat 2, Oak Court, Woking', ...o })
const search: SavedSearch = { id: 's1', ownerId: 'local', name: 'x', location: 'Woking', radiusMiles: 3, maxPrice: 150_000, maxLeaseYears: 80, propertyType: 'flat', includeAuctions: true, excludeRetirement: true, excludeSharedOwnership: true, createdAt: '' }

describe('discovery ingest', () => {
  it('flags short-lease signals from lease length and wording', () => {
    expect(shortLeaseSignal({ leaseYears: 62 }).level).toBe('likely')
    expect(shortLeaseSignal({ text: 'Cash buyers only' }).level).toBe('possible')
    expect(shortLeaseSignal({ text: 'Short lease — lease extension required' }).level).toBe('likely')
    expect(shortLeaseSignal({ leaseYears: 120, text: 'short lease' }).level).toBe('unlikely')
    expect(shortLeaseSignal({}).level).toBe('unknown')
  })
  it('creates new items, dedupes, and detects price drops', () => {
    const first = ingest({ ownerId: 'local', deals: [], discoveries: [], searches: [search], records: [rec({ ref: '1', price: 120_000, leaseYears: 65 })] })
    expect(first.newDiscoveries).toHaveLength(1)
    expect(first.newDiscoveries[0].searchIds).toEqual(['s1'])
    const again = ingest({ ownerId: 'local', deals: [], discoveries: first.newDiscoveries, searches: [], records: [rec({ ref: '1', price: 110_000, observedAt: '2026-10-08T00:00:00Z' })] })
    expect(again.newDiscoveries).toHaveLength(0)
    expect(again.events[0].kind).toBe('price-drop')
    expect(again.updatedDiscoveries[0].priceHistory.map((p) => p.price)).toEqual([120_000, 110_000])
  })
  it('resurfaces a dismissed listing when its price falls', () => {
    const d = ingest({ ownerId: 'local', deals: [], discoveries: [], searches: [], records: [rec({ ref: '9', price: 100_000 })] }).newDiscoveries[0]
    d.status = 'dismissed'
    const r = ingest({ ownerId: 'local', deals: [], discoveries: [d], searches: [], records: [rec({ ref: '9', price: 90_000 })] })
    expect(r.updatedDiscoveries[0].status).toBe('new')
    expect(r.events[0].kind).toBe('resurfaced')
  })
  it('updates a tracked deal instead of duplicating it, keeping price history', () => {
    const deal = dealFromRecord('local', rec({ ref: '5', price: 130_000 }))
    const r = ingest({ ownerId: 'local', deals: [deal], discoveries: [], searches: [], records: [rec({ provider: 'zoopla', ref: '77', url: 'https://www.zoopla.co.uk/for-sale/details/77', price: 125_000 })] })
    expect(r.newDiscoveries).toHaveLength(0) // same address, different portal
    expect(r.updatedDeals[0].facts.askingPrice.value).toBe(125_000)
    expect(r.updatedDeals[0].flags.priceReduced).toBe(true)
    expect(r.updatedDeals[0].sources).toHaveLength(2)
    expect(r.updatedDeals[0].priceHistory).toHaveLength(2)
  })
  it('extracts listings from a pasted alert email', () => {
    const email = `New properties matching your alert\n\n1 bedroom flat for sale\nFlat 3, Station Court, Woking GU21 5AB\n£95,000\nShort lease, cash buyers only\nhttps://www.rightmove.co.uk/properties/123456789\n\n2 bedroom flat\nFlat 8, Elm House, Woking\n£140,000 Reduced\nhttps://www.zoopla.co.uk/for-sale/details/555?utm=x\nhttps://www.rightmove.co.uk/properties/123456789`
    const r = parseAlertEmail(email, '2026-10-14T00:00:00Z')
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ provider: 'rightmove', ref: '123456789', price: 95_000, postcode: 'GU21 5AB', bedrooms: 1, address: 'Flat 3, Station Court, Woking GU21 5AB' })
    expect(shortLeaseSignal(r[0]).level).toBe('likely')
    expect(r[1]).toMatchObject({ provider: 'zoopla', ref: '555', price: 140_000, priceReducedHint: true })
  })
})

describe('at a glance', () => {
  it('separates known, estimated and missing, with affordability and a next step', () => {
    const d = newDeal('local', 'Flat 1, Test, Woking')
    d.facts.askingPrice = agentFact(100_000)
    d.facts.leaseYears = { value: 70, provenance: 'verified', source: 'Title register' }
    const g = buildGlance(d, analyseDeal(d, defaultSettings()))
    expect(g.known.some((k) => k.label === 'Lease remaining')).toBe(true)
    expect(g.estimated.some((k) => k.label === 'Asking price' && /agent/.test(k.detail))).toBe(true)
    expect(g.missing.some((k) => k.label === 'Service charge')).toBe(true)
    expect(g.affordable.answer).toBe('unknown') // premium unknown without comparables
    expect(g.next.title.length).toBeGreaterThan(3)
  })
})
