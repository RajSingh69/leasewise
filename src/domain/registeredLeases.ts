// Pure logic for HM Land Registry's Registered Leases dataset: CSV row parsing, area
// filtering and choosing the lease that was in force at a given sale date.

import { matchAddress, type SaleAddress } from './addressMatch'
import { leaseStatusFromYears, parseLeaseTerm, parseUkDate, yearsRemaining, type ParsedTerm } from './leaseTerm'
import type { MatchConfidence } from './types'

export interface LeaseRow {
  uid: string
  regOrder: string
  address: string
  postcode: string
  dateOfLease: string
  term: string
}

const PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

export function extractPostcode(s: string): string | undefined {
  const m = s.toUpperCase().match(PC)
  return m ? `${m[1]} ${m[2]}` : undefined
}

export const outwardCode = (pc: string) => pc.trim().toUpperCase().split(/\s+/)[0]

/** Map header names to column indexes, tolerant of spacing and case. */
export function leaseColumns(header: string[]) {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''))
  const find = (...names: string[]) => norm.findIndex((h) => names.includes(h))
  const cols = {
    uid: find('uniqueidentifier'),
    regDesc: find('registerpropertydescription'),
    assocDesc: find('associatedpropertydescription'),
    regOrder: find('regorder'),
    dateOfLease: find('dateoflease'),
    term: find('term'),
    tenure: find('tenure'),
  }
  if (cols.uid < 0 || cols.term < 0 || cols.dateOfLease < 0 || (cols.regDesc < 0 && cols.assocDesc < 0)) return null
  return cols
}

export type LeaseCols = NonNullable<ReturnType<typeof leaseColumns>>

/** One CSV row → LeaseRow, or null if it isn't in the wanted postcode districts. */
export function toLeaseRow(f: string[], c: LeaseCols, districts: Set<string>): LeaseRow | null {
  const assoc = c.assocDesc >= 0 ? f[c.assocDesc] ?? '' : ''
  const reg = c.regDesc >= 0 ? f[c.regDesc] ?? '' : ''
  const address = assoc && !/^unavailable/i.test(assoc) ? assoc : reg
  const postcode = extractPostcode(address) ?? extractPostcode(reg)
  if (!postcode || !districts.has(outwardCode(postcode))) return null
  if (c.tenure >= 0 && f[c.tenure] && !/leasehold/i.test(f[c.tenure])) return null
  return { uid: f[c.uid], regOrder: c.regOrder >= 0 ? f[c.regOrder] : '1', address, postcode, dateOfLease: f[c.dateOfLease] ?? '', term: f[c.term] ?? '' }
}

export interface LeaseFinding {
  confidence: MatchConfidence
  reasons: string[]
  termText?: string
  parsed?: ParsedTerm
  yearsAtSale?: number
  status?: 'long' | 'short' | 'unknown'
  address?: string
}

/** Split a Land Registry address string into parts for matching. */
function addressLines(address: string): string[] {
  return address.replace(PC, '').split(/,|\(|\)/).map((s) => s.trim()).filter(Boolean)
}

/**
 * Find the registered lease for a sold flat and the years left at the sale date. Only leases
 * dated on or before the sale count, so a later extension isn't credited to an earlier sale.
 */
export function leaseForSale(sale: SaleAddress & { date: string }, rows: LeaseRow[]): LeaseFinding {
  const byUid = new Map<string, LeaseRow[]>()
  for (const r of rows) byUid.set(r.uid, [...(byUid.get(r.uid) ?? []), r])
  const cands = [...byUid.entries()].map(([uid, rs]) => ({ id: uid, lines: addressLines(rs[0].address), postcode: rs[0].postcode }))
  const m = matchAddress(sale, cands)
  if (!m.candidate) return { confidence: m.confidence, reasons: m.reasons }
  const leases = byUid.get(m.candidate.id)!
  const parsed = leases
    .map((r) => ({ r, p: parseLeaseTerm(r.term, r.dateOfLease), d: parseUkDate(r.dateOfLease) }))
    .filter((x) => x.p && (!x.d || x.d <= sale.date))
  if (!parsed.length) {
    const unread = leases.find((r) => r.term)
    return {
      confidence: m.confidence,
      reasons: [...m.reasons, unread ? `Lease term could not be read reliably: "${unread.term}".` : 'No lease in force at the sale date.'],
      termText: unread?.term,
      address: leases[0].address,
    }
  }
  // Longest-running lease in force at the sale (covers earlier extensions / new leases).
  const best = parsed.sort((a, b) => b.p!.end.localeCompare(a.p!.end))[0]
  const yearsAtSale = yearsRemaining(best.p!, sale.date)
  return {
    confidence: m.confidence,
    reasons: [...m.reasons, `Registered lease: ${best.r.term}${best.r.dateOfLease ? ` (dated ${best.r.dateOfLease})` : ''}.`],
    termText: best.r.term,
    parsed: best.p!,
    yearsAtSale,
    status: leaseStatusFromYears(yearsAtSale),
    address: best.r.address,
  }
}
