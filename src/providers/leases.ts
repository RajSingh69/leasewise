// Local Registered Leases index. HM Land Registry publishes the dataset only as a monthly
// bulk CSV for account holders (free for personal / non-commercial use; business use needs
// a commercial licence). The user downloads it themselves; Leasewise streams the file in the
// browser, keeps only the chosen postcode districts and stores that subset in IndexedDB.
// Nothing is uploaded anywhere.

import { leaseColumns, leaseForSale, toLeaseRow, type LeaseRow } from '../domain/registeredLeases'
import { splitCsvLine } from './listings'
import type { Comparable } from '../domain/types'
import { leaseSetByUser } from '../domain/comparables'

export const LEASES_DATASET_URL = 'https://use-land-property-data.service.gov.uk/datasets/leases'
const DB = 'leasewise-leases'
const STORE = 'byPostcode'

export interface LeaseIndexMeta {
  importedAt: string
  fileName: string
  districts: string[]
  rows: number
  postcodes: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
  })
}

export async function leaseIndexMeta(): Promise<LeaseIndexMeta | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    return ((await tx('readonly', (s) => s.get('__meta'))) as LeaseIndexMeta | undefined) ?? null
  } catch {
    return null
  }
}

export async function leasesAt(postcode: string): Promise<LeaseRow[]> {
  return ((await tx('readonly', (s) => s.get(postcode.toUpperCase().replace(/\s+/g, ' ').trim()))) as LeaseRow[] | undefined) ?? []
}

export async function clearLeaseIndex() {
  await tx('readwrite', (s) => s.clear())
}

/** Stream a Registered Leases CSV (full file can be several GB) and index the wanted districts. */
export async function importRegisteredLeases(file: File, districts: string[], onProgress?: (pct: number) => void): Promise<LeaseIndexMeta> {
  const want = new Set(districts.map((d) => d.trim().toUpperCase()).filter(Boolean))
  if (!want.size) throw new Error('Enter at least one postcode district, e.g. GU21.')
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader()
  const byPc = new Map<string, LeaseRow[]>()
  let cols: ReturnType<typeof leaseColumns> | undefined
  let buf = ''
  let read = 0
  let rows = 0
  let lastPct = -1
  const handle = (line: string) => {
    if (!line.trim()) return
    const f = splitCsvLine(line)
    if (cols === undefined) {
      cols = leaseColumns(f)
      if (!cols) throw new Error('This file does not look like the HM Land Registry Registered Leases CSV.')
      return
    }
    const r = toLeaseRow(f, cols!, want)
    if (!r) return
    rows++
    byPc.set(r.postcode, [...(byPc.get(r.postcode) ?? []), r])
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.length
    buf += value
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    lines.forEach(handle)
    const pct = Math.min(99, Math.round((read / file.size) * 100))
    if (pct !== lastPct) onProgress?.((lastPct = pct))
  }
  handle(buf)
  if (cols === undefined) throw new Error('The file is empty.')
  const meta: LeaseIndexMeta = { importedAt: new Date().toISOString(), fileName: file.name, districts: [...want], rows, postcodes: byPc.size }
  await clearLeaseIndex()
  await tx('readwrite', (s) => {
    for (const [pc, list] of byPc) s.put(list, pc)
    s.put(meta, '__meta')
  })
  onProgress?.(100)
  return meta
}

/**
 * Attach registered-lease evidence to comparables. High-confidence matches set the lease
 * status automatically; uncertain ones are offered to the user. Never overrides a status
 * the user set themselves.
 */
export async function enrichWithLeases(comps: Comparable[]): Promise<{ items: Comparable[]; loaded: boolean; message: string }> {
  const meta = await leaseIndexMeta()
  if (!meta) return { items: comps, loaded: false, message: 'Registered Leases data not imported — lease lengths of sales are unknown (optional, see Settings).' }
  const cache = new Map<string, LeaseRow[]>()
  let auto = 0
  let suggested = 0
  const items: Comparable[] = []
  for (const c of comps) {
    if (leaseSetByUser(c) || c.source === 'manual') {
      items.push(c)
      continue
    }
    if (!cache.has(c.postcode)) cache.set(c.postcode, await leasesAt(c.postcode))
    const f = leaseForSale({ saon: c.saon, paon: c.paon, street: c.street, postcode: c.postcode, date: c.date }, cache.get(c.postcode)!)
    if (f.yearsAtSale == null) {
      items.push({ ...c, leaseEvidence: f.confidence === 'none' ? undefined : { source: 'registered-leases', termText: f.termText, confidence: f.confidence, note: f.reasons.join(' '), checkedAt: meta.importedAt } })
      continue
    }
    const evidence = { source: 'registered-leases' as const, termText: f.termText, yearsAtSale: f.yearsAtSale, confidence: f.confidence, note: f.reasons.join(' '), checkedAt: meta.importedAt }
    if (f.confidence === 'high') {
      auto++
      items.push({ ...c, leaseStatus: f.status!, leaseEvidence: evidence })
    } else {
      suggested++
      items.push({ ...c, leaseEvidence: evidence })
    }
  }
  return { items, loaded: true, message: `Registered Leases (${meta.districts.join(', ')}, imported ${meta.importedAt.slice(0, 10)}): ${auto} lease lengths matched, ${suggested} need your check.` }
}
