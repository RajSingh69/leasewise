// Listing source registry. Rightmove and Zoopla do not offer open listing APIs, and their
// terms prohibit scraping, so Leasewise never fetches their pages. Sources are either
// user-driven (paste, CSV, portal search links) or licensed feeds connected later.

import type { SavedSearch } from '../domain/types'

export type ProviderStatus = 'available' | 'needs-credentials'

export interface ListingSourceInfo {
  id: string
  name: string
  status: ProviderStatus
  description: string
}

export const LISTING_SOURCES: ListingSourceInfo[] = [
  { id: 'paste', name: 'Paste a listing', status: 'available', description: 'Link + description; Leasewise extracts price, lease, charges and restrictions.' },
  { id: 'email', name: 'Portal & auction alert emails', status: 'available', description: 'Paste alerts you receive from Rightmove, Zoopla, OnTheMarket or auction houses; every listing link is picked out and de-duplicated.' },
  { id: 'csv', name: 'CSV export', status: 'available', description: 'Exports from agents, auction houses or data services you are licensed to use. Re-import to detect price changes.' },
  { id: 'portal', name: 'Portal searches', status: 'available', description: 'Pre-filled searches on the portals’ own websites.' },
  { id: 'licensed', name: 'Licensed listing feed (server)', status: 'needs-credentials', description: 'A paid, licensed provider can run your saved searches daily on the server and drop results in your inbox. Not connected.' },
]

const q = (s: string) => encodeURIComponent(s)

export function portalSearchLinks(s: Pick<SavedSearch, 'location' | 'maxPrice' | 'minPrice' | 'maxLeaseYears' | 'includeAuctions' | 'minBedrooms'>) {
  const lease = s.maxLeaseYears ? `"short lease" OR "${s.maxLeaseYears} years"` : '"short lease"'
  const price = s.maxPrice ? ` under £${s.maxPrice.toLocaleString('en-GB')}` : ''
  const beds = s.minBedrooms ? ` ${s.minBedrooms} bedroom` : ''
  const terms = `${beds} flat ${lease} ${s.location}${price}`.trim()
  const links = [
    { label: 'Rightmove', url: `https://www.google.com/search?q=${q(`site:rightmove.co.uk/properties ${terms}`)}` },
    { label: 'Zoopla', url: `https://www.google.com/search?q=${q(`site:zoopla.co.uk/for-sale/details ${terms}`)}` },
    { label: 'OnTheMarket', url: `https://www.google.com/search?q=${q(`site:onthemarket.com/details ${terms}`)}` },
  ]
  if (s.includeAuctions)
    links.push(
      { label: 'Auctions (web)', url: `https://www.google.com/search?q=${q(`property auction lot flat leasehold ${s.location} short lease`)}` },
      { label: 'Allsop', url: 'https://www.allsop.co.uk/' },
      { label: 'Auction House', url: 'https://www.auctionhouse.co.uk/' },
      { label: 'Clive Emson', url: 'https://www.cliveemson.co.uk/' },
      { label: 'iamsold', url: 'https://www.iamsold.co.uk/' },
    )
  return links
}

export interface CsvListing {
  address: string
  postcode?: string
  price?: number
  leaseYears?: number
  groundRent?: number
  serviceCharge?: number
  bedrooms?: number
  url?: string
  listingDate?: string
  auction?: boolean
}

export const CSV_COLUMNS = 'address, postcode, price, lease_years, ground_rent, service_charge, bedrooms, url, listing_date, auction'

export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function parseCsv(text: string): { rows: CsvListing[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const errors: string[] = []
  if (!lines.length) return { rows: [], errors: ['The file is empty.'] }
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, '_'))
  const col = (name: string) => head.indexOf(name)
  if (col('address') < 0) return { rows: [], errors: ['The first row must contain an "address" column.'] }
  const num = (s?: string) => {
    const n = Number((s ?? '').replace(/[£,\s]/g, ''))
    return s && Number.isFinite(n) ? n : undefined
  }
  const rows: CsvListing[] = []
  lines.slice(1).forEach((l, i) => {
    const c = splitCsvLine(l)
    const get = (n: string) => (col(n) >= 0 ? c[col(n)] : undefined)
    const address = get('address')
    if (!address) return errors.push(`Row ${i + 2}: no address, skipped.`)
    rows.push({
      address,
      postcode: get('postcode') || undefined,
      price: num(get('price')),
      leaseYears: num(get('lease_years')),
      groundRent: num(get('ground_rent')),
      serviceCharge: num(get('service_charge')),
      bedrooms: num(get('bedrooms')),
      url: get('url') || undefined,
      listingDate: get('listing_date') || undefined,
      auction: /^(y|yes|true|1)$/i.test(get('auction') ?? ''),
    })
  })
  return { rows, errors }
}
