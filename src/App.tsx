import { useEffect, useState } from 'react'
import { store, useDb } from './data/store'
import { LocalRepository } from './data/repository'
import { allowedEmails, firebaseConfigured, type AuthUser } from './data/firebase'
import { Button, go, useRoute } from './ui/kit'
import { logout } from './ui/LoginGate'
import { HomePage } from './pages/Home'
import { DiscoverPage } from './pages/Discover'
import { DealsPage } from './pages/Deals'
import { DealPage } from './pages/Deal'
import { ActionsPage } from './pages/Actions'
import { ProfessionalsPage } from './pages/Professionals'
import { SettingsPage } from './pages/Settings'

type Boot = { state: 'loading' } | { state: 'signed-out' } | { state: 'denied'; email: string | null } | { state: 'ready' } | { state: 'error'; message: string }

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' })

  useEffect(() => {
    let unsub: (() => void) | undefined
    if (!firebaseConfigured) {
      store.connect(new LocalRepository()).then(
        () => setBoot({ state: 'ready' }),
        (e) => setBoot({ state: 'error', message: String(e) }),
      )
      return
    }
    import('./data/firebase').then(async (fb) => {
      unsub = await fb.watchAuth(async (u: AuthUser | null) => {
        if (!u) return setBoot({ state: 'signed-out' })
        if (allowedEmails.length && !allowedEmails.includes((u.email ?? '').toLowerCase())) return setBoot({ state: 'denied', email: u.email })
        try {
          await store.connect(new fb.FirestoreRepository(u.uid))
          setBoot({ state: 'ready' })
        } catch (e) {
          setBoot({ state: 'error', message: String(e) })
        }
      })
    })
    return () => unsub?.()
  }, [])

  if (boot.state === 'ready') return <Shell />
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        <Wordmark />
        {boot.state === 'loading' && <p className="mt-4 text-muted">Loading your workspace…</p>}
        {boot.state === 'error' && <p className="mt-4 text-danger">{boot.message}</p>}
        {boot.state === 'signed-out' && (
          <>
            <p className="mt-4 text-muted">Private beta. Sign in with an approved account.</p>
            <Button className="mt-4" onClick={() => import('./data/firebase').then((f) => f.signIn())}>
              Sign in with Google
            </Button>
          </>
        )}
        {boot.state === 'denied' && (
          <>
            <p className="mt-4 text-muted">{boot.email} is not on the access list.</p>
            <Button kind="ghost" className="mt-4" onClick={() => import('./data/firebase').then((f) => f.signOutUser())}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <a href="#/" className="inline-flex shrink-0 items-center gap-2 text-ink no-underline" aria-label="Leasewise home">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
      <span className={`font-display text-xl font-semibold ${compact ? 'hidden sm:inline' : ''}`}>Leasewise</span>
    </a>
  )
}

const NAV = [
  { id: 'discover', label: 'Discover' },
  { id: 'deals', label: 'My Deals' },
  { id: 'actions', label: 'Next Actions' },
]

function Shell() {
  const route = useRoute()
  const db = useDb()
  const [section, id] = route
  const active = section ?? ''
  const openTasks = db.tasks.filter((t) => !t.done).length

  let page
  switch (section) {
    case 'discover':
      page = <DiscoverPage />
      break
    case 'deals':
      page = id ? <DealPage id={id} tab={route[2]} sub={route[3]} /> : <DealsPage />
      break
    case 'actions':
      page = <ActionsPage />
      break
    case 'professionals':
      page = <ProfessionalsPage />
      break
    case 'settings':
      page = <SettingsPage />
      break
    default:
      page = <HomePage />
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Wordmark compact />
          <nav className="ml-auto flex items-center gap-0.5 sm:ml-6 sm:gap-1">
            {NAV.map((n) => (
              <a key={n.id} href={`#/${n.id}`} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium no-underline sm:px-3 sm:text-sm ${active === n.id ? 'bg-forest text-white' : 'text-ink hover:bg-white'}`}>
                {n.label}
                {n.id === 'actions' && openTasks > 0 && <span className="ml-1 hidden text-xs opacity-70 sm:inline">({openTasks})</span>}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-1 sm:ml-auto sm:flex">
            <a href="#/professionals" className={`rounded-lg px-3 py-1.5 text-sm no-underline ${active === 'professionals' ? 'bg-white text-ink' : 'text-muted hover:text-ink'}`}>
              Professionals
            </a>
            <a href="#/settings" className={`rounded-lg px-3 py-1.5 text-sm no-underline ${active === 'settings' ? 'bg-white text-ink' : 'text-muted hover:text-ink'}`}>
              Settings
            </a>
            <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink">
              Log out
            </button>
          </div>
        </div>
      </header>
      {store.error && (
        <div className="bg-danger-soft px-4 py-2 text-center text-sm text-danger">{store.error}</div>
      )}
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:pt-8">{page}</main>
      <footer className="mx-auto max-w-6xl border-t border-line px-4 py-6 text-xs text-muted">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a href="#/professionals" className="sm:hidden">Professionals</a>
          <a href="#/settings" className="sm:hidden">Settings</a>
          <button onClick={logout} className="underline sm:hidden">Log out</button>
          <span>Leasewise gives research estimates, not financial, legal or valuation advice. Verify everything with qualified professionals.</span>
          <span>{store.repo?.kind === 'local' ? 'Local mode: data is stored only in this browser.' : 'Synced to your private cloud workspace.'}</span>
          <button className="underline" onClick={() => go('settings')}>Back up data</button>
        </div>
      </footer>
    </div>
  )
}
