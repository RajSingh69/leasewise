// Listing identification, assisted import from pasted text, and de-duplication.
// Nothing here fetches portal pages: users paste URLs and text they can see themselves.

import type { Deal, ListingProviderId, ListingSource } from './types'

export function identifyListing(rawUrl: string): { provider: ListingProviderId; ref?: string; url: string } | null {
  let u: URL
  try {
    u = new URL(rawUrl.trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname
  const m = (re: RegExp) => path.match(re)?.[1]
  if (host.endsWith('rightmove.co.uk')) return { provider: 'rightmove', ref: m(/properties\/(\d+)/), url: u.origin + path }
  if (host.endsWith('zoopla.co.uk')) return { provider: 'zoopla', ref: m(/details\/(\d+)/), url: u.origin + path }
  if (host.endsWith('onthemarket.com')) return { provider: 'onthemarket', ref: m(/details\/(\d+)/), url: u.origin + path }
  if (/auction|allsop|iamsold|cliveemson|pugh|sdlauctions|savills/.test(host)) return { provider: 'auction', url: u.href }
  return { provider: 'agent', url: u.href }
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

export function normalisePostcode(pc?: string): string | undefined {
  const m = pc?.toUpperCase().match(POSTCODE)
  return m ? `${m[1]} ${m[2]}` : undefined
}

export interface ParsedListing {
  price?: number
  leaseYears?: number
  groundRent?: number
  serviceCharge?: number
  bedrooms?: number
  postcode?: string
  floorAreaSqm?: number
  retirement?: boolean
  sharedOwnership?: boolean
  auction?: boolean
  priceReduced?: boolean
  found: string[]
}

const money = (s: string) => Number(s.replace(/[£,\s]/g, ''))

/** True if the pattern appears at least once without a negation just before it ("not a", "no", "non-"). */
function affirmed(text: string, re: RegExp): boolean {
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 15), m.index).toLowerCase()
    if (!/\b(not an?|no|non-?|is not an?|isn't an?)\s*$/.test(before)) return true
  }
  return false
}

/** Pull key facts from listing text the user has copied. Everything found is an agent claim. */
export function parseListingText(text: string): ParsedListing {
  const t = text.replace(/ /g, ' ')
  const out: ParsedListing = { found: [] }
  const price = t.match(/(?:guide price|offers? (?:in excess of|over|in the region of)|asking price|price)?\s*£\s?([\d,]{4,})(?![\d,])(?!\s*(?:pa|p\.a\.|per annum|a year|per year|pcm))/i)
  if (price) {
    out.price = money(price[1])
    out.found.push('price')
  }
  const lease = t.match(/(\d{2,3}(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:remaining|left|unexpired|on the lease)/i) ?? t.match(/(?:lease|remaining|unexpired)[^.\n]{0,30}?(\d{2,3})\s*(?:years?|yrs?)/i)
  if (lease) {
    out.leaseYears = Number(lease[1])
    out.found.push('lease length')
  }
  const gr = t.match(/ground rent[^£\n]{0,25}£\s?([\d,]+(?:\.\d+)?)/i)
  if (gr) {
    out.groundRent = money(gr[1])
    out.found.push('ground rent')
  }
  const sc = t.match(/service charge[^£\n]{0,25}£\s?([\d,]+(?:\.\d+)?)\s*(pcm|per month|a month|monthly)?/i)
  if (sc) {
    const v = money(sc[1])
    out.serviceCharge = sc[2] ? v * 12 : v
    out.found.push('service charge')
  }
  const beds = t.match(/(\d+)\s*(?:bed(?:room)?s?)\b/i)
  if (beds) {
    out.bedrooms = Number(beds[1])
    out.found.push('bedrooms')
  } else if (/\bstudio\b/i.test(t)) {
    out.bedrooms = 0
    out.found.push('bedrooms (studio)')
  }
  const sqm = t.match(/([\d,.]+)\s*(?:sq\.?\s?m|m²|square metres)/i)
  const sqft = t.match(/([\d,.]+)\s*(?:sq\.?\s?ft|ft²|square feet)/i)
  if (sqm) out.floorAreaSqm = Number(sqm[1].replace(/,/g, ''))
  else if (sqft) out.floorAreaSqm = Math.round(Number(sqft[1].replace(/,/g, '')) * 0.092903)
  if (out.floorAreaSqm) out.found.push('floor area')
  const pc = normalisePostcode(t)
  if (pc) {
    out.postcode = pc
    out.found.push('postcode')
  }
  if (affirmed(t, /retirement|over\s?(55|60|65)s?|age restrict|sheltered/gi)) {
    out.retirement = true
    out.found.push('retirement wording')
  }
  if (affirmed(t, /shared ownership|\d{2}% share/gi)) {
    out.sharedOwnership = true
    out.found.push('shared ownership wording')
  }
  if (affirmed(t, /\bauction\b/gi)) {
    out.auction = true
    out.found.push('auction wording')
  }
  if (/reduced|price change/i.test(t)) {
    out.priceReduced = true
    out.found.push('price reduction')
  }
  return out
}

export function normaliseAddress(a: string): string {
  return a
    .toLowerCase()
    .replace(/\b(flat|apartment|apt|unit)\b/g, 'flat')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Find an existing deal for the same listing or the same address. */
export function findDuplicate<T extends Pick<Deal, 'address' | 'postcode' | 'sources'>>(deals: T[], cand: { address: string; postcode?: string; source?: ListingSource }): T | undefined {
  const s = cand.source
  if (s?.ref) {
    const hit = deals.find((d) => d.sources.some((x) => x.provider === s.provider && x.ref === s.ref))
    if (hit) return hit
  }
  if (s?.url) {
    const hit = deals.find((d) => d.sources.some((x) => x.url && x.url === s.url))
    if (hit) return hit
  }
  const na = normaliseAddress(cand.address)
  const pc = normalisePostcode(cand.postcode)
  return deals.find((d) => normaliseAddress(d.address) === na && (!pc || !d.postcode || normalisePostcode(d.postcode) === pc))
}
