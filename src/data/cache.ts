// Small TTL cache in localStorage for public-data lookups, so repeat views don't re-query
// Land Registry, HPI, EPC or postcodes.io. Falls back to memory if storage is unavailable.

const PREFIX = 'lw-cache:'
const memory = new Map<string, string>()

interface Entry<T> {
  exp: number
  v: T
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}

function write(key: string, raw: string) {
  memory.set(key, raw)
  try {
    localStorage.setItem(PREFIX + key, raw)
  } catch {
    // Quota exceeded: drop all cached entries (never user data) and retry once.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k))
      localStorage.setItem(PREFIX + key, raw)
    } catch {
      /* memory only */
    }
  }
}

export async function cached<T>(key: string, ttlHours: number, load: () => Promise<T>): Promise<T> {
  const raw = read(key)
  if (raw) {
    try {
      const e = JSON.parse(raw) as Entry<T>
      if (e.exp > Date.now()) return e.v
    } catch {
      /* ignore corrupt entry */
    }
  }
  const v = await load()
  write(key, JSON.stringify({ exp: Date.now() + ttlHours * 3600_000, v }))
  return v
}

/** Run async tasks with a concurrency limit. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++
      out[n] = await fn(items[n])
    }
  })
  await Promise.all(workers)
  return out
}
