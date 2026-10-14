// Discovery engine. Every source (pasted listing, portal alert email, CSV export, auction
// catalogue, licensed feed run on the server) produces ListingRecords; ingest() turns them
// into inbox items or updates to tracked deals, detecting new listings, price changes and
// duplicates, with provenance and timestamps on everything.

import { agentFact, newDeal, uid } from './factories'
import { findDuplicate, identifyListing, normalisePostcode, parseListingText } from './listing'
import type { Deal, ListingProviderId, ListingSource, SavedSearch } from './types'

export interface ListingRecord {
  provider: ListingProviderId
  /** Where the record came from, e.g. "Rightmove alert email", "CSV: export.csv". */
  channel: string
  ref?: string
  url?: string
  observedAt: string
  address: string
  postcode?: string
  price?: number
  leaseYears?: number
  groundRent?: number
  serviceCharge?: number
  bedrooms?: number
  floorAreaSqm?: number
  listingDate?: string
  auction?: boolean
  auctionDate?: string
  retirement?: boolean
  sharedOwnership?: boolean
  priceReducedHint?: boolean
  text?: string
}

export interface PricePoint {
  date: string
  price: number
  source: string
}

export type SignalLevel = 'likely' | 'possible' | 'unlikely' | 'unknown'

export interface ShortLeaseSignal {
  level: SignalLevel
  reasons: string[]
}

export interface Discovery {
  id: string
  ownerId: string
  address: string
  postcode?: string
  sources: ListingSource[]
  record: ListingRecord
  firstSeen: string
  lastSeen: string
  status: 'new' | 'tracked' | 'dismissed'
  dealId?: string
  priceHistory: PricePoint[]
  signal: ShortLeaseSignal
  searchIds: string[]
}

export type ChangeKind = 'new' | 'price-drop' | 'price-rise' | 'seen-again' | 'resurfaced'

export interface ChangeEvent {
  kind: ChangeKind
  message: string
  dealId?: string
  discoveryId?: string
}

const SHORT_WORDS: [RegExp, SignalLevel, string][] = [
  [/short lease/i, 'likely', 'Described as a short lease.'],
  [/lease extension (?:required|needed|recommended)|requires? (?:a )?lease extension/i, 'likely', 'Says a lease extension is needed.'],
  [/unmortgageable|not mortgageable/i, 'likely', 'Described as unmortgageable (often a short lease).'],
  [/cash buyers? only/i, 'possible', '"Cash buyers only" — often a short lease or other lending problem.'],
  [/lease extension|extend(?:ed)? (?:the )?lease|section 42|s\.?42/i, 'possible', 'Mentions a lease extension.'],
]

export function shortLeaseSignal(r: Pick<ListingRecord, 'leaseYears' | 'text'>): ShortLeaseSignal {
  const reasons: string[] = []
  let level: SignalLevel = 'unknown'
  const rank: Record<SignalLevel, number> = { unknown: 0, unlikely: 1, possible: 2, likely: 3 }
  const raise = (l: SignalLevel, why: string) => {
    if (rank[l] > rank[level]) level = l
    reasons.push(why)
  }
  if (r.leaseYears != null) {
    if (r.leaseYears < 80) raise('likely', `${r.leaseYears} years left (below 80).`)
    else if (r.leaseYears < 90) raise('possible', `${r.leaseYears} years left — will fall below 80 soon.`)
    else {
      level = 'unlikely'
      reasons.push(`${r.leaseYears} years left — not a short lease.`)
    }
  }
  if (r.text && level !== 'unlikely') for (const [re, l, why] of SHORT_WORDS) if (re.test(r.text)) raise(l, why)
  if (!reasons.length) reasons.push('Lease length not stated.')
  return { level, reasons: [...new Set(reasons)] }
}

export function matchesSearch(d: { price?: number; leaseYears?: number; bedrooms?: number; auction?: boolean; retirement?: boolean; sharedOwnership?: boolean; serviceCharge?: number }, s: SavedSearch): boolean {
  if (s.maxPrice && d.price && d.price > s.maxPrice) return false
  if (s.minPrice && d.price && d.price < s.minPrice) return false
  if (s.maxLeaseYears && d.leaseYears && d.leaseYears > s.maxLeaseYears) return false
  if (s.minBedrooms && d.bedrooms != null && d.bedrooms < s.minBedrooms) return false
  if (!s.includeAuctions && d.auction) return false
  if (s.excludeRetirement && d.retirement) return false
  if (s.excludeSharedOwnership && d.sharedOwnership) return false
  if (s.maxServiceCharge && (d.serviceCharge ?? 0) > s.maxServiceCharge) return false
  return true
}

