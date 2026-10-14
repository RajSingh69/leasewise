// Comparable-sales evidence: HM Land Registry Price Paid Data (SPARQL), with proximity from
// postcodes.io, UK HPI time adjustment and optional EPC floor areas. Each source fails
// independently and reports its status; only Price Paid is essential.
// Contains HM Land Registry data © Crown copyright and database right. Open Government Licence v3.0.

import type { Comparable, CompsResult, HpiInfo, SourceStatus } from '../domain/types'
import { enrichWithEpc, epcAvailable } from './epc'
import { fetchHpi } from './hpi'
import { lookupPostcode, nearbyPostcodes } from './postcodes'
import { coverRadius } from './coverage'
import { enrichWithLeases } from './leases'
import { cached, pool } from '../data/cache'
import { scoreComparable } from '../domain/comparables'

import { providerFetch } from './http'
const ENDPOINT = 'https://landregistry.data.gov.uk/landregistry/query'
export const PPD_ATTRIBUTION = 'Contains HM Land Registry data © Crown copyright and database right. Open Government Licence v3.0.'

type Binding = Record<string, { value: string } | undefined>

async function queryPpd(postcodes: string[], since: string): Promise<Binding[]> {
  const query = `
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?tx ?paon ?saon ?street ?postcode ?amount ?date ?ptype ?estate ?newbuild WHERE {
  VALUES ?postcode { ${postcodes.map((p) => JSON.stringify(p)).join(' ')} }
  ?addr lrcommon:postcode ?postcode .
  ?tx lrppi:propertyAddress ?addr ; lrppi:pricePaid ?amount ; lrppi:transactionDate ?date ;
      lrppi:propertyType ?ptype ; lrppi:estateType ?estate .
  ?tx lrppi:propertyType lrcommon:flat-maisonette .
  OPTIONAL { ?addr lrcommon:paon ?paon } OPTIONAL { ?addr lrcommon:saon ?saon } OPTIONAL { ?addr lrcommon:street ?street }
  OPTIONAL { ?tx lrppi:newBuild ?newbuild }
  OPTIONAL { ?tx lrppi:transactionCategory ?cat }
  FILTER (?date >= "${since}"^^xsd:date)
  FILTER (!BOUND(?cat) || ?cat = lrppi:standardPricePaidTransaction)
} ORDER BY DESC(?date) LIMIT 300`
  const res = await providerFetch('HM Land Registry', ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }),
  }, 45_000)
  if (!res.ok) throw new Error(`HM Land Registry rejected the search (HTTP ${res.status}). Try again later.`)
  return (await res.json()).results?.bindings ?? []
}

export function parsePpd(bindings: Binding[], ctx: { dist: Map<string, number>; centrePostcode: string; street?: string }): Comparable[] {
  const street = ctx.street?.trim().toUpperCase()
  const byId = new Map<string, Comparable>()
  for (const b of bindings) {
    const v = (k: string) => b[k]?.value ?? ''
    const pc = v('postcode')
    // Record URIs look like .../ppi/transaction/{transactionId}/current
    const id = v('tx').match(/transaction\/([^/]+)/)?.[1]
    if (!id || byId.has(id)) continue
    byId.set(id, {
      id,
      address: [v('saon'), v('paon'), v('street')].filter(Boolean).join(', '),
      saon: v('saon') || undefined,
      paon: v('paon') || undefined,
      street: v('street') || undefined,
      postcode: pc,
      price: Number(v('amount')),
      date: v('date'),
      propertyType: v('ptype').split('/').pop() ?? 'unknown',
      estate: v('estate').endsWith('leasehold') ? 'leasehold' : v('estate').endsWith('freehold') ? 'freehold' : 'unknown',
      newBuild: v('newbuild') === 'true',
      distanceM: ctx.dist.get(pc),
      sameStreet: !!street && v('street') === street,
      samePostcode: pc === ctx.centrePostcode,
      leaseStatus: 'unknown',
      source: 'hmlr-ppd',
      sourceUrl: `https://landregistry.data.gov.uk/data/ppi/transaction/${id}/current`,
    })
  }
  return [...byId.values()]
}

const MAX_STORED = 150
const PPD_CHUNK = 250

