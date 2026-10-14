import { useState } from 'react'
import { store, useDb } from '../data/store'
import { nowIso, today, uid } from '../domain/factories'
import { gbp, shortDate } from '../domain/format'
import type { InputKey, Professional, ProfessionalKind, Quote } from '../domain/types'
import { Button, Card, Empty, Ext, Field, Notice, NumberInput, PageHead } from '../ui/kit'

export const KINDS: { id: ProfessionalKind; label: string; search: string; registers: { label: string; url: string }[] }[] = [
  { id: 'lease-solicitor', label: 'Lease-extension solicitors', search: 'lease extension solicitor', registers: [{ label: 'SRA register', url: 'https://www.sra.org.uk/consumers/register/' }, { label: 'Law Society: Find a Solicitor', url: 'https://solicitors.lawsociety.org.uk/' }, { label: 'ALEP members', url: 'https://www.alep.org.uk/' }] },
  { id: 'conveyancer', label: 'Conveyancing solicitors', search: 'leasehold conveyancing solicitor', registers: [{ label: 'SRA register', url: 'https://www.sra.org.uk/consumers/register/' }, { label: 'Council for Licensed Conveyancers', url: 'https://www.clc-uk.org/' }] },
  { id: 'surveyor', label: 'Leasehold valuation surveyors', search: 'lease extension valuation surveyor RICS', registers: [{ label: 'RICS Find a Surveyor', url: 'https://www.ricsfirms.com/' }, { label: 'ALEP members', url: 'https://www.alep.org.uk/' }] },
  { id: 'broker', label: 'Mortgage brokers', search: 'mortgage broker short lease bridging', registers: [{ label: 'FCA register', url: 'https://register.fca.org.uk/' }] },
  { id: 'estate-agent', label: 'Estate agents', search: 'estate agents', registers: [{ label: 'The Property Ombudsman', url: 'https://www.tpos.co.uk/' }, { label: 'Propertymark', url: 'https://www.propertymark.co.uk/' }] },
  { id: 'auctioneer', label: 'Auctioneers', search: 'property auctioneers', registers: [{ label: 'Propertymark (NAVA)', url: 'https://www.propertymark.co.uk/' }, { label: 'RICS firms', url: 'https://www.ricsfirms.com/' }] },
  { id: 'contractor', label: 'Refurbishment contractors', search: 'flat refurbishment builder', registers: [{ label: 'TrustMark', url: 'https://www.trustmark.org.uk/' }, { label: 'Gas Safe Register', url: 'https://www.gassaferegister.co.uk/' }, { label: 'NICEIC electricians', url: 'https://www.niceic.com/' }] },
]

export const SERVICES: { label: string; input?: InputKey }[] = [
  { label: 'Lease extension — legal', input: 'leaseSolicitor' },
  { label: 'Lease extension — valuation', input: 'leaseValuer' },
  { label: "Freeholder's costs (estimate)", input: 'freeholderCosts' },
  { label: 'Purchase conveyancing', input: 'conveyancing' },
  { label: 'Building survey', input: 'survey' },
  { label: 'Auction legal pack review', input: 'legalPackReview' },
  { label: 'Broker fee', input: 'brokerFee' },
  { label: 'Refurbishment', input: 'refurb' },
  { label: 'Selling — estate agent' },
  { label: 'Selling — legal', input: 'sellingLegal' },
  { label: 'Other' },
]

const blank = (kind: ProfessionalKind): Professional => ({
  id: uid(),
  ownerId: store.db.settings.ownerId,
  kind,
  name: '',
  location: store.db.settings.location,
  specialisms: '',
  infoSource: '',
  infoDate: today(),
  status: 'not-contacted',
  notes: '',
})

