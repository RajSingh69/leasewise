// Storage backends. Local mode keeps everything in this browser. Firestore mode stores each
// record under users/{uid}/{collection}/{id}, which keeps per-user isolation simple and lets
// shared/team data be added later as separate top-level collections.

import { emptyDb } from '../domain/factories'
import type { CollectionName, Db, Settings } from '../domain/types'
import type { ListingRecord } from '../domain/discovery'
import { migrateV1, isV1 } from './migrate'

export interface Repository {
  kind: 'local' | 'firestore'
  ownerId: string
  load(): Promise<Db>
  put(col: CollectionName, item: { id: string }): Promise<void>
  remove(col: CollectionName, id: string): Promise<void>
  putSettings(s: Settings): Promise<void>
  replaceAll(db: Db): Promise<void>
  /** Listing records delivered by server-side feeds since the last load (removed once taken). */
  takeIncoming?(): Promise<ListingRecord[]>
}

const KEY = 'leasewise-v2'
const V1_KEY = 'leasewise-v1'

export class LocalRepository implements Repository {
  kind = 'local' as const
  ownerId = 'local'
  private db: Db | null = null

  async load(): Promise<Db> {
    let db: Db | null = null
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) db = { ...emptyDb(), ...JSON.parse(raw) }
    } catch {
      db = null
    }
    if (!db) {
      db = emptyDb()
      try {
        const v1 = JSON.parse(localStorage.getItem(V1_KEY) ?? 'null')
        if (isV1(v1)) db = migrateV1(v1, this.ownerId, db)
      } catch {
        /* no v1 data */
      }
    }
    this.db = db
    this.flush()
    return db
  }
  private flush() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db))
    } catch (e) {
      console.error('Could not save to this browser', e)
    }
  }
  async put(col: CollectionName, item: { id: string }) {
    const list = this.db![col] as { id: string }[]
    const i = list.findIndex((x) => x.id === item.id)
    if (i >= 0) list[i] = item
    else list.push(item)
    this.flush()
  }
  async remove(col: CollectionName, id: string) {
    ;(this.db as unknown as Record<string, { id: string }[]>)[col] = (this.db![col] as { id: string }[]).filter((x) => x.id !== id)
    this.flush()
  }
  async putSettings(s: Settings) {
    this.db!.settings = s
    this.flush()
  }
  async replaceAll(db: Db) {
    this.db = structuredClone(db)
    this.flush()
  }
}
