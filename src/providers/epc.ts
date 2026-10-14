// EPC register (MHCLG "Get energy performance of buildings data"). The API needs a free
// account token and does not allow browser (CORS) requests, so calls go through a
// server-side proxy: the Vite dev server locally, the epcProxy Cloud Function in production.
// The token never reaches the browser.

import { cached, pool } from '../data/cache'
import { matchAddress, type CandidateAddress } from '../domain/addressMatch'
import type { Comparable, EpcMatch } from '../domain/types'

import { providerFetch } from './http'
const BASE = (import.meta.env.VITE_EPC_PROXY_URL as string | undefined) || '/api/epc'
export const EPC_CERT_URL = (n: string) => `https://find-energy-certificate.service.gov.uk/energy-certificate/${n}`

// Request budget per comparables run (the register allows 6,000 requests / 5 min; we stay far below).
const MAX_POSTCODES = 25
const MAX_CERTIFICATES = 60

async function authHeaders(): Promise<Record<string, string>> {
  const fb = await import('../data/firebase')
  if (!fb.firebaseConfigured) return {}
  const t = await fb.idToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function get<T>(path: string): Promise<T | null> {
  const res = await providerFetch('EPC register', `${BASE}${path}`, { headers: { Accept: 'application/json', ...(await authHeaders()) } }, 20_000)
  // On static hosting (GitHub Pages) there is no proxy: the path returns an HTML 404 page.
  if (res.status === 404 || !(res.headers.get('content-type') ?? '').includes('json')) return null
  if (!res.ok) throw new Error(`EPC register error (${res.status})`)
  return res.json()
}

let status: Promise<boolean> | null = null
/** True when a proxy with a token is available. */
export function epcAvailable(): Promise<boolean> {
  status ??= get<{ configured: boolean }>('/status')
    .then((s) => !!s?.configured)
    .catch(() => false)
  return status
}

interface SearchRow {
  certificateNumber: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  addressLine4?: string
  postcode: string
  registrationDate?: string
  currentEnergyEfficiencyBand?: string
}

export interface EpcCandidate extends CandidateAddress {
  registrationDate?: string
  band?: string
}

export async function searchPostcode(postcode: string): Promise<EpcCandidate[]> {
  const pc = postcode.toUpperCase().replace(/\s+/g, ' ').trim()
  return cached(`epc:pc:${pc}`, 24 * 7, async () => {
    const r = await get<{ data: SearchRow[] }>(`/domestic/search?postcode=${encodeURIComponent(pc)}&page_size=500`)
    const rows = r?.data ?? []
    // Keep the latest certificate per address.
    const byAddr = new Map<string, EpcCandidate>()
    for (const x of rows) {
      const lines = [x.addressLine1, x.addressLine2, x.addressLine3, x.addressLine4].filter(Boolean) as string[]
      const key = lines.join(',').toUpperCase()
      const prev = byAddr.get(key)
      if (!prev || (x.registrationDate ?? '') > (prev.registrationDate ?? ''))
        byAddr.set(key, { id: x.certificateNumber, lines, postcode: x.postcode, registrationDate: x.registrationDate, band: x.currentEnergyEfficiencyBand })
    }
    return [...byAddr.values()]
  })
}

const PROPERTY_TYPE: Record<string, string> = { '0': 'House', '1': 'Bungalow', '2': 'Flat', '3': 'Maisonette', '4': 'Park home' }

export interface CertificateDetail {
  floorAreaSqm?: number
  propertyType?: string
  band?: string
  registrationDate?: string
}

export async function certificate(no: string): Promise<CertificateDetail | null> {
  return cached(`epc:cert:${no}`, 24 * 30, async () => {
    const r = await get<{ data: Record<string, unknown> }>(`/certificate?certificate_number=${encodeURIComponent(no)}`)
    const d = r?.data
    if (!d) return null
    const area = Number(d.total_floor_area ?? d.totalFloorArea)
    const pt = d.property_type ?? d.propertyType
    return {
      floorAreaSqm: Number.isFinite(area) && area > 0 ? Math.round(area * 10) / 10 : undefined,
      propertyType: pt == null ? undefined : (PROPERTY_TYPE[String(pt)] ?? String(pt)),
      band: (d.current_energy_efficiency_band ?? d.currentEnergyEfficiencyBand) as string | undefined,
      registrationDate: (d.registration_date ?? d.registrationDate) as string | undefined,
    }
  })
}

/** Attach EPC matches (and floor area for usable matches) to comparables, nearest first. */
export async function enrichWithEpc(comps: Comparable[]): Promise<{ items: Comparable[]; message: string }> {
  const order = [...comps].sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9))
  const postcodes = [...new Set(order.map((c) => c.postcode))].slice(0, MAX_POSTCODES)
  const byPc = new Map<string, EpcCandidate[]>()
  await pool(postcodes, 4, async (pc) => byPc.set(pc, await searchPostcode(pc).catch(() => [])))

  const out = comps.map((c) => ({ ...c }))
  const toFetch: { c: Comparable; cand: EpcCandidate; conf: EpcMatch['confidence']; reasons: string[] }[] = []
  let high = 0
  let low = 0
  let ambiguous = 0
  for (const c of out) {
    const cands = byPc.get(c.postcode)
    if (!cands) continue
    const m = matchAddress({ saon: c.saon, paon: c.paon, street: c.street, postcode: c.postcode }, cands)
    if (m.confidence === 'none') {
      c.epc = { certificateNumber: '', address: '', confidence: 'none', reasons: m.reasons }
      continue
    }
    if (m.confidence === 'ambiguous') {
      ambiguous++
      c.epc = { certificateNumber: '', address: '', confidence: 'ambiguous', reasons: m.reasons }
      continue
    }
    m.confidence === 'high' ? high++ : low++
    c.epc = { certificateNumber: m.candidate!.id, address: m.candidate!.lines.join(', '), confidence: m.confidence, reasons: m.reasons, energyBand: m.candidate!.band, registrationDate: m.candidate!.registrationDate }
    toFetch.push({ c, cand: m.candidate!, conf: m.confidence, reasons: m.reasons })
  }
  await pool(toFetch.slice(0, MAX_CERTIFICATES), 4, async ({ c }) => {
    const d = await certificate(c.epc!.certificateNumber).catch(() => null)
    if (d) c.epc = { ...c.epc!, floorAreaSqm: d.floorAreaSqm, propertyType: d.propertyType, energyBand: d.band ?? c.epc!.energyBand }
  })
  const skipped = comps.length && postcodes.length < new Set(comps.map((c) => c.postcode)).size ? ` Checked the ${MAX_POSTCODES} nearest postcodes only.` : ''
  return { items: out, message: `EPC: ${high} reliable match${high === 1 ? '' : 'es'}, ${low} uncertain, ${ambiguous} ambiguous.${skipped}` }
}
