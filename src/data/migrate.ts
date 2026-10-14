// Import data from the v1 single-file prototype (localStorage key "leasewise-v1" or its
// JSON backup) and from v2 backups.

import { agentFact, emptyDb, newDeal, nowIso } from '../domain/factories'
import { identifyListing } from '../domain/listing'
import type { Db, InputKey } from '../domain/types'

interface V1Deal {
  id: string
  address: string
  url?: string
  price?: number
  lease?: number
  beds?: number
  notes?: string
  created?: string
  model?: Record<string, number>
}
interface V1State {
  settings?: { capital?: number; location?: string; reserve?: number }
  deals?: V1Deal[]
}

// v1 pre-filled these defaults; only figures the user changed are carried over as estimates.
const V1_DEFAULTS: Record<string, number> = { premium: 0, solicitor: 2200, surveyor: 1100, freeholderFees: 1800, refurb: 5000, other: 3000, selling: 4000, comparable: 0, depositPct: 25, stamp: 0, finance: 0, contingency: 3000 }
const V1_MAP: Record<string, InputKey> = { premium: 'premium', solicitor: 'leaseSolicitor', surveyor: 'leaseValuer', freeholderFees: 'freeholderCosts', refurb: 'refurb', other: 'otherAcquisition', selling: 'sellingLegal', comparable: 'resaleValue', stamp: 'sdltOverride' }

export function isV1(data: unknown): data is V1State {
  return !!data && typeof data === 'object' && Array.isArray((data as V1State).deals) && !('schemaVersion' in (data as object))
}

export function migrateV1(v1: V1State, ownerId: string, into: Db = emptyDb(ownerId)): Db {
  const db: Db = structuredClone(into)
  if (v1.settings) {
    db.settings.capital = v1.settings.capital ?? db.settings.capital
    db.settings.reserve = v1.settings.reserve ?? db.settings.reserve
    db.settings.location = v1.settings.location ?? db.settings.location
  }
  for (const o of v1.deals ?? []) {
    if (db.deals.some((d) => d.id === o.id)) continue
    const d = newDeal(ownerId, o.address || 'Untitled property')
    d.id = o.id
    d.createdAt = o.created ?? nowIso()
    d.notes = [o.notes, '(Imported from Leasewise v1)'].filter(Boolean).join('\n')
    d.facts.askingPrice = agentFact(o.price || undefined)
    d.facts.leaseYears = agentFact(o.lease || undefined)
    d.facts.bedrooms = agentFact(o.beds || undefined)
    if (o.url) {
      const id = identifyListing(o.url)
      d.sources.push({ provider: id?.provider ?? 'other', url: o.url, ref: id?.ref, observedAt: d.createdAt })
    }
    for (const [k, v] of Object.entries(o.model ?? {})) {
      const key = V1_MAP[k]
      if (key && typeof v === 'number' && v !== V1_DEFAULTS[k] && v > 0)
        d.inputs[key] = { value: v, provenance: 'estimate', source: 'Imported from v1', updatedAt: nowIso() }
    }
    db.deals.push(d)
  }
  return db
}

export function parseBackup(text: string, ownerId: string, current: Db): Db {
  const data = JSON.parse(text)
  if (isV1(data)) return migrateV1(data, ownerId, current)
  if (data?.schemaVersion === 2) {
    const fresh = emptyDb(ownerId)
    return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings, ownerId } }
  }
  throw new Error('This file is not a Leasewise backup.')
}
