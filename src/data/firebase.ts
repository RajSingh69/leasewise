// Optional Firebase backend. Loaded only when VITE_FIREBASE_* variables are set, so local
// mode never downloads the Firebase SDK.

import type { Repository } from './repository'
import type { CollectionName, Db, Settings } from '../domain/types'
import { emptyDb } from '../domain/factories'
import type { ListingRecord } from '../domain/discovery'

const env = import.meta.env
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)
export const allowedEmails = String(env.VITE_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean)

const COLLECTIONS: CollectionName[] = ['deals', 'tasks', 'professionals', 'quotes', 'letters', 'searches', 'discoveries']

async function sdk() {
  const [{ initializeApp, getApps }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
  return { app, auth, fs, authInstance: auth.getAuth(app), db: fs.getFirestore(app) }
}

export interface AuthUser {
  uid: string
  email: string | null
}

export async function watchAuth(cb: (u: AuthUser | null) => void): Promise<() => void> {
  const { auth, authInstance } = await sdk()
  return auth.onAuthStateChanged(authInstance, (u) => cb(u ? { uid: u.uid, email: u.email } : null))
}

export async function idToken(): Promise<string | null> {
  const { authInstance } = await sdk()
  return authInstance.currentUser ? authInstance.currentUser.getIdToken() : null
}

export async function signIn() {
  const { auth, authInstance } = await sdk()
  await auth.signInWithPopup(authInstance, new auth.GoogleAuthProvider())
}

export async function signOutUser() {
  const { auth, authInstance } = await sdk()
  await auth.signOut(authInstance)
}

export class FirestoreRepository implements Repository {
  kind = 'firestore' as const
  constructor(public ownerId: string) {}

  async load(): Promise<Db> {
    const { fs, db } = await sdk()
    const out = emptyDb(this.ownerId)
    const settings = await fs.getDoc(fs.doc(db, 'users', this.ownerId))
    if (settings.exists()) out.settings = { ...out.settings, ...(settings.data().settings as Settings), ownerId: this.ownerId }
    for (const c of COLLECTIONS) {
      const snap = await fs.getDocs(fs.collection(db, 'users', this.ownerId, c))
      ;(out as unknown as Record<string, unknown[]>)[c] = snap.docs.map((d) => d.data())
    }
    return out
  }
  async put(col: CollectionName, item: { id: string }) {
    const { fs, db } = await sdk()
    await fs.setDoc(fs.doc(db, 'users', this.ownerId, col, item.id), stripUndefined({ ...item, ownerId: this.ownerId }))
  }
  async remove(col: CollectionName, id: string) {
    const { fs, db } = await sdk()
    await fs.deleteDoc(fs.doc(db, 'users', this.ownerId, col, id))
  }
  async putSettings(s: Settings) {
    const { fs, db } = await sdk()
    await fs.setDoc(fs.doc(db, 'users', this.ownerId), { settings: stripUndefined({ ...s, ownerId: this.ownerId }) }, { merge: true })
  }
  async takeIncoming() {
    const { fs, db } = await sdk()
    const snap = await fs.getDocs(fs.collection(db, 'users', this.ownerId, 'incoming'))
    const out = snap.docs.map((d) => d.data() as ListingRecord)
    await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref)))
    return out
  }
  async replaceAll(next: Db) {
    await this.putSettings(next.settings)
    for (const c of COLLECTIONS) for (const item of next[c] as { id: string }[]) await this.put(c, item)
  }
}

/** Firestore rejects undefined values. */
function stripUndefined<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}
