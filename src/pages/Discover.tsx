import { useMemo, useState } from 'react'
import { store, useDb } from '../data/store'
import { dealFromRecord, dealMatchesSearch, parseAlertEmail, shortLeaseSignal, type ChangeEvent, type Discovery, type ListingRecord, type SignalLevel } from '../domain/discovery'
import { nowIso, uid } from '../domain/factories'
import { gbp, shortDate } from '../domain/format'
import { findDuplicate, identifyListing, normalisePostcode, parseListingText } from '../domain/listing'
import type { Deal, SavedSearch } from '../domain/types'
import { CSV_COLUMNS, LISTING_SOURCES, parseCsv, portalSearchLinks } from '../providers/listings'
import { Button, Card, Empty, Field, Notice, NumberInput, PageHead, Tabs, go } from '../ui/kit'
import { LiveSearchPanel } from '../ui/LiveSearch'
import { getPropertyDataKey } from '../providers/propertyData'

const SIGNAL: Record<SignalLevel, [string, string]> = {
  likely: ['Likely short lease', 'bg-brass-soft text-brass'],
  possible: ['Possible short lease', 'bg-warn-soft text-warn'],
  unlikely: ['Not a short lease', 'bg-paper text-muted'],
  unknown: ['Lease not stated', 'bg-paper text-muted'],
}

