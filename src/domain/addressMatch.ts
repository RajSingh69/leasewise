// Matching HM Land Registry sale addresses to EPC certificates.
//
// A shared postcode is never enough: a postcode can hold dozens of flats across several
// buildings. A match needs the same postcode, the same flat (unit) identifier and the same
// building name/number. Anything weaker is "low"; more than one plausible address is
// "ambiguous". Only "high" matches feed the automated valuation without user approval.

import type { MatchConfidence } from './types'

const SYNONYMS: Record<string, string> = {
  APARTMENT: 'FLAT', APT: 'FLAT', UNIT: 'FLAT', STUDIO: 'FLAT',
  ROAD: 'RD', STREET: 'ST', AVENUE: 'AVE', CRESCENT: 'CRES', CLOSE: 'CL', LANE: 'LN', DRIVE: 'DR', COURT: 'CT', PLACE: 'PL', GARDENS: 'GDNS', TERRACE: 'TER', SQUARE: 'SQ',
}
const STOP = new Set(['THE', 'AND', 'OF'])

export function tokens(s?: string): string[] {
  if (!s) return []
  return s
    .toUpperCase()
    .replace(/(\d)\s*-\s*(\d)/g, '$1 $2') // "11 - 17" → "11 17"
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t)
    .filter((t) => !STOP.has(t))
}

/** Flat identifier: the number/letter after FLAT/APARTMENT/UNIT, e.g. "FLAT 4A" → "4A". */
export function unitId(s?: string): string | undefined {
  const t = tokens(s)
  const i = t.indexOf('FLAT')
  if (i >= 0 && t[i + 1] && /^\d+[A-Z]?$|^[A-Z]$/.test(t[i + 1])) return t[i + 1]
  return undefined
}

export interface SaleAddress {
  saon?: string
  paon?: string
  street?: string
  postcode: string
}

export interface CandidateAddress {
  id: string
  lines: string[]
  postcode: string
}

export interface MatchResult<C extends CandidateAddress> {
  candidate?: C
  confidence: MatchConfidence
  reasons: string[]
}

const normPc = (p: string) => p.toUpperCase().replace(/\s+/g, '')

export function matchAddress<C extends CandidateAddress>(sale: SaleAddress, candidates: C[]): MatchResult<C> {
  const pc = normPc(sale.postcode)
  const inPostcode = candidates.filter((c) => normPc(c.postcode) === pc)
  if (!inPostcode.length) return { confidence: 'none', reasons: ['No EPC certificates found at this postcode.'] }

  // The unit can be in SAON ("FLAT 4") or, for some records, in PAON.
  const saleUnit = unitId(sale.saon) ?? unitId(sale.paon)
  const saonRest = tokens(sale.saon).filter((t) => t !== 'FLAT' && t !== saleUnit)
  const paonToks = tokens(sale.paon).filter((t) => t !== 'FLAT' && t !== saleUnit)
  const streetToks = tokens(sale.street)
  if (!saleUnit && !saonRest.length && !paonToks.length) return { confidence: 'none', reasons: ['Sale record has no flat or building identifier to match on.'] }

  type Scored = { c: C; strong: boolean; key: string }
  const passing: Scored[] = []
  for (const c of inPostcode) {
    const all = c.lines.flatMap((l) => tokens(l))
    const set = new Set(all)
    const candUnit = unitId(c.lines.join(' '))
    if (saleUnit) {
      if (candUnit ? candUnit !== saleUnit : !set.has(saleUnit)) continue
    } else if (candUnit) continue // sale has no unit number but the certificate does
    if (!saonRest.every((t) => set.has(t))) continue // e.g. "FIRST FLOOR"
    if (!paonToks.every((t) => set.has(t))) continue // building name / number
    const streetOk = streetToks.length > 0 && streetToks.every((t) => set.has(t))
    const strong = !!saleUnit && !!candUnit && paonToks.length > 0 && (streetOk || streetToks.length === 0)
    passing.push({ c, strong, key: [...set].sort().join(' ') })
  }

  if (!passing.length) return { confidence: 'none', reasons: [`${inPostcode.length} certificates at this postcode, none with the same flat and building.`] }
  const distinct = new Map<string, Scored[]>()
  for (const p of passing) distinct.set(p.key, [...(distinct.get(p.key) ?? []), p])
  if (distinct.size > 1)
    return { confidence: 'ambiguous', reasons: [`${distinct.size} different addresses at this postcode could be this flat — not used unless you confirm one.`] }
  const group = [...distinct.values()][0]
  const best = group[0]
  if (best.strong)
    return { candidate: best.c, confidence: 'high', reasons: ['Same postcode, flat number and building' + (streetToks.length ? ' and street.' : '.')] }
  return {
    candidate: best.c,
    confidence: 'low',
    reasons: [!saleUnit || !unitId(best.c.lines.join(' ')) ? 'Flat number not stated on both records.' : !paonToks.length ? 'No building name or number to confirm.' : 'Street name differs.'],
  }
}
