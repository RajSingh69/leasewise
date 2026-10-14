// Client-side login gate for the static GitHub Pages build. It keeps the app out of casual
// view; it is not server-side security. The bundle only ships a salted PBKDF2 hash of the
// password (VITE_LEASEWISE_PASSWORD_HASH, made with `npm run hash-password`), and deal data
// stays in each browser's localStorage, never on the server.

import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Field } from './kit'

const USERNAME = 'LeasewiseAdmin'
const SESSION_KEY = 'leasewise-session'
const HASH = String(import.meta.env.VITE_LEASEWISE_PASSWORD_HASH ?? '').trim()

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function passwordMatches(password: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = HASH.split('$')
  if (scheme !== 'pbkdf2-sha256' || !expected) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(salt), iterations: Number(iterations) }, key, 256)
  return btoa(String.fromCharCode(...new Uint8Array(bits))) === expected
}

function hasSession(): boolean {
  try {
    return !!HASH && sessionStorage.getItem(SESSION_KEY) === HASH
  } catch {
    return false
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage unavailable */
  }
  window.location.hash = '#/'
  window.location.reload()
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(hasSession)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (unlocked) return <>{children}</>

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const ok = username.trim() === USERNAME && (await passwordMatches(password).catch(() => false))
    if (!ok) {
      setError('Incorrect username or password.')
      setBusy(false)
      return
    }
    try {
      sessionStorage.setItem(SESSION_KEY, HASH)
    } catch {
      /* still unlock for this page view */
    }
    setUnlocked(true)
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 text-ink">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
            <span className="font-display text-2xl font-semibold">Leasewise</span>
          </span>
          <p className="mt-2 text-sm text-muted">Private workspace. Sign in to continue.</p>
        </div>
        {HASH ? (
          <form className="mt-6 grid gap-3 rounded-xl border border-line bg-card p-5" onSubmit={submit}>
            <Field label="Username">
              <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-1 w-full" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </Button>
          </form>
        ) : (
          <p className="mt-6 rounded-xl border border-line bg-card p-5 text-sm text-danger">
            Login is not configured. Set VITE_LEASEWISE_PASSWORD_HASH (see README) and rebuild.
          </p>
        )}
      </div>
    </div>
  )
}