export function DiscoverPage() {
  const db = useDb()
  const [events, setEvents] = useState<ChangeEvent[]>(store.lastEvents)
  const inbox = (db.discoveries ?? []).filter((d) => d.status === 'new').sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
  const onIngest = (ev: ChangeEvent[]) => setEvents(ev)
  return (
    <div className="space-y-6">
      <PageHead eyebrow="Step 1 · Discover" title="Find short-lease flats">
        Bring listings in from the portals, alert emails or auction catalogues. Leasewise spots short leases, removes duplicates and tracks price changes. Then pick the ones worth researching.
      </PageHead>

      <LiveSearchPanel />

      <h2 className="pt-2 text-2xl font-semibold">Your imported listings</h2>
      {!getPropertyDataKey() && <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-[#6f4a0c]">
        <b>No live listing feed is connected.</b> Leasewise can’t search Rightmove, Zoopla or OnTheMarket itself — they don’t offer open access and don’t allow automated collection. The inbox below shows <b>only listings you import</b>:
        <ol className="mt-1 list-decimal pl-5">
          <li>Search the portals with the buttons on the right (opens their websites), or set up their email alerts.</li>
          <li>Paste a listing, a whole alert email, or a CSV export into “Bring listings in”.</li>
          <li>Leasewise extracts the details, flags likely short leases, removes duplicates and records price changes.</li>
        </ol>
      </div>}

      {events.length > 0 && (
        <Notice tone="info">
          <b>Latest import:</b> {events.filter((e) => e.kind === 'new').length} new, {events.filter((e) => e.kind === 'price-drop' || e.kind === 'resurfaced').length} price drops, {events.filter((e) => e.kind === 'seen-again').length} already known.
          <ul className="mt-1 list-disc pl-5">
            {events
              .filter((e) => e.kind !== 'seen-again')
              .slice(0, 6)
              .map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
          </ul>
        </Notice>
      )}

      <section>
        <h2 className="mb-1 text-xl font-semibold">Imported listings ({inbox.length})</h2>
        <p className="mb-3 text-sm text-muted">Listings you’ve brought in, waiting for a decision. “Research it” starts the sold-price valuation and cost analysis.</p>
        {inbox.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {inbox.map((d) => (
              <InboxCard key={d.id} d={d} searches={db.searches} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing imported yet">This isn’t an empty search result — no feed is connected. Paste a listing, an alert email or a CSV below to fill it.</Empty>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BringIn deals={db.deals} onIngest={onIngest} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <SearchPanel />
          <Card>
            <h3 className="text-lg font-semibold">Where listings can come from</h3>
            <ul className="mt-3 space-y-3 text-sm">
              {LISTING_SOURCES.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.status === 'available' ? 'bg-ok' : 'bg-line'}`} />
                  <div>
                    <div className="font-medium">
                      {s.name} <span className="text-xs font-normal text-muted">{s.status === 'available' ? 'Available' : 'Needs credentials'}</span>
                    </div>
                    <div className="text-muted">{s.description}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Rightmove, Zoopla and OnTheMarket have no open listing APIs and prohibit scraping, so Leasewise never reads their websites. Their own alert emails, pasted by you, are fine.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function InboxCard({ d, searches }: { d: Discovery; searches: SavedSearch[] }) {
  const r = d.record
  const [label, style] = SIGNAL[d.signal.level]
  const first = d.priceHistory[0]?.price
  const last = d.priceHistory[d.priceHistory.length - 1]?.price
  const track = () => {
    const deal = dealFromRecord(d.ownerId, r)
    deal.sources = d.sources
    deal.priceHistory = d.priceHistory
    deal.facts.askingPrice = { ...deal.facts.askingPrice, value: last ?? r.price }
    store.upsert('deals', deal)
    store.upsert('discoveries', { ...d, status: 'tracked', dealId: deal.id })
    go(`deals/${deal.id}`)
  }
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{d.address}</div>
          <div className="text-xs text-muted">
            {last ? gbp(last) : 'Price unknown'}
            {first && last && last < first && <span className="font-medium text-ok"> · reduced from {gbp(first)}</span>}
            {r.bedrooms != null && ` · ${r.bedrooms === 0 ? 'studio' : `${r.bedrooms} bed`}`}
            {r.auction && ' · auction'}
            {d.postcode && ` · ${d.postcode}`}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>
      </div>
      <ul className="mt-2 list-disc pl-5 text-xs text-muted">
        {d.signal.reasons.map((x) => (
          <li key={x}>{x}</li>
        ))}
        {r.retirement && <li className="text-danger">Retirement / age-restricted wording.</li>}
        {r.sharedOwnership && <li className="text-danger">Shared ownership wording.</li>}
      </ul>
      <div className="mt-2 text-xs text-muted">
        From {[...new Set(d.sources.map((s) => s.provider))].join(', ')} via {r.channel} · first seen {shortDate(d.firstSeen)}
        {d.lastSeen !== d.firstSeen && ` · last seen ${shortDate(d.lastSeen)}`}
        {d.searchIds.length > 0 && ` · matches ${d.searchIds.map((id) => searches.find((s) => s.id === id)?.name).filter(Boolean).join(', ')}`}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pt-1">
        <Button onClick={track}>Research it →</Button>
        {d.sources[0]?.url && (
          <a href={d.sources[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-2 text-sm no-underline">
            View listing ↗
          </a>
        )}
        <Button kind="ghost" onClick={() => store.upsert('discoveries', { ...d, status: 'dismissed' })} title="Hide it. It comes back if the price drops.">
          Not for me
        </Button>
      </div>
    </Card>
  )
}

type BringTab = 'one' | 'email' | 'csv'

function BringIn({ deals, onIngest }: { deals: Deal[]; onIngest: (e: ChangeEvent[]) => void }) {
  const [tab, setTab] = useState<BringTab>('one')
  return (
    <Card>
      <h2 className="text-xl font-semibold">Bring listings in</h2>
      <div className="mt-3">
        <Tabs<BringTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'one', label: 'One listing' },
            { id: 'email', label: 'Alert email' },
            { id: 'csv', label: 'CSV export' },
          ]}
        />
      </div>
      <div className="mt-4">
        {tab === 'one' && <AddListing deals={deals} />}
        {tab === 'email' && <AlertEmail onIngest={onIngest} />}
        {tab === 'csv' && <CsvImport onIngest={onIngest} />}
      </div>
    </Card>
  )
}

function AddListing({ deals }: { deals: Deal[] }) {
  const [url, setUrl] = useState('')
  const [address, setAddress] = useState('')
  const [postcode, setPostcode] = useState('')
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseListingText(text), [text])
  const listing = url ? identifyListing(url) : null
  const pc = normalisePostcode(postcode) ?? parsed.postcode
  const source = listing ? { provider: listing.provider, url: listing.url, ref: listing.ref, observedAt: nowIso() } : undefined
  const dup = address.trim() || source ? findDuplicate(deals, { address: address.trim() || '\u0000', postcode: pc, source }) : undefined
  const signal = shortLeaseSignal({ leaseYears: parsed.leaseYears, text })

  const record = (): ListingRecord => ({
    provider: listing?.provider ?? 'manual',
    channel: listing ? `Listing (${listing.provider})` : 'Pasted listing',
    ref: listing?.ref,
    url: listing?.url,
    observedAt: nowIso(),
    address: address.trim(),
    postcode: pc,
    price: parsed.price,
    leaseYears: parsed.leaseYears,
    groundRent: parsed.groundRent,
    serviceCharge: parsed.serviceCharge,
    bedrooms: parsed.bedrooms,
    floorAreaSqm: parsed.floorAreaSqm,
    auction: parsed.auction,
    retirement: parsed.retirement,
    sharedOwnership: parsed.sharedOwnership,
    priceReducedHint: parsed.priceReduced,
    text: text.trim() || undefined,
  })
  const save = () => {
    if (!address.trim()) return
    if (dup) {
      store.ingest([record()]) // updates the tracked deal: new source, price change
      return go(`deals/${dup.id}`)
    }
    const d = dealFromRecord(store.db.settings.ownerId, record())
    store.upsert('deals', d)
    go(`deals/${d.id}`)
  }

  return (
    <div>
      <p className="text-sm text-muted">Paste the link and the listing description. Everything extracted is marked as the agent’s claim until you check it.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Listing URL" className="sm:col-span-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.rightmove.co.uk/properties/…" />
        </Field>
        <Field label="Address *">
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat 2, Example Court, Woking" />
        </Field>
        <Field label="Postcode" hint={parsed.postcode && !postcode ? `found ${parsed.postcode}` : undefined}>
          <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder={parsed.postcode ?? 'GU21 …'} />
        </Field>
        <Field label="Listing text (optional)" className="sm:col-span-2">
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Copy the key features and description from the listing page and paste them here." />
        </Field>
      </div>
      {text && (
        <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
            Found in the text <span className={`rounded-full px-2 py-0.5 ${SIGNAL[signal.level][1]}`}>{SIGNAL[signal.level][0]}</span>
          </div>
          {parsed.found.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {parsed.price != null && <span>Price {gbp(parsed.price)}</span>}
              {parsed.leaseYears != null && <span>Lease {parsed.leaseYears} yrs</span>}
              {parsed.groundRent != null && <span>Ground rent {gbp(parsed.groundRent)}/yr</span>}
              {parsed.serviceCharge != null && <span>Service charge {gbp(parsed.serviceCharge)}/yr</span>}
              {parsed.bedrooms != null && <span>{parsed.bedrooms === 0 ? 'Studio' : `${parsed.bedrooms} bed`}</span>}
              {parsed.floorAreaSqm != null && <span>{parsed.floorAreaSqm} m²</span>}
              {parsed.auction && <span>Auction</span>}
              {parsed.retirement && <span className="text-danger">Retirement wording</span>}
              {parsed.sharedOwnership && <span className="text-danger">Shared ownership wording</span>}
            </div>
          ) : (
            <span className="text-muted">Nothing recognised yet — you can add details on the next screen.</span>
          )}
        </div>
      )}
      {dup && (
        <div className="mt-3">
          <Notice tone="warn">
            You already track <b>{dup.address}</b>. Saving will add this link to it and record any price change.
          </Notice>
        </div>
      )}
      <div className="mt-4">
        <Button onClick={save} disabled={!address.trim()}>
          {dup ? 'Update tracked property →' : 'Save and research →'}
        </Button>
      </div>
    </div>
  )
}

function AlertEmail({ onIngest }: { onIngest: (e: ChangeEvent[]) => void }) {
  const [text, setText] = useState('')
  const found = useMemo(() => (text ? parseAlertEmail(text, nowIso()) : []), [text])
  return (
    <div>
      <p className="text-sm text-muted">
        Set up property alerts on Rightmove, Zoopla, OnTheMarket or auction houses (e.g. “flats under £150,000 near Woking”). When an alert email arrives, open it, select all, copy and paste it here. Leasewise picks out each listing, checks it against what you already have, and puts the new ones in your inbox.
      </p>
      <textarea rows={8} className="mt-3" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole alert email here" />
      {text && (
        <p className="mt-2 text-sm">
          {found.length ? `${found.length} listing${found.length === 1 ? '' : 's'} found: ${found.map((f) => `${f.address}${f.price ? ` (${gbp(f.price)})` : ''}`).join('; ')}` : 'No listing links found. Make sure the email’s links were copied (some apps copy text only).'}
        </p>
      )}
      <div className="mt-3">
        <Button
          disabled={!found.length}
          onClick={() => {
            onIngest(store.ingest(parseAlertEmail(text, nowIso(), 'Pasted alert email')))
            setText('')
          }}
        >
          Add to inbox
        </Button>
      </div>
    </div>
  )
}

function CsvImport({ onIngest }: { onIngest: (e: ChangeEvent[]) => void }) {
  const [msg, setMsg] = useState<string | null>(null)
  const onFile = async (f: File) => {
    const { rows, errors } = parseCsv(await f.text())
    const now = nowIso()
    const records: ListingRecord[] = rows.map((r) => {
      const id = r.url ? identifyListing(r.url) : null
      return { provider: id?.provider ?? 'csv', channel: `CSV: ${f.name}`, ref: id?.ref, url: r.url, observedAt: now, address: r.address, postcode: r.postcode, price: r.price, leaseYears: r.leaseYears, groundRent: r.groundRent, serviceCharge: r.serviceCharge, bedrooms: r.bedrooms, listingDate: r.listingDate, auction: r.auction }
    })
    const ev = store.ingest(records)
    onIngest(ev)
    setMsg(`${records.length} rows read.${errors.length ? ' ' + errors.join(' ') : ''}`)
  }
  return (
    <div>
      <p className="text-sm text-muted">For exports from agents, auction houses or data services you’re licensed to use. Re-importing an updated file records price changes. Columns:</p>
      <code className="mt-2 block rounded bg-paper px-2 py-1.5 text-xs">{CSV_COLUMNS}</code>
      <input type="file" accept=".csv,text/csv" className="mt-3" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </div>
  )
}

const blankSearch = (): SavedSearch => ({
  id: uid(),
  ownerId: store.db.settings.ownerId,
  name: '',
  location: store.db.settings.location,
  radiusMiles: store.db.settings.radiusMiles,
  maxPrice: 150000,
  maxLeaseYears: 80,
  propertyType: 'flat',
  includeAuctions: true,
  excludeRetirement: true,
  excludeSharedOwnership: true,
  createdAt: nowIso(),
})

function SearchPanel() {
  const db = useDb()
  const [s, setS] = useState<SavedSearch>(blankSearch)
  const links = portalSearchLinks(s)
  const set = (p: Partial<SavedSearch>) => setS({ ...s, ...p })
  return (
    <>
      <Card>
        <h2 className="text-xl font-semibold">What you’re looking for</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Location" className="col-span-2">
            <input value={s.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Min price (£)">
            <NumberInput value={s.minPrice} onChange={(v) => set({ minPrice: v })} placeholder="Any" />
          </Field>
          <Field label="Max price (£)">
            <NumberInput value={s.maxPrice} onChange={(v) => set({ maxPrice: v })} placeholder="Any" />
          </Field>
          <Field label="Max lease (years)">
            <NumberInput value={s.maxLeaseYears} onChange={(v) => set({ maxLeaseYears: v })} placeholder="Any" />
          </Field>
          <Field label="Min bedrooms">
            <NumberInput value={s.minBedrooms} onChange={(v) => set({ minBedrooms: v })} placeholder="Any" />
          </Field>
          <Field label="Max service charge (£/yr)" className="col-span-2">
            <NumberInput value={s.maxServiceCharge} onChange={(v) => set({ maxServiceCharge: v })} placeholder="Any" />
          </Field>
          <div className="col-span-2 space-y-1.5 text-sm">
            {(
              [
                ['includeAuctions', 'Include auctions'],
                ['excludeRetirement', 'Exclude retirement properties'],
                ['excludeSharedOwnership', 'Exclude shared ownership'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="w-auto" checked={s[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {l}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 text-xs font-medium text-muted">Open these searches on the portals’ own websites (new tab — results are not imported)</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {links.map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-forest-soft px-3 py-1.5 text-sm font-medium text-forest no-underline hover:bg-[#d4e3da]">
              {l.label} ↗
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Tip: save the same search as an email alert on each portal, then paste the alerts here — that’s the closest thing to automatic discovery the portals allow.</p>
        <div className="mt-4 flex gap-2">
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name this search" />
          <Button
            kind="secondary"
            onClick={() => {
              store.upsert('searches', { ...s, name: s.name.trim() || `${s.location} under ${gbp(s.maxPrice)}` })
              setS(blankSearch())
            }}
          >
            Save
          </Button>
        </div>
      </Card>
      {db.searches.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold">Saved searches</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {db.searches.map((x) => {
              const tracked = db.deals.filter((d) => d.stage !== 'rejected' && dealMatchesSearch(d, x)).length
              const inbox = (db.discoveries ?? []).filter((d) => d.status === 'new' && d.searchIds.includes(x.id)).length
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{x.name}</div>
                    <div className="text-xs text-muted">
                      {inbox} in inbox · {tracked} tracked
                      {x.lastRunAt && ` · opened ${shortDate(x.lastRunAt)}`}
                    </div>
                  </div>
                  <Button
                    kind="ghost"
                    onClick={() => {
                      setS({ ...x })
                      store.upsert('searches', { ...x, lastRunAt: nowIso() })
                    }}
                  >
                    Load
                  </Button>
                  <Button kind="ghost" onClick={() => store.remove('searches', x.id)} title="Delete search">
                    ✕
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
