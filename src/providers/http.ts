// fetch with a timeout and errors that say which provider failed and why, so a failure is
// never shown to the user as "no results".

export async function providerFetch(label: string, url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal })
    if (res.status === 429) throw new Error(`${label} is rate-limiting requests. Wait a minute and try again.`)
    if (res.status >= 500) throw new Error(`${label} is having problems (HTTP ${res.status}). Try again later.`)
    return res
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error(`${label} did not respond within ${Math.round(timeoutMs / 1000)} seconds. Try again, or use a smaller radius.`)
    if (e instanceof TypeError) throw new Error(`${label} could not be reached. Check your connection, or whether a browser extension (ad or privacy blocker) is blocking ${new URL(url).hostname}.`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}
