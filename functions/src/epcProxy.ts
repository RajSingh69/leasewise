// Production EPC proxy. Keeps the EPC bearer token in Secret Manager and only serves
// signed-in, allow-listed Leasewise users. Forwards just the two read-only endpoints.

import { getAuth } from 'firebase-admin/auth'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'

const EPC_TOKEN = defineSecret('EPC_API_TOKEN')
const ALLOWED = defineString('ALLOWED_EMAILS', { default: '' })
const EPC_API = 'https://api.get-energy-performance-data.communities.gov.uk/api'
const PATHS = ['/domestic/search', '/certificate']

export const epcProxy = onRequest({ region: 'europe-west2', secrets: [EPC_TOKEN], maxInstances: 2 }, async (req, res) => {
  const path = req.path.replace(/^\/api\/epc/, '') || '/'
  res.set('Cache-Control', 'private, max-age=3600')
  if (path === '/status') {
    res.json({ configured: !!EPC_TOKEN.value() })
    return
  }
  const auth = req.get('Authorization')?.replace(/^Bearer /, '')
  try {
    const user = auth ? await getAuth().verifyIdToken(auth) : null
    const allow = ALLOWED.value().split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!user?.email || !user.email_verified || (allow.length && !allow.includes(user.email.toLowerCase()))) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
  } catch {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  if (req.method !== 'GET' || !PATHS.includes(path)) {
    res.status(404).json({})
    return
  }
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
  const upstream = await fetch(`${EPC_API}${path}${qs}`, { headers: { Authorization: `Bearer ${EPC_TOKEN.value()}`, Accept: 'application/json' } })
  res.status(upstream.status).type('application/json').send(await upstream.text())
})
