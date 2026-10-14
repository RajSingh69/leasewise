// Full-radius postcode coverage within postcodes.io limits (2,000 m radius and 100 results
// per request). The search area is split into square tiles; a tile is queried with its
// circumscribed circle and only subdivided if it hits the 100-result cap. Tiles nearest the
// subject are resolved first, so a request budget always covers the closest area fully.

export interface GeoPoint {
  latitude: number
  longitude: number
}
export interface NearbyPostcode extends GeoPoint {
  postcode: string
}

export type NearbyQuery = (lat: number, lon: number, radiusM: number) => Promise<NearbyPostcode[]>

export interface Coverage {
  postcodes: (NearbyPostcode & { distance: number })[]
  requests: number
  complete: boolean
  /** Radius around the subject that is known to be fully covered. */
  reliableRadiusM: number
}

const CAP = 100
const MAX_QUERY_RADIUS = 2000

export function haversine(a: GeoPoint, b: GeoPoint) {
  const R = 6371e3
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

interface Tile {
  dx: number // metres east of centre
  dy: number // metres north of centre
  half: number // half side length, metres
}

/** Distance from the centre to the nearest point of a tile. */
const nearEdge = (t: Tile) => Math.hypot(Math.max(0, Math.abs(t.dx) - t.half), Math.max(0, Math.abs(t.dy) - t.half))

export async function coverRadius(centre: GeoPoint, radiusM: number, query: NearbyQuery, budget = 30): Promise<Coverage> {
  const toLatLon = (t: Tile) => ({
    latitude: centre.latitude + t.dy / 111_320,
    longitude: centre.longitude + t.dx / (111_320 * Math.cos((centre.latitude * Math.PI) / 180)),
  })
  const split = (t: Tile): Tile[] =>
    [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ dx: t.dx + (sx * t.half) / 2, dy: t.dy + (sy * t.half) / 2, half: t.half / 2 }))).filter((c) => nearEdge(c) <= radiusM)

  let queue: Tile[] = [{ dx: 0, dy: 0, half: radiusM }]
  // Tiles must fit inside one query circle.
  while (queue.some((t) => t.half * Math.SQRT2 > MAX_QUERY_RADIUS)) queue = queue.flatMap((t) => (t.half * Math.SQRT2 > MAX_QUERY_RADIUS ? split(t) : [t]))

  const found = new Map<string, NearbyPostcode & { distance: number }>()
  let requests = 0
  const unresolved: Tile[] = []
  while (queue.length) {
    queue.sort((a, b) => nearEdge(a) - nearEdge(b))
    const t = queue.shift()!
    if (requests >= budget) {
      unresolved.push(t)
      continue
    }
    const p = toLatLon(t)
    const res = await query(p.latitude, p.longitude, Math.ceil(t.half * Math.SQRT2))
    requests++
    for (const r of res) {
      const distance = haversine(centre, r)
      if (distance <= radiusM && !found.has(r.postcode)) found.set(r.postcode, { ...r, distance })
    }
    if (res.length >= CAP) {
      if (t.half > 60) queue.push(...split(t))
      else unresolved.push(t) // extremely dense: accept the cap
    }
  }
  const reliableRadiusM = unresolved.length ? Math.max(0, Math.min(...unresolved.map(nearEdge))) : radiusM
  return {
    postcodes: [...found.values()].sort((a, b) => a.distance - b.distance),
    requests,
    complete: unresolved.length === 0,
    reliableRadiusM: Math.min(radiusM, reliableRadiusM),
  }
}
