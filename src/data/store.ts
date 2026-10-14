// In-memory app state with write-through persistence to the active repository.

import { useSyncExternalStore } from 'react'
import { emptyDb, nowIso } from '../domain/factories'
import type { CollectionName, Db, Deal, Settings } from '../domain/types'
import type { Repository } from './repository'
import { ingest, type ChangeEvent, type ListingRecord } from '../domain/discovery'

type Item<C extends CollectionName> = Db[C][number]

class Store {
  db: Db = emptyDb()
  repo: Repository | null = null
  ready = false
  error: string | null = null
  private listeners = new Set<() => void>()

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.db

  private emit() {
    this.listeners.forEach((l) => l())
  }
  private persist(p: Promise<void>) {
    p.catch((e) => {
      this.error = `Could not save: ${e?.message ?? e}`
      this.emit()
    })
  }

  async connect(repo: Repository) {
    this.repo = repo
    this.db = structuredClone(await repo.load())
    this.ready = true
    this.emit()
    const incoming = await repo.takeIncoming?.().catch(() => [])
    if (incoming?.length) this.lastEvents = this.ingest(incoming)
  }

  lastEvents: ChangeEvent[] = []

  /** Bring listing records in from any source: new items go to the inbox, known ones update. */
  ingest(records: ListingRecord[]): ChangeEvent[] {
    const r = ingest({ ownerId: this.db.settings.ownerId, deals: this.db.deals, discoveries: this.db.discoveries ?? [], searches: this.db.searches, records })
    for (const d of r.updatedDeals) this.upsert('deals', d)
    for (const d of [...r.newDiscoveries, ...r.updatedDiscoveries]) this.upsert('discoveries', d)
    return r.events
  }

  upsert<C extends CollectionName>(col: C, item: Item<C>) {
    const list = this.db[col] as Item<C>[]
    const i = list.findIndex((x) => x.id === item.id)
    const next = i >= 0 ? list.map((x, j) => (j === i ? item : x)) : [...list, item]
    this.db = { ...this.db, [col]: next }
    this.emit()
    this.persist(this.repo!.put(col, item))
  }

  remove(col: CollectionName, id: string) {
    this.db = { ...this.db, [col]: (this.db[col] as { id: string }[]).filter((x) => x.id !== id) }
    this.emit()
    this.persist(this.repo!.remove(col, id))
  }

  updateDeal(id: string, fn: (d: Deal) => void) {
    const cur = this.db.deals.find((d) => d.id === id)
    if (!cur) return
    const d = structuredClone(cur)
    fn(d)
    d.updatedAt = nowIso()
    this.upsert('deals', d)
  }

  updateSettings(patch: Partial<Settings>) {
    const s = { ...this.db.settings, ...patch, updatedAt: nowIso() }
    this.db = { ...this.db, settings: s }
    this.emit()
    this.persist(this.repo!.putSettings(s))
  }

  async replaceAll(db: Db) {
    this.db = db
    this.emit()
    await this.repo!.replaceAll(db)
  }
}

export const store = new Store()

export function useDb(): Db {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