export function ProfessionalsPage() {
  const db = useDb()
  const [kind, setKind] = useState<ProfessionalKind>('lease-solicitor')
  const [editing, setEditing] = useState<Professional | null>(null)
  const k = KINDS.find((x) => x.id === kind)!
  const list = db.professionals.filter((p) => p.kind === kind)
  const area = db.settings.location

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Get help" title="Professionals">
        Build your own shortlist of firms around {area}. Leasewise doesn’t invent contacts or credentials: add firms you find, check them on the official register, and compare their quotes here.
      </PageHead>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((x) => (
          <button key={x.id} onClick={() => setKind(x.id)} className={`rounded-full border px-3 py-1 text-sm ${kind === x.id ? 'border-forest bg-forest text-white' : 'border-line bg-card hover:border-forest/40'}`}>
            {x.label} {db.professionals.some((p) => p.kind === x.id) && <span className="opacity-70">({db.professionals.filter((p) => p.kind === x.id).length})</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {editing ? (
            <ProEditor p={editing} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex justify-between gap-2">
              <h2 className="text-xl font-semibold">{k.label}</h2>
              <Button onClick={() => setEditing(blank(kind))}>Add firm</Button>
            </div>
          )}
          {list.length ? list.map((p) => <ProCard key={p.id} p={p} onEdit={() => setEditing(p)} />) : !editing && <Empty title="No firms yet">Use the search and register links to find and verify firms, then add them here.</Empty>}
          <QuoteComparison />
        </div>
        <aside className="space-y-4">
          <Card>
            <h3 className="text-lg font-semibold">Find</h3>
            <p className="mt-1 text-sm">
              <Ext href={`https://www.google.com/maps/search/${encodeURIComponent(`${k.search} near ${area}`)}`}>
                {k.search} near {area}
              </Ext>
            </p>
            <h3 className="mt-4 text-lg font-semibold">Verify</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {k.registers.map((r) => (
                <li key={r.url}>
                  <Ext href={r.url}>{r.label}</Ext>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Record the registration number and the date you checked it. Reviews and adverts are not verification.</p>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function ProCard({ p, onEdit }: { p: Professional; onEdit: () => void }) {
  const db = useDb()
  const quotes = db.quotes.filter((q) => q.professionalId === p.id)
  const [adding, setAdding] = useState(false)
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted">
            {p.location}
            {p.phone && ` · ${p.phone}`}
            {p.email && (
              <>
                {' · '}
                <a href={`mailto:${p.email}`}>{p.email}</a>
              </>
            )}
            {p.website && (
              <>
                {' · '}
                <Ext href={p.website}>website</Ext>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select className="w-auto py-1 text-xs" value={p.status} onChange={(e) => store.upsert('professionals', { ...p, status: e.target.value as Professional['status'] })}>
            {['not-contacted', 'contacted', 'quoted', 'instructed', 'declined'].map((s) => (
              <option key={s} value={s}>
                {s.replace('-', ' ')}
              </option>
            ))}
          </select>
          <Button kind="ghost" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
      {p.specialisms && <p className="mt-2 text-sm">{p.specialisms}</p>}
      <div className="mt-2 text-xs">
        {p.registration ? (
          <span className="text-ok">
            ✓ {p.registration}
            {p.registrationCheckedAt && ` (checked ${shortDate(p.registrationCheckedAt)})`}
          </span>
        ) : (
          <span className="text-warn">Registration not checked</span>
        )}
        <span className="text-muted">
          {' '}
          · Info from {p.infoSource || 'unknown source'}, {shortDate(p.infoDate)}
        </span>
      </div>
      {p.notes && <p className="mt-1 text-xs text-muted">{p.notes}</p>}
      {quotes.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
          {quotes.map((q) => (
            <QuoteRow key={q.id} q={q} />
          ))}
        </ul>
      )}
      {adding ? <QuoteForm pro={p} onDone={() => setAdding(false)} /> : <button className="mt-3 text-sm font-medium text-forest underline" onClick={() => setAdding(true)}>+ Record a quote</button>}
    </Card>
  )
}

function QuoteRow({ q }: { q: Quote }) {
  const db = useDb()
  const deal = db.deals.find((d) => d.id === q.dealId)
  const svc = SERVICES.find((s) => s.label === q.service)
  const applied = deal && svc?.input && deal.inputs[svc.input]?.source === `Quote ${q.id}`
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="tabular font-medium">{gbp(q.amount)}</span> {q.includesVat ? 'inc VAT' : '+ VAT'} · {q.service}
        <div className="text-xs text-muted">
          {deal ? deal.address : 'Not linked to a property'} · received {shortDate(q.receivedAt)}
          {q.includes && ` · includes: ${q.includes}`}
          {q.excludes && ` · excludes: ${q.excludes}`}
        </div>
      </div>
      {deal && svc?.input && (
        <Button
          kind="secondary"
          disabled={!!applied}
          onClick={() =>
            store.updateDeal(deal.id, (d) => {
              d.inputs[svc.input!] = { value: q.includesVat ? q.amount : Math.round(q.amount * 1.2), provenance: 'quote', source: `Quote ${q.id}`, note: q.service, updatedAt: nowIso() }
            })
          }
          title="Replace the planning allowance in this property's model with this quote"
        >
          {applied ? 'In model' : 'Use in model'}
        </Button>
      )}
      <button className="text-muted hover:text-danger" onClick={() => store.remove('quotes', q.id)} title="Delete quote">
        ✕
      </button>
    </li>
  )
}

function QuoteForm({ pro, onDone }: { pro: Professional; onDone: () => void }) {
  const db = useDb()
  const [q, setQ] = useState<Quote>({ id: uid(), ownerId: pro.ownerId, professionalId: pro.id, service: SERVICES[0].label, amount: 0, includesVat: true, includes: '', excludes: '', receivedAt: today(), status: 'received' })
  const set = (p: Partial<Quote>) => setQ({ ...q, ...p })
  return (
    <div className="mt-3 grid gap-2 rounded-lg bg-paper p-3 sm:grid-cols-2">
      <Field label="Service">
        <select value={q.service} onChange={(e) => set({ service: e.target.value })}>
          {SERVICES.map((s) => (
            <option key={s.label}>{s.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Property">
        <select value={q.dealId ?? ''} onChange={(e) => set({ dealId: e.target.value || undefined })}>
          <option value="">— none —</option>
          {db.deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.address}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount (£)">
        <NumberInput value={q.amount || undefined} onChange={(v) => set({ amount: v ?? 0 })} />
      </Field>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" className="w-auto" checked={q.includesVat} onChange={(e) => set({ includesVat: e.target.checked })} /> Includes VAT
      </label>
      <Field label="What’s included">
        <input value={q.includes} onChange={(e) => set({ includes: e.target.value })} placeholder="e.g. s.42 notice, negotiation" />
      </Field>
      <Field label="Not included">
        <input value={q.excludes} onChange={(e) => set({ excludes: e.target.value })} placeholder="e.g. tribunal, disbursements" />
      </Field>
      <Field label="Received">
        <input type="date" value={q.receivedAt} onChange={(e) => set({ receivedAt: e.target.value })} />
      </Field>
      <div className="flex items-end gap-2">
        <Button
          disabled={!q.amount}
          onClick={() => {
            store.upsert('quotes', q)
            store.upsert('professionals', { ...pro, status: pro.status === 'not-contacted' || pro.status === 'contacted' ? 'quoted' : pro.status })
            onDone()
          }}
        >
          Save quote
        </Button>
        <Button kind="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ProEditor({ p: initial, onDone }: { p: Professional; onDone: () => void }) {
  const [p, setP] = useState(initial)
  const set = (x: Partial<Professional>) => setP({ ...p, ...x })
  const exists = store.db.professionals.some((x) => x.id === p.id)
  return (
    <Card>
      <h2 className="text-xl font-semibold">{exists ? 'Edit firm' : 'Add a firm'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Business name *">
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select value={p.kind} onChange={(e) => set({ kind: e.target.value as ProfessionalKind })}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input value={p.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Website">
          <input value={p.website ?? ''} onChange={(e) => set({ website: e.target.value || undefined })} placeholder="https://" />
        </Field>
        <Field label="Email">
          <input type="email" value={p.email ?? ''} onChange={(e) => set({ email: e.target.value || undefined })} />
        </Field>
        <Field label="Phone">
          <input value={p.phone ?? ''} onChange={(e) => set({ phone: e.target.value || undefined })} />
        </Field>
        <Field label="Specialisms (as stated by the firm)" className="sm:col-span-2">
          <input value={p.specialisms} onChange={(e) => set({ specialisms: e.target.value })} />
        </Field>
        <Field label="Registration you checked" hint="e.g. SRA 123456">
          <input value={p.registration ?? ''} onChange={(e) => set({ registration: e.target.value || undefined, registrationCheckedAt: e.target.value ? today() : undefined })} />
        </Field>
        <Field label="Where this information came from">
          <input value={p.infoSource} onChange={(e) => set({ infoSource: e.target.value })} placeholder="Firm website, SRA register…" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea rows={2} value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      {!p.registration && (
        <div className="mt-3">
          <Notice tone="warn">Check the firm on the relevant register before instructing them.</Notice>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button
          disabled={!p.name.trim()}
          onClick={() => {
            store.upsert('professionals', { ...p, name: p.name.trim(), infoDate: p.infoDate || today() })
            onDone()
          }}
        >
          Save
        </Button>
        <Button kind="ghost" onClick={onDone}>
          Cancel
        </Button>
        {exists && (
          <Button
            kind="danger"
            className="ml-auto"
            onClick={() => {
              if (confirm(`Remove ${p.name}?`)) {
                store.remove('professionals', p.id)
                onDone()
              }
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </Card>
  )
}

function QuoteComparison() {
  const db = useDb()
  if (db.quotes.length < 2) return null
  const bySvc = new Map<string, Quote[]>()
  for (const q of db.quotes) bySvc.set(q.service, [...(bySvc.get(q.service) ?? []), q])
  const groups = [...bySvc.entries()].filter(([, qs]) => qs.length > 1)
  if (!groups.length) return null
  return (
    <Card>
      <h3 className="text-lg font-semibold">Compare quotes</h3>
      <p className="text-sm text-muted">All prices shown including VAT. Cheapest isn’t always best — compare what’s included.</p>
      {groups.map(([svc, qs]) => {
        const inc = (q: Quote) => (q.includesVat ? q.amount : q.amount * 1.2)
        const sorted = [...qs].sort((a, b) => inc(a) - inc(b))
        return (
          <div key={svc} className="mt-3">
            <div className="text-sm font-medium">{svc}</div>
            <table className="tabular mt-1 w-full text-sm">
              <tbody>
                {sorted.map((q) => (
                  <tr key={q.id} className="border-t border-line">
                    <td className="py-1">{db.professionals.find((p) => p.id === q.professionalId)?.name}</td>
                    <td className="py-1 text-right font-medium">{gbp(inc(q))}</td>
                    <td className="py-1 pl-3 text-xs text-muted">{[q.includes && `✓ ${q.includes}`, q.excludes && `✗ ${q.excludes}`].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </Card>
  )
}
