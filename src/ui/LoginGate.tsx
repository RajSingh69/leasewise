// Simple client-side login gate for the static GitHub Pages build. It keeps the app out of
// casual view; it is not real security. Deal data stays in each browser's localStorage.

import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Field } from './kit'

const USERNAME = 'LeasewiseAdmin'
const PASSWORD = 'LeasewiseAdmin'
const SESSION_KEY = 'leasewise-session'

function hasSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
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
  const [error, setError] = useState<string | null>(null)

  if (unlocked) return <>{children}</>

  function submit(e: FormEvent) {
    e.preventDefault()
    const ok = username.trim() === USERNAME && password === PASSWORD
    if (!ok) {
      setError('Incorrect username or password.')
      return
    }
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
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
          <Button type="submit" className="mt-1 w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
