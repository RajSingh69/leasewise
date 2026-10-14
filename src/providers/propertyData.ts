// Live listings from PropertyData (propertydata.co.uk) — a paid API whose terms permit using
// its data inside your own software (Terms §12–13). Its "sourced properties" endpoint returns
// currently listed properties seen on Rightmove, Zoopla and OnTheMarket that are on one of its
// sourcing lists (short lease, reduced, auction, …). Rules we follow: the API key stays in this
// browser only, listing photos are never shown, and results are cached for at most 24 hours
// (the terms allow up to 60 days).

import { cached } from '../data/cache'
import type { ListingRecord } from '../domain/discovery'
import type { ListingProviderId } from '../domain/types'
import { providerFetch } from './http'

const API = 'https://api.propertydata.co.uk/sourced-properties'
const KEY_STORAGE = 'leasewise-propertydata-key'
export const PROPERTYDATA_SIGNUP = 'https://propertydata.co.uk/api/pricing'

export const LIVE_LISTS: { id: string; label: string }[] = [
  { id: 'short-lease-properties', label: 'Short lease' },
  { id: 'reduced-properties', label: 'Price reduced' },
  { id: 'auction-properties', label: 'Auction' },
  { id: 'cash-buyers-only-properties', label: 'Cash buyers only' },
  { id: 'back-on-market', label: 'Back on market' },
  { id: 'unmodernised-properties', label: 'Unmodernised' },
  { id: 'slow-to-sell-properties', label: 'Slow to sell' },
  { id: 'repossessed-properties', label: 'Repossessed' },
]

export const PROPERTY_TYPES = ['Flat', 'Terraced house', 'Semi-detached house', 'Detached house'] as const

export function getPropertyDataKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}
export function setPropertyDataKey(k: string) {
  try {
    if (k.trim()) localStorage.setItem(KEY_STORAGE, k.trim())
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage unavailable */
  }
}

export interface PdProperty {
  id: string
  address?: string
  precise_address?: string
  postcode?: string
  type?: string
  type_standardised?: string
  bedrooms?: number
  price?: number
  sqf?: number
  days_on_market?: number
  days_since_price_change?: number
  sstc?: number
  lat?: string
  lng?: string
  distance_to?: string
  price_history?: { date: string; price: number }[]
  url?: string
  lists?: string[]
  years_remaining?: number
  reduced_by?: number
}

export interface LiveListing {
  record: ListingRecord
  type: string
  active: 'for-sale' | 'under-offer'
  distanceMiles?: number
  daysOnMarket?: number
  lists: string[]
  priceHistory: { date: string; price: number }[]
}

export interface LiveSearch {
  location: string
  radiusMiles: number
  minPrice?: number
  maxPrice?: number
  types: string[] // empty = all
  maxLeaseYears?: number
  lists: string[]
  includeUnderOffer: boolean
}

export interface LiveResult {
  listings: LiveListing[]
  fetchedAt: string
  creditsUsed: number
  returned: number
  filteredOut: number
  centre: string
}

function portalFromUrl(url?: string): ListingProviderId {
  if (!url) return 'other'
  if (/rightmove/i.test(url)) return 'rightmove'
  if (/zoopla/i.test(url)) return 'zoopla'
  if (/onthemarket/i.test(url)) return 'onthemarket'
  return 'other'
}