export const dealMatchesSearch = (d: Deal, s: SavedSearch) =>
  matchesSearch(
    { price: d.facts.askingPrice.value, leaseYears: d.facts.leaseYears.value, bedrooms: d.facts.bedrooms.value, auction: d.flags.auction, retirement: d.flags.retirement === 'yes', sharedOwnership: d.flags.sharedOwnership === 'yes', serviceCharge: d.facts.serviceCharge.value },
    s,
  )

export function sourceOf(r: ListingRecord): ListingSource {
  return { provider: r.provider, url: r.url, ref: r.ref, observedAt: r.observedAt }
}

/** Create a deal from a record. Everything from a listing is an agent claim. */
export function dealFromRecord(ownerId: string, r: ListingRecord): Deal {
  const d = newDeal(ownerId, r.address)
  const src = r.channel
  d.postcode = normalisePostcode(r.postcode)
  d.sources.push(sourceOf(r))
  d.facts.askingPrice = agentFact(r.price, src)
  d.facts.leaseYears = agentFact(r.leaseYears, src)
  if (r.leaseYears != null) d.leaseYearsAsAt = r.observedAt.slice(0, 10)
  d.facts.groundRent = agentFact(r.groundRent, src)
  d.facts.serviceCharge = agentFact(r.serviceCharge, src)
  d.facts.bedrooms = agentFact(r.bedrooms, src)
  d.facts.floorAreaSqm = agentFact(r.floorAreaSqm, src)
  d.facts.listingDate = agentFact(r.listingDate, src)
  d.flags.auction = !!r.auction || r.provider === 'auction'
  d.flags.auctionDate = r.auctionDate
  d.flags.priceReduced = !!r.priceReducedHint
  if (r.retirement) d.flags.retirement = 'yes'
  if (r.sharedOwnership) d.flags.sharedOwnership = 'yes'
  d.priceHistory = r.price ? [{ date: r.observedAt, price: r.price, source: src }] : []
  d.notes = r.text ? `Listing text (${src}, ${r.observedAt.slice(0, 10)}):\n${r.text.slice(0, 4000)}` : ''
  d.lastChecked = r.observedAt
  return d
}

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')

export interface IngestResult {
  newDiscoveries: Discovery[]
  updatedDiscoveries: Discovery[]
  updatedDeals: Deal[]
  events: ChangeEvent[]
}

/** Pure: compute what changes when records arrive. The caller persists the result. */
export function ingest(input: { ownerId: string; deals: Deal[]; discoveries: Discovery[]; searches: SavedSearch[]; records: ListingRecord[] }): IngestResult {
  const deals = new Map(input.deals.map((d) => [d.id, structuredClone(d)]))
  const discs = new Map(input.discoveries.map((d) => [d.id, structuredClone(d)]))
  const touchedDeals = new Set<string>()
  const touchedDiscs = new Set<string>()
  const created = new Set<string>()
  const events: ChangeEvent[] = []

  for (const r of input.records) {
    if (!r.address.trim()) continue
    const source = sourceOf(r)
    const cand = { address: r.address, postcode: r.postcode, source }
    const deal = findDuplicate([...deals.values()], cand)
    if (deal) {
      touchedDeals.add(deal.id)
      if (!deal.sources.some((s) => (s.ref && s.ref === source.ref && s.provider === source.provider) || (s.url && s.url === source.url))) deal.sources.push(source)
      deal.lastChecked = r.observedAt
      const prev = deal.facts.askingPrice.value
      if (r.price && prev && r.price !== prev) {
        deal.priceHistory = [...(deal.priceHistory ?? []), { date: r.observedAt, price: r.price, source: r.channel }]
        deal.facts.askingPrice = agentFact(r.price, r.channel)
        if (r.price < prev) deal.flags.priceReduced = true
        events.push({ kind: r.price < prev ? 'price-drop' : 'price-rise', dealId: deal.id, message: `${deal.address}: asking price ${r.price < prev ? 'reduced' : 'raised'} from ${gbp(prev)} to ${gbp(r.price)}.` })
      } else if (r.price && !prev) {
        deal.facts.askingPrice = agentFact(r.price, r.channel)
        deal.priceHistory = [...(deal.priceHistory ?? []), { date: r.observedAt, price: r.price, source: r.channel }]
      } else events.push({ kind: 'seen-again', dealId: deal.id, message: `${deal.address}: already tracked, no price change.` })
      continue
    }
    const disc = findDuplicate([...discs.values()], cand)
    if (disc) {
      touchedDiscs.add(disc.id)
      disc.lastSeen = r.observedAt
      if (!disc.sources.some((s) => (s.ref && s.ref === source.ref) || (s.url && s.url === source.url))) disc.sources.push(source)
      const prev = disc.priceHistory[disc.priceHistory.length - 1]?.price
      if (r.price && prev && r.price !== prev) {
        disc.priceHistory.push({ date: r.observedAt, price: r.price, source: r.channel })
        disc.record = { ...disc.record, ...r }
        const drop = r.price < prev
        if (drop && disc.status === 'dismissed') {
          disc.status = 'new'
          events.push({ kind: 'resurfaced', discoveryId: disc.id, message: `${disc.address}: you dismissed it, but the price fell from ${gbp(prev)} to ${gbp(r.price)}.` })
        } else events.push({ kind: drop ? 'price-drop' : 'price-rise', discoveryId: disc.id, message: `${disc.address}: price ${drop ? 'reduced' : 'raised'} from ${gbp(prev)} to ${gbp(r.price)}.` })
      } else events.push({ kind: 'seen-again', discoveryId: disc.id, message: `${disc.address}: seen again.` })
      disc.signal = shortLeaseSignal(disc.record)
      continue
    }
    const id = uid()
    const d: Discovery = {
      id,
      ownerId: input.ownerId,
      address: r.address.trim(),
      postcode: normalisePostcode(r.postcode),
      sources: [source],
      record: r,
      firstSeen: r.observedAt,
      lastSeen: r.observedAt,
      status: 'new',
      priceHistory: r.price ? [{ date: r.observedAt, price: r.price, source: r.channel }] : [],
      signal: shortLeaseSignal(r),
      searchIds: input.searches.filter((s) => matchesSearch(r, s)).map((s) => s.id),
    }
    discs.set(id, d)
    created.add(id)
    events.push({ kind: 'new', discoveryId: id, message: `New: ${d.address}${r.price ? ` at ${gbp(r.price)}` : ''}.` })
  }
  return {
    newDiscoveries: [...created].map((id) => discs.get(id)!),
    updatedDiscoveries: [...touchedDiscs].filter((id) => !created.has(id)).map((id) => discs.get(id)!),
    updatedDeals: [...touchedDeals].map((id) => deals.get(id)!),
    events,
  }
}

