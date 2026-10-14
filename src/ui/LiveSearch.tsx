import { useState } from 'react'
import { store } from '../data/store'
import { dealFromRecord, shortLeaseSignal } from '../domain/discovery'
import { gbp, shortDate } from '../domain/format'
import { findDuplicate } from '../domain/listing'
import { getPropertyDataKey, LIVE_LISTS, PROPERTY_TYPES, PROPERTYDATA_SIGNUP, searchLiveListings, type LiveListing, type LiveResult, type LiveSearch } from '../providers/propertyData'
import { Button, Card, Ext, Field, Notice, NumberInput, go } from './kit'

const SIGNAL_STYLE = { likely: 'bg-brass-soft text-brass', possible: 'bg-warn-soft text-warn', unlikely: 'bg-paper text-muted', unknown: 'bg-paper text-muted' }
const SIGNAL_LABEL = { likely: 'Likely short lease', possible: 'Possible short lease', unlikely: 'Not a short lease', unknown: 'Lease not stated' }

export function LiveSearchPanel() {
  const connected = !!getPropertyDataKey()
  const [s, setS] = useState<LiveSearch>({
    location: 'Woking',
    radiusMiles: 100,
    types: [],
    lists: ['short-lease-properties', 'reduced-properties', 'auction-properties', 'cash-buyers-only-properties', 'back-on-market'],
    includeUnderOffer: false,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<LiveResult | null>(null)
  const set = (p: Partial<LiveSearch>) => setS({ ...s, ...p })
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      setRes(await searchLiveListings(s))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setRes(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Live listings search</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${connected ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}>
          {connected ? 'Connected: PropertyData' : 'Not connected'}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Properties currently advertised for sale (seen on Rightmove, Zoopla and OnTheMarket), supplied by PropertyData’s licensed API. These are live listings — not sold prices and not your imports.
      </p>
      {!connected && (
        <div className="mt-3">
          <Notice tone="warn">
            Live search needs a PropertyData API key (paid from £30/month; a 14-day trial with 500 credits is available — <Ext href={PROPERTYDATA_SIGNUP}>plans</Ext>). Add the key in <a href="#/settings">Settings</a>. Until then, use “Bring listings in” below.
          </Notice>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Location" className="col-span-2 sm:col-span-1">
          <input value={s.location} onChange={(e) => set({ location: e.target.value })} placeholder="Town or postcode" />
        </Field>
        <Field label="Radius (miles, max 100)">
          <NumberInput value={s.radiusMiles} onChange={(v) => set({ radiusMiles: Math.min(100, Math.max(1, v ?? 100)) })} />
        </Field>
        <Field label="Min price (£)">
          <NumberInput value={s.minPrice} onChange={(v) => set({ minPrice: v })} placeholder="Any" />
        </Field>
        <Field label="Max price (£)">
          <NumberInput value={s.maxPrice} onChange={(v) => set({ maxPrice: v })} placeholder="Any" />
        </Field>
        <Field label="Max lease (years)" hint="optional">
          <NumberInput value={s.maxLeaseYears} onChange={(v) => set({ maxLeaseYears: v })} placeholder="Any" />
        </Field>
        <div className="col-span-2 sm:col-span-3">
          <div className="mb-1 text-xs font-medium text-muted">Property type (none ticked = all)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {PROPERTY_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="checkbox" className="w-auto" checked={s.types.includes(t)} onChange={() => set({ types: toggle(s.types, t) })} /> {t}
              </label>
            ))}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <div className="mb-1 text-xs font-medium text-muted">Listing types to include (up to 5)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LIVE_LISTS.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5">
                <input type="checkbox" className="w-auto" checked={s.lists.includes(l.id)} disabled={!s.lists.includes(l.id) && s.lists.length >= 5} onChange={() => set({ lists: toggle(s.lists, l.id) })} /> {l.label}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="w-auto" checked={s.includeUnderOffer} onChange={(e) => set({ includeUnderOffer: e.target.checked })} /> Include under offer (SSTC)
            </label>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={!connected || busy}>
          {busy ? 'Searching…' : 'Search live listings'}
        </Button>
        {res && (
          <span className="text-sm">
            <b>{res.listings.length}</b> live listing{res.listings.length === 1 ? '' : 's'} within {s.radiusMiles} miles of {res.centre}
            {res.filteredOut > 0 && ` (${res.filteredOut} outside your price/lease filters)`} · checked {shortDate(res.fetchedAt)} {new Date(res.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {res.creditsUsed > 0 && ` · ${res.creditsUsed} API credits`}
          </span>
        )}
      </div>
      {err && (
        <div className="mt-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      {res && res.listings.length === 0 && (
        <p className="mt-3 text-sm text-muted">The search ran but PropertyData returned no current listings matching these lists and filters. Try more listing types or a wider radius.</p>
      )}
      {res && res.listings.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {res.listings.map((l) => (
            <LiveCard key={l.record.ref} l={l} />
          ))}
        </div>
      )}
    </Card>
  )
}

function LiveCard({ l }: { l: LiveListing }) {
  const r = l.record
  const sig = shortLeaseSignal(r)
  const research = () => {
    const existing = findDuplicate(store.db.deals, { address: r.address, postcode: r.postcode, source: { provider: r.provider, ref: r.ref, url: r.url, observedAt: r.observedAt } })
    if (existing) return go(`deals/${existing.id}`)
    const d = dealFromRecord(store.db.settings.ownerId, r)
    d.facts.propertyType = { value: l.type, provenance: 'agent', source: r.channel }
    if (l.priceHistory.length > 1) d.priceHistory = l.priceHistory.map((p) => ({ ...p, source: 'PropertyData price history' }))
    store.upsert('deals', d)
    go(`deals/${d.id}`)
  }
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{r.address}</div>
          <div className="text-xs text-muted">
            {r.price ? gbp(r.price) : 'Price on application'} · {l.type}
            {r.bedrooms != null && ` · ${r.bedrooms} bed`}
            {l.distanceMiles != null && ` · ${l.distanceMiles.toFixed(1)} mi`}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SIGNAL_STYLE[sig.level]}`}>{SIGNAL_LABEL[sig.level]}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted">Status</dt>
        <dd className={l.active === 'for-sale' ? 'text-ok' : 'text-warn'}>{l.active === 'for-sale' ? 'For sale' : 'Under offer (SSTC)'}</dd>
        <dt className="text-muted">Listed</dt>
        <dd>{r.listingDate ? `${shortDate(r.listingDate)} (${l.daysOnMarket} days)` : 'Not given'}</dd>
        <dt className="text-muted">Lease</dt>
        <dd>{r.leaseYears != null ? `${r.leaseYears} years left` : 'Not given'}</dd>
        <dt className="text-muted">Source</dt>
        <dd className="capitalize">{r.provider} via PropertyData</dd>
        <dt className="text-muted">Lists</dt>
        <dd>{l.lists.join(', ') || '—'}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={research}>Research this property →</Button>
        {r.url && (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-2 text-sm no-underline">
            View listing ↗
          </a>
        )}
      </div>
    </div>
  )
}