export async function fetchComparables(opts: { postcode: string; street?: string; radiusM: number; yearsBack: number }, onStage?: (s: string) => void): Promise<CompsResult> {
  const sources: SourceStatus[] = []
  onStage?.('Looking up the postcode…')
  const centre = await cached(`pc:${opts.postcode.toUpperCase().replace(/\s/g, '')}`, 24 * 30, () => lookupPostcode(opts.postcode))
  if (!centre) throw new Error(`Postcode ${opts.postcode} not recognised.`)
  onStage?.(`Finding every postcode within ${opts.radiusM} m…`)
  const cover = await coverRadius(centre, opts.radiusM, (lat, lon, r) =>
    cached(`near:${lat.toFixed(5)},${lon.toFixed(5)}:${r}`, 24 * 30, () => nearbyPostcodes(lat, lon, r)),
  )
  sources.push({ id: 'postcodes', ok: true, message: `postcodes.io: ${cover.postcodes.length} postcodes within ${opts.radiusM} m (${cover.requests} lookups${cover.complete ? '' : `; full coverage to ${Math.round(cover.reliableRadiusM)} m`})` })
  const dist = new Map(cover.postcodes.map((p) => [p.postcode, p.distance]))
  if (!dist.has(centre.postcode)) dist.set(centre.postcode, 0)

  const since = new Date()
  since.setFullYear(since.getFullYear() - opts.yearsBack)
  const sinceIso = since.toISOString().slice(0, 10)
  // Nearest postcodes first, in chunks, so very large areas stay within query limits.
  const pcs = [...dist.entries()].sort((a, b) => a[1] - b[1]).map(([p]) => p)
  const chunks: string[][] = []
  for (let i = 0; i < pcs.length; i += PPD_CHUNK) chunks.push(pcs.slice(i, i + PPD_CHUNK))
  onStage?.(`Searching HM Land Registry sold prices for ${dist.size} postcodes…`)
  const bindings = (await pool(chunks, 2, (c) => cached(`ppd:${c[0]}:${c.length}:${c[c.length - 1]}:${sinceIso}`, 24, () => queryPpd(c, sinceIso)))).flat()
  let items = parsePpd(bindings, { dist, centrePostcode: centre.postcode, street: opts.street })
  const total = items.length
  // Keep the strongest candidates (quality, not quantity); the valuation engine re-scores them.
  if (items.length > MAX_STORED) items = items.map((c) => ({ c, s: scoreComparable(c, {}).score })).sort((a, b) => b.s - a.s).slice(0, MAX_STORED).map((x) => x.c)
  sources.push({ id: 'hmlr-ppd', ok: true, message: `HM Land Registry: ${total} completed flat sales${total > MAX_STORED ? `, kept the ${MAX_STORED} best-matched` : ''}` })

  let hpi: HpiInfo | undefined
  try {
    onStage?.('Getting the UK House Price Index…')
    hpi = await fetchHpi(centre.district, sinceIso.slice(0, 7))
    sources.push({ id: 'ukhpi', ok: true, message: `UK HPI: ${hpi.region} ${hpi.series === 'flat-maisonette' ? 'flats' : 'all property'}, to ${hpi.latestMonth}` })
  } catch (e) {
    sources.push({ id: 'ukhpi', ok: false, message: `UK HPI unavailable (${e instanceof Error ? e.message : e}); prices not time-adjusted.` })
  }

  onStage?.('Checking floor areas and lease data…')
  if (await epcAvailable()) {
    try {
      const r = await enrichWithEpc(items)
      items = r.items
      sources.push({ id: 'epc', ok: true, message: r.message })
    } catch (e) {
      sources.push({ id: 'epc', ok: false, message: `EPC register unavailable (${e instanceof Error ? e.message : e}).` })
    }
  } else sources.push({ id: 'epc', ok: false, message: 'EPC floor areas not configured (needs a free EPC API token — see README).' })

  try {
    const r = await enrichWithLeases(items)
    items = r.items
    sources.push({ id: 'leases', ok: r.loaded, message: r.message })
  } catch (e) {
    sources.push({ id: 'leases', ok: false, message: `Registered Leases lookup failed (${e instanceof Error ? e.message : e}).` })
  }

  const note = cover.complete
    ? `Searched every postcode within ${opts.radiusM} m.`
    : `Dense area: fully covered to ${Math.round(cover.reliableRadiusM)} m, partially beyond (lookup budget reached).`
  return { fetchedAt: new Date().toISOString(), centrePostcode: centre.postcode, radiusM: opts.radiusM, yearsBack: opts.yearsBack, items, note, sources, hpi }
}