// --- Parsers for user-supplied sources ---------------------------------------------------

const LISTING_URL = /https?:\/\/(?:www\.)?(?:rightmove\.co\.uk\/properties\/\d+|zoopla\.co\.uk\/for-sale\/details\/\d+|onthemarket\.com\/details\/\d+|(?:allsop\.co\.uk|auctionhouse\.co\.uk|cliveemson\.co\.uk|iamsold\.co\.uk|sdlauctions\.co\.uk|pugh-auctions\.com|savills\.co\.uk\/auctions)\/[^\s"'<>)\]]+)[^\s"'<>)\]]*/gi

/**
 * Extract listings from a portal or auction alert email the user received and pasted in
 * (their own email; no portal is contacted). Text near each link is parsed for facts.
 */
export function parseAlertEmail(text: string, observedAt: string, channel = 'Alert email'): ListingRecord[] {
  const t = text.replace(/ /g, ' ')
  const hits = [...t.matchAll(LISTING_URL)]
  const seen = new Set<string>()
  const out: ListingRecord[] = []
  hits.forEach((m, i) => {
    const id = identifyListing(m[0])
    if (!id) return
    const key = id.ref ? `${id.provider}:${id.ref}` : id.url
    if (seen.has(key)) return
    seen.add(key)
    // Context: text between the previous link and the next one.
    const start = i > 0 ? hits[i - 1].index! + hits[i - 1][0].length : Math.max(0, m.index! - 600)
    const end = i < hits.length - 1 ? hits[i + 1].index! : Math.min(t.length, m.index! + m[0].length + 400)
    const ctx = (t.slice(start, m.index) + '\n' + t.slice(m.index! + m[0].length, end)).trim()
    const p = parseListingText(ctx)
    const lines = ctx.split(/\n/).map((l) => l.trim()).filter(Boolean)
    const address =
      lines.find((l) => /,/.test(l) && /[a-z]/i.test(l) && !/£|http|bedroom|unsubscribe|view|alert/i.test(l) && l.length >= 8 && l.length <= 120) ??
      `${id.provider === 'auction' ? 'Auction lot' : id.provider} listing ${id.ref ?? ''}`.trim()
    out.push({
      provider: id.provider,
      channel,
      ref: id.ref,
      url: id.url,
      observedAt,
      address,
      postcode: p.postcode,
      price: p.price,
      leaseYears: p.leaseYears,
      groundRent: p.groundRent,
      serviceCharge: p.serviceCharge,
      bedrooms: p.bedrooms,
      auction: p.auction || id.provider === 'auction',
      retirement: p.retirement,
      sharedOwnership: p.sharedOwnership,
      priceReducedHint: p.priceReduced,
      text: ctx.slice(0, 1500),
    })
  })
  return out
}
