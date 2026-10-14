// UK House Price Index (HM Land Registry / ONS) via the public SPARQL endpoint. No key needed.
// Contains HM Land Registry data © Crown copyright and database right. Open Government Licence v3.0.

import { cached } from '../data/cache'
import { smoothIndex } from '../domain/comparables'
import type { HpiInfo } from '../domain/types'

const ENDPOINT = 'https://landregistry.data.gov.uk/landregistry/query'

export const regionSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function querySeries(slug: string, since: string): Promise<{ flat: Record<string, number>; all: Record<string, number> }> {
  const query = `
PREFIX ukhpi: <http://landregistry.data.gov.uk/def/ukhpi/>
SELECT ?month ?flat ?all WHERE {
  ?r ukhpi:refRegion <http://landregistry.data.gov.uk/id/region/${slug}> ; ukhpi:refMonth ?month .
  OPTIONAL { ?r ukhpi:housePriceIndexFlatMaisonette ?flat }
  OPTIONAL { ?r ukhpi:housePriceIndex ?all }
  FILTER (STR(?month) >= "${since}")
} ORDER BY ?month`
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }),
  })
  if (!res.ok) throw new Error(`UK HPI query failed (${res.status})`)
  const rows: Record<string, { value: string } | undefined>[] = (await res.json()).results?.bindings ?? []
  const flat: Record<string, number> = {}
  const all: Record<string, number> = {}
  for (const r of rows) {
    const m = r.month?.value
    if (!m) continue
    if (r.flat) flat[m] = Number(r.flat.value)
    if (r.all) all[m] = Number(r.all.value)
  }
  return { flat, all }
}

/**
 * Flat/maisonette index for the local authority, falling back to all-property, then to the
 * South East and England series. Cached for a week (the index is published monthly).
 */
export async function fetchHpi(district: string, sinceMonth: string): Promise<HpiInfo> {
  const tries = [district, 'South East', 'England']
  for (const name of tries) {
    const slug = regionSlug(name)
    const s = await cached(`hpi:${slug}:${sinceMonth}`, 24 * 7, () => querySeries(slug, sinceMonth))
    const useFlat = Object.keys(s.flat).length >= 12
    const raw = useFlat ? s.flat : s.all
    const months = Object.keys(raw).sort()
    if (months.length >= 12) {
      return { region: name, series: useFlat ? 'flat-maisonette' : 'all-property', latestMonth: months[months.length - 1], index: smoothIndex(raw) }
    }
  }
  throw new Error('No UK HPI series available for this area.')
}
