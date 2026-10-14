// Leasewise Cloud Functions.
//
// Server-side work that must not run in the browser: licensed listing feeds (credentials
// stay in Secret Manager) and scheduled saved-search runs. No provider is connected yet,
// so the scheduled job records that honestly instead of producing listings.

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { providers, type ListingProvider, type SearchCriteria } from './providers.js'

initializeApp()
const db = getFirestore()

/** Runs every saved search against each configured licensed provider, once a day. */
export const runSavedSearches = onSchedule({ schedule: 'every day 07:00', timeZone: 'Europe/London', region: 'europe-west2' }, async () => {
  const active: ListingProvider[] = providers.filter((p) => p.isConfigured())
  if (!active.length) {
    logger.info('No licensed listing provider configured; skipping saved-search run.')
    return
  }
  const searches = await db.collectionGroup('searches').get()
  for (const doc of searches.docs) {
    const uid = doc.ref.parent.parent?.id
    if (!uid) continue
    const criteria = doc.data() as SearchCriteria
    for (const p of active) {
      try {
        const listings = await p.search(criteria)
        const batch = db.batch()
        for (const l of listings) {
          // Raw records; the app de-duplicates them against deals and discoveries on next load.
          const ref = db.collection('users').doc(uid).collection('incoming').doc(`${p.id}-${l.ref}`)
          batch.set(ref, { ...l, provider: p.id, channel: p.name, searchId: doc.id, observedAt: new Date().toISOString(), receivedAt: FieldValue.serverTimestamp() }, { merge: true })
        }
        await batch.commit()
        await doc.ref.update({ lastRunAt: new Date().toISOString() })
      } catch (e) {
        logger.error(`Provider ${p.id} failed for search ${doc.id}`, e)
      }
    }
  }
})

export { epcProxy } from './epcProxy.js'