/** Pure mapping from a PropertyData property to Leasewise's listing record (no images). */
export function mapPdProperty(p: PdProperty, fetchedAt: string, listNames: Record<string, string>): LiveListing {
  const listed = p.days_on_market != null ? new Date(new Date(fetchedAt).getTime() - p.days_on_market * 86400_000).toISOString().slice(0, 10) : undefined
  const lists = (p.lists ?? []).map((l) => listNames[l] ?? l)
  const shortList = (p.lists ?? []).includes('short-lease-properties')
  return {
    record: {
      provider: portalFromUrl(p.url),
      channel: 'PropertyData live listings',
      ref: p.id,
      url: p.url,
      observedAt: fetchedAt,
      address: p.precise_address || p.address || `Listing ${p.id}`,
      postcode: p.postcode,
      price: p.price,
      bedrooms: p.bedrooms,
      floorAreaSqm: p.sqf ? Math.round(p.sqf * 0.092903) : undefined,
      listingDate: listed,
      leaseYears: p.years_remaining,
      auction: (p.lists ?? []).includes('auction-properties'),
      priceReducedHint: (p.lists ?? []).includes('reduced-properties') || (p.price_history?.length ?? 0) > 1,
      text: shortList ? 'Short lease (PropertyData short-lease list)' : undefined,
    },
    type: p.type_standardised || p.type || 'Unknown',
    active: p.sstc ? 'under-offer' : 'for-sale',
    distanceMiles: p.distance_to ? Number(p.distance_to) : undefined,
    daysOnMarket: p.days_on_market,
    lists,
    priceHistory: p.price_history ?? [],
  }
}

/** Place name or postcode → "lat,lng" via postcodes.io (free). */
async function resolveLocation(q: string): Promise<{ param: string; label: string }> {
  const t = q.trim()
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(t)) return { param: `postcode=${encodeURIComponent(t.toUpperCase())}`, label: t.toUpperCase() }
  const res = await providerFetch('postcodes.io', `https://api.postcodes.io/places?q=${encodeURIComponent(t)}&limit=1`, {}, 15_000)
  const j = await res.json()
  const p = j.result?.[0]
  if (!p) throw new Error(`Couldn't find "${t}". Try a town name or a full postcode.`)
  return { param: `location=${p.latitude},${p.longitude}`, label: `${p.name_1}${p.county_unitary ? `, ${p.county_unitary}` : ''}` }
}

const PAGE = 100 // 10 credits per page

export async function searchLiveListings(s: LiveSearch, maxPages = 2): Promise<LiveResult> {
  const key = getPropertyDataKey()
  if (!key) throw new Error('No PropertyData API key set. Add one in Settings to search live listings.')
  if (!s.lists.length) throw new Error('Choose at least one listing type to search.')
  const loc = await resolveLocation(s.location)
  const radius = Math.min(100, Math.max(1, Math.round(s.radiusMiles)))
  const base = new URLSearchParams({ list: s.lists.slice(0, 5).join(','), radius: String(radius), results: String(PAGE) })
  if (s.types.length) base.set('standardised_type', s.types.join(','))
  if (!s.includeUnderOffer) base.set('exclude_sstc', '1')
  const listNames = Object.fromEntries(LIVE_LISTS.map((l) => [l.id, l.label]))

  const raw = await cached(`pd:${loc.param}:${base}`, 24, async () => {
    const out: PdProperty[] = []
    let credits = 0
    for (let page = 1; page <= maxPages; page++) {
      const url = `${API}?key=${encodeURIComponent(key)}&${loc.param}&${base}&page=${page}`
      const res = await providerFetch('PropertyData', url, {}, 45_000)
      const j = await res.json().catch(() => null)
      if (!j || j.status !== 'success') throw new Error(`PropertyData: ${j?.message ?? `HTTP ${res.status}`}`)
      credits += Number(j.api_calls_cost ?? 0)
      out.push(...((j.properties ?? []) as PdProperty[]))
      if ((j.properties ?? []).length < PAGE) break
    }
    return { props: out, credits, fetchedAt: new Date().toISOString() }
  })

  const seen = new Set<string>()
  const all = raw.props.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).map((p) => mapPdProperty(p, raw.fetchedAt, listNames))
  // Price and lease filters are applied here (the API filters by list, area and type only).
  const listings = all.filter((l) => {
    const pr = l.record.price
    if (s.minPrice && pr != null && pr < s.minPrice) return false
    if (s.maxPrice && pr != null && pr > s.maxPrice) return false
    if (s.maxLeaseYears && (l.record.leaseYears == null || l.record.leaseYears > s.maxLeaseYears)) return false
    return true
  })
  listings.sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
  return { listings, fetchedAt: raw.fetchedAt, creditsUsed: raw.credits, returned: all.length, filteredOut: all.length - listings.length, centre: loc.label }
}
