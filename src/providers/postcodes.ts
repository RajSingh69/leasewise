// postcodes.io — free, open UK postcode data (Ordnance Survey / ONS). No key required.
import { providerFetch } from './http'
const BASE = 'https://api.postcodes.io'

export interface PostcodeInfo {
  postcode: string
  latitude: number
  longitude: number
  district: string
  ward: string
}

interface ApiPostcode {
  postcode: string
  latitude: number
  longitude: number
  admin_district: string
  admin_ward: string
  distance?: number
}

const toInfo = (r: ApiPostcode): PostcodeInfo => ({ postcode: r.postcode, latitude: r.latitude, longitude: r.longitude, district: r.admin_district, ward: r.admin_ward })

export async function lookupPostcode(pc: string): Promise<PostcodeInfo | null> {
  const res = await providerFetch('postcodes.io', `${BASE}/postcodes/${encodeURIComponent(pc.trim())}`, {}, 15_000)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Postcode lookup failed (${res.status})`)
  const j = await res.json()
  return j.result ? toInfo(j.result) : null
}

/** Nearby postcodes. postcodes.io caps radius at 2,000 m and results at 100. */
export async function nearbyPostcodes(lat: number, lon: number, radiusM: number): Promise<(PostcodeInfo & { distance: number })[]> {
  const r = Math.min(2000, Math.max(100, radiusM))
  const res = await providerFetch('postcodes.io', `${BASE}/postcodes?lat=${lat}&lon=${lon}&radius=${r}&limit=100`, {}, 15_000)
  if (!res.ok) throw new Error(`Nearby postcode search failed (${res.status})`)
  const j = await res.json()
  return ((j.result ?? []) as ApiPostcode[]).map((x) => ({ ...toInfo(x), distance: x.distance ?? 0 }))
}

export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371e3
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
