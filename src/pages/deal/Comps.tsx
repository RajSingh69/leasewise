import { useEffect, useState } from 'react'
import { store } from '../../data/store'
import type { DealAnalysis } from '../../domain/analysis'
import { CONFIDENCE_LABEL, leaseSetByUser, migrateComparable, type CompStatus, type Confidence, type EvaluatedComp } from '../../domain/comparables'
import { nowIso, uid } from '../../domain/factories'
import { gbp, shortDate } from '../../domain/format'
import type { Comparable, CompLeaseStatus, Deal, LeaseEvidenceSource, MatchConfidence } from '../../domain/types'
import { leaseStatusFromYears } from '../../domain/leaseTerm'
import { certificate, EPC_CERT_URL, epcAvailable, searchPostcode, type EpcCandidate } from '../../providers/epc'
import { fetchComparables, PPD_ATTRIBUTION } from '../../providers/landRegistry'
import { Button, Card, Disclosure, Empty, Ext, Field, Notice, NumberInput, ProvenanceBadge, go } from '../../ui/kit'

const CONF_STYLE: Record<Confidence, string> = {
  insufficient: 'bg-danger-soft text-danger',
  provisional: 'bg-warn-soft text-warn',
  low: 'bg-warn-soft text-warn',
  moderate: 'bg-info-soft text-info',
  good: 'bg-ok-soft text-ok',
}
const STATUS_STYLE: Record<CompStatus, string> = { selected: 'bg-ok-soft text-ok', reserve: 'bg-paper text-muted', excluded: 'bg-danger-soft text-danger' }
const STATUS_LABEL: Record<CompStatus, string> = { selected: 'Used', reserve: 'Not used', excluded: 'Excluded' }
const MATCH_LABEL: Record<MatchConfidence, string> = { high: 'EPC match', low: 'Uncertain EPC match', ambiguous: 'Ambiguous', none: 'No EPC match' }

const streetFrom = (address: string) =>
  address
    .split(',')
    .map((s) => s.trim())
    .find((s) => /\b(road|rd|street|st|avenue|ave|lane|close|way|drive|court|place|crescent|gardens|grove|hill|park)\b/i.test(s))
    ?.replace(/^\d+\s*/, '')

export function CompsTab({ deal, a }: { deal: Deal; a: DealAnalysis }) {
  const [postcode, setPostcode] = useState(deal.postcode ?? '')
  const [radius, setRadius] = useState(deal.comps?.radiusM && deal.comps.radiusM <= 2000 ? Math.round(deal.comps.radiusM / 400) * 400 || 800 : 800)
  const [years, setYears] = useState(deal.comps?.yearsBack || 5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const v = a.values
  const items = (deal.comps?.items ?? []).map(migrateComparable)

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetchComparables({ postcode, street: streetFrom(deal.address), radiusM: radius, yearsBack: years })
      // Keep the user's own checks on sales already reviewed, and their manual sales.
      const prev = new Map(items.map((c) => [c.id, c]))
      res.items = res.items.map((c) => {
        const p = prev.get(c.id)
        if (!p) return c
        const keepLease = leaseSetByUser(p) ? { leaseStatus: p.leaseStatus, leaseEvidence: p.leaseEvidence } : {}
        return { ...c, userChoice: p.userChoice, epcApproved: p.epcApproved, userAreaSqm: p.userAreaSqm, ...keepLease }
      })
      res.items.push(...items.filter((c) => c.source === 'manual'))
      store.updateDeal(deal.id, (d) => {
        d.comps = res
        if (!d.postcode) d.postcode = res.centrePostcode
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const updateComp = (id: string, patch: Partial<Comparable>) =>
    store.updateDeal(deal.id, (d) => {
      if (d.comps) d.comps.items = d.comps.items.map((c) => (c.id === id ? { ...migrateComparable(c), ...patch } : c))
    })

  const order: Record<CompStatus, number> = { selected: 0, reserve: 1, excluded: 2 }
  const rows = [...(v?.items ?? [])].sort((x, y) => order[x.status] - order[y.status] || y.score - x.score)
  const visible = showAll ? rows : rows.slice(0, 25)
  const ageDays = deal.comps ? (Date.now() - new Date(deal.comps.fetchedAt).getTime()) / 86400_000 : 0

  return (
    <div className="space-y-4">
      <ValueSummary deal={deal} a={a} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Postcode" className="w-32">
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="GU21 …" />
          </Field>
          <Field label="Radius" className="w-40">
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {[400, 800, 1200, 2000].map((r) => (
                <option key={r} value={r}>
                  {r} m ({(r / 1609).toFixed(1)} mi)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sales since" className="w-36">
            <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
              {[2, 3, 5, 8].map((y) => (
                <option key={y} value={y}>
                  Last {y} years
                </option>
              ))}
            </select>
          </Field>
          <Button onClick={run} disabled={busy || !postcode.trim()}>
            {busy ? 'Searching…' : items.length ? 'Refresh evidence' : 'Find sold prices'}
          </Button>
        </div>
        {err && (
          <div className="mt-3">
            <Notice tone="danger">{err}</Notice>
          </div>
        )}
        {deal.comps && (
          <div className="mt-3 space-y-1 text-xs">
            {(deal.comps.sources ?? []).map((s) => (
              <div key={s.id} className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.ok ? 'bg-ok' : 'bg-line'}`} />
                <span className={s.ok ? '' : 'text-muted'}>{s.message}</span>
              </div>
            ))}
            <div className={ageDays > 30 ? 'text-warn' : 'text-muted'}>
              {deal.comps.note} Fetched {shortDate(deal.comps.fetchedAt)}
              {ageDays > 30 && ' — over a month old, refresh before relying on it'}.
            </div>
          </div>
        )}
      </Card>

      <SubjectArea deal={deal} />

      {rows.length ? (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[980px] text-sm">
              <thead className="bg-paper text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Sale</th>
                  <th className="px-3 py-2 text-right font-medium">Distance</th>
                  <th className="px-3 py-2 text-right font-medium">Sold for</th>
                  <th className="px-3 py-2 text-right font-medium" title="Sale price restated to today with the UK House Price Index">In today’s money</th>
                  <th className="px-3 py-2 font-medium">Floor area</th>
                  <th className="px-3 py-2 text-right font-medium">£/m²</th>
                  <th className="px-3 py-2 font-medium">Lease</th>
                  <th className="px-3 py-2 text-right font-medium">Quality</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <CompRow key={e.c.id} e={e} onChange={(p) => updateComp(e.c.id, p)} />
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 25 && (
            <button className="w-full border-t border-line py-2 text-sm text-forest" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show first 25' : `Show all ${rows.length}`}
            </button>
          )}
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            {PPD_ATTRIBUTION} Land Registry doesn’t record lease length: mark a sale “Long” only after checking it (e.g. the sold listing or title register). EPC data © Crown copyright.
          </p>
        </Card>
      ) : (
        <Empty title="No comparable sales yet">Find sold prices for this postcode. Without them Leasewise can’t value the flat with a long lease or estimate the premium.</Empty>
      )}
      <ManualComp deal={deal} />
    </div>
  )
}

function ValueSummary({ deal, a }: { deal: Deal; a: DealAnalysis }) {
  const v = a.values
  const s = a.split
  const range = (r?: { low: number; high: number }) => (r ? `${gbp(r.low)} – ${gbp(r.high)}` : '—')
  const asking = deal.facts.askingPrice.value
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">What is it worth?</h2>
        {v && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CONF_STYLE[v.confidence]}`}>{CONFIDENCE_LABEL[v.confidence]}</span>}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs text-muted">With its current lease</div>
          <div className="tabular mt-0.5 text-lg font-semibold">{range(s.existing)}</div>
          <div className="text-xs text-muted">{s.existing ? `Indicative: long-lease value × typical short-lease discount.${asking ? ` Asking ${gbp(asking)}.` : ''}` : a.lease.years != null && a.lease.years >= 90 ? 'Lease is already long.' : 'Needs lease length and a long-lease value.'}</div>
        </div>
        <div>
          <div className="text-xs text-muted">With a long lease</div>
          <div className="tabular mt-0.5 text-lg font-semibold">{range(s.longLease)}</div>
          <div className="text-xs text-muted">
            {s.longLeaseSource === 'professional' ? 'Your professional valuation (used instead of comparables).' : s.longLeaseSource === 'own-estimate' ? 'Your own estimate.' : s.longLeaseSource === 'comparables' ? `From ${v?.selectedCount} comparable sales${v?.leaseBasis === 'unverified' ? ' — leases unverified, so provisional' : ''}.` : 'Not enough evidence yet.'}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Cost to extend the lease</div>
          {a.base.inputs.premium.value == null ? (
            <>
              <div className="mt-0.5 text-lg font-semibold">Unknown</div>
              <div className="text-xs text-muted">Premium needs a long-lease value. Fees alone are about {gbp(a.base.lease.total)}.</div>
            </>
          ) : (
            <div className="tabular mt-0.5 text-lg font-semibold">{a.base.lease.lines.length ? gbp(a.base.lease.total) : 'None planned'}</div>
          )}
          <button className="text-xs text-forest underline" onClick={() => go(`deals/${deal.id}/lease`)}>
            Premium + fees (base case)
          </button>
        </div>
        <div>
          <div className="text-xs text-muted">Value added by refurbishment</div>
          <div className="mt-0.5 text-lg font-semibold">Not assumed</div>
          <div className="text-xs text-muted">Comparable condition is unknown, so works are treated as bringing it up to a typical resale standard, not above it.</div>
        </div>
      </div>
      {v && v.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-warn">
          {v.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}
      {v && (
        <div className="mt-4">
          <Disclosure summary="How this valuation was calculated">
            <ol className="list-decimal space-y-1.5 pl-5">
              {v.explanation.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            <p className="mt-2 text-muted">Leasewise never treats a high valuation as proof of profit: weak evidence keeps the property at “More information needed” and the worst case uses the bottom of the range.</p>
          </Disclosure>
        </div>
      )}
    </Card>
  )
}

function CompRow({ e, onChange }: { e: EvaluatedComp; onChange: (p: Partial<Comparable>) => void }) {
  const c = e.c
  const epc = c.epc
  const factorPct = e.factor != null ? Math.round((e.factor - 1) * 100) : null
  return (
    <tr className={`border-t border-line align-top ${e.status === 'excluded' ? 'text-muted' : ''}`}>
      <td className="px-3 py-2">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
        <select
          aria-label="Override"
          className="mt-1 block w-24 py-0.5 text-xs"
          value={c.userChoice ?? 'auto'}
          onChange={(ev) => onChange({ userChoice: ev.target.value === 'auto' ? undefined : (ev.target.value as 'include' | 'exclude') })}
        >
          <option value="auto">Auto</option>
          <option value="include">Always use</option>
          <option value="exclude">Never use</option>
        </select>
      </td>
      <td className="max-w-[260px] px-3 py-2">
        <div>{c.address}</div>
        <div className="text-xs text-muted">
          {c.postcode} · {shortDate(c.date)}
          {c.newBuild && ' · new build'}
          {c.source === 'manual' && ' · added by you'}
        </div>
        <div className="text-xs text-muted">{e.statusReason}</div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Details & sources</summary>
          <ul className="mt-1 list-disc pl-4">
            {e.scoreReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {epc && epc.reasons.map((r) => <li key={r}>EPC: {r}</li>)}
          </ul>
          <div className="mt-1 space-x-3">
            {c.sourceUrl && <Ext href={c.sourceUrl}>Land Registry record</Ext>}
            {epc?.certificateNumber && <Ext href={EPC_CERT_URL(epc.certificateNumber)}>EPC {epc.energyBand ? `(${epc.energyBand})` : ''}</Ext>}
          </div>
        </details>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{c.samePostcode ? 'Same postcode' : c.distanceM != null ? `${(c.distanceM / 1609).toFixed(2)} mi` : '—'}</td>
      <td className="px-3 py-2 text-right">{gbp(c.price)}</td>
      <td className="px-3 py-2 text-right">
        <div className="font-medium">{gbp(e.adjusted)}</div>
        <div className="text-xs text-muted">{factorPct == null ? 'not adjusted' : `${factorPct >= 0 ? '+' : ''}${factorPct}% HPI`}</div>
      </td>
      <td className="px-3 py-2">
        {e.area ? (
          <span>
            {e.area} m²
            <div className="text-xs text-muted">{c.userAreaSqm ? 'verified by you' : epc?.confidence === 'high' ? 'EPC match' : 'EPC, approved by you'}</div>
          </span>
        ) : epc?.floorAreaSqm && epc.confidence === 'low' ? (
          <span>
            <span className="text-muted">{epc.floorAreaSqm} m²?</span>
            <div className="text-xs text-warn">{MATCH_LABEL.low}</div>
            <div className="text-[11px] text-muted">{epc.address}</div>
            <button className="text-xs text-forest underline" onClick={() => onChange({ epcApproved: true })}>
              Same flat — use it
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted">{epc ? MATCH_LABEL[epc.confidence] : 'Not verified'}</span>
        )}
        {(!e.area || c.userAreaSqm) && (
          <div className="mt-1 w-20">
            <NumberInput value={c.userAreaSqm} onChange={(x) => onChange({ userAreaSqm: x })} placeholder="m²" />
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right">{e.ppsm ? gbp(e.ppsm) : '—'}</td>
      <td className="px-3 py-2">
        <LeaseCell c={c} onChange={onChange} />
      </td>
      <td className="px-3 py-2 text-right">
        <span className={`rounded px-1.5 ${e.score >= 65 ? 'bg-ok-soft text-ok' : e.score >= 45 ? 'bg-warn-soft text-warn' : 'bg-paper'}`}>{e.score}</span>
      </td>
    </tr>
  )
}

const EVIDENCE_LABEL: Record<LeaseEvidenceSource, string> = {
  'registered-leases': 'HMLR Registered Leases',
  'title-register': 'Title register',
  'sold-listing': 'Sold listing',
  agent: 'Agent / seller',
  other: 'Other',
}

function LeaseCell({ c, onChange }: { c: Comparable; onChange: (p: Partial<Comparable>) => void }) {
  const ev = c.leaseEvidence
  const fromRegister = ev?.source === 'registered-leases'
  const setStatus = (s: CompLeaseStatus) =>
    onChange(
      s === 'unknown'
        ? { leaseStatus: 'unknown', leaseEvidence: fromRegister ? { ...ev!, approved: false } : undefined }
        : { leaseStatus: s, leaseEvidence: fromRegister && ev!.yearsAtSale != null ? { ...ev!, approved: true } : { source: ev && !fromRegister ? ev.source : 'sold-listing', checkedAt: nowIso() } },
    )
  return (
    <div className="w-36 space-y-1">
      <select aria-label="Lease status" className="py-0.5 text-xs" value={c.leaseStatus} onChange={(e) => setStatus(e.target.value as CompLeaseStatus)}>
        <option value="unknown">Unknown</option>
        <option value="long">Long (90+ yrs)</option>
        <option value="short">Short</option>
      </select>
      {c.leaseStatus !== 'unknown' && !fromRegister && (
        <select aria-label="How you checked" className="py-0.5 text-[11px]" value={ev?.source ?? 'sold-listing'} onChange={(e) => onChange({ leaseEvidence: { source: e.target.value as LeaseEvidenceSource, checkedAt: nowIso() } })}>
          {(['title-register', 'sold-listing', 'agent', 'other'] as const).map((s) => (
            <option key={s} value={s}>
              Checked via: {EVIDENCE_LABEL[s]}
            </option>
          ))}
        </select>
      )}
      {fromRegister && ev!.yearsAtSale != null && (
        <div className="text-[11px] leading-snug text-muted" title={ev!.termText}>
          {Math.round(ev!.yearsAtSale)} yrs left at sale (register{ev!.confidence === 'high' ? '' : ev!.approved ? ', you confirmed' : ', uncertain match'})
          {ev!.confidence !== 'high' && !ev!.approved && (
            <button className="block text-forest underline" onClick={() => onChange({ leaseStatus: leaseStatusFromYears(ev!.yearsAtSale!), leaseEvidence: { ...ev!, approved: true } })}>
              Same flat — use it
            </button>
          )}
        </div>
      )}
      {fromRegister && ev!.yearsAtSale == null && ev!.termText && <div className="text-[11px] text-warn">Term unreadable: “{ev!.termText}”</div>}
    </div>
  )
}

function SubjectArea({ deal }: { deal: Deal }) {
  const f = deal.facts.floorAreaSqm
  const [epcOn, setEpcOn] = useState(false)
  const [cands, setCands] = useState<EpcCandidate[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    epcAvailable().then(setEpcOn)
  }, [])
  const setArea = (value: number | undefined, source: string, provenance: 'verified' | 'estimate' = 'estimate') =>
    store.updateDeal(deal.id, (d) => (d.facts.floorAreaSqm = value == null ? { provenance: 'missing' } : { value, provenance, source, updatedAt: nowIso() }))
  const find = async () => {
    setMsg(null)
    try {
      const r = await searchPostcode(deal.postcode ?? '')
      setCands(r)
      if (!r.length) setMsg('No EPC certificates at this postcode.')
    } catch (e) {
      setMsg(String(e))
    }
  }
  const pick = async (c: EpcCandidate) => {
    const d = await certificate(c.id).catch(() => null)
    if (!d?.floorAreaSqm) return setMsg('That certificate has no floor area.')
    setArea(d.floorAreaSqm, `EPC ${c.id} (${c.lines.join(', ')})`, 'verified')
    setCands(null)
  }
  return (
    <Card tone="quiet">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">This flat’s floor area</h3>
          <p className="text-sm text-muted">With it, Leasewise values by price per m² instead of assuming the sales are similar in size.</p>
        </div>
        <div className="w-28">
          <NumberInput value={f.value} onChange={(x) => setArea(x, 'Entered by you')} placeholder="m²" />
        </div>
        {f.value != null && <ProvenanceBadge p={f.provenance} title={f.source} />}
        {epcOn && deal.postcode && (
          <Button kind="secondary" onClick={find}>
            Find on EPC register
          </Button>
        )}
      </div>
      {f.source && f.value != null && <p className="mt-1 text-xs text-muted">Source: {f.source}</p>}
      {msg && <p className="mt-2 text-sm text-warn">{msg}</p>}
      {cands && cands.length > 0 && (
        <div className="mt-3">
          <p className="text-sm">Pick this flat’s certificate (only if you’re sure it’s the same flat):</p>
          <ul className="mt-1 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white text-sm">
            {cands.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span>
                  {c.lines.join(', ')} <span className="text-xs text-muted">{c.band && `· EPC ${c.band}`} {c.registrationDate && `· ${shortDate(c.registrationDate)}`}</span>
                </span>
                <button className="text-xs text-forest underline" onClick={() => pick(c)}>
                  This one
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function ManualComp({ deal }: { deal: Deal }) {
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState<number>()
  const [date, setDate] = useState('')
  const [area, setArea] = useState<number>()
  const [lease, setLease] = useState<CompLeaseStatus>('unknown')
  const add = () => {
    if (!address || !price || !date) return
    const c: Comparable = { id: uid(), address, postcode: deal.postcode ?? '', price, date, propertyType: 'flat-maisonette', estate: 'leasehold', newBuild: false, sameStreet: false, samePostcode: false, leaseStatus: lease, userAreaSqm: area, userChoice: 'include', source: 'manual' }
    store.updateDeal(deal.id, (d) => {
      d.comps = d.comps ?? { fetchedAt: nowIso(), centrePostcode: d.postcode ?? '', radiusM: 0, yearsBack: 0, items: [] }
      d.comps.items.push(c)
    })
    setAddress('')
    setPrice(undefined)
    setDate('')
    setArea(undefined)
  }
  return (
    <Card tone="quiet">
      <h3 className="font-semibold">Add a completed sale you’ve verified</h3>
      <p className="text-sm text-muted">For example a long-lease sale in the same block from a sold-prices page. Completed sales only — never asking prices.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_6rem_8rem_auto]">
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" aria-label="Address" />
        <NumberInput value={price} onChange={setPrice} placeholder="Sold price £" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Sale date" />
        <NumberInput value={area} onChange={setArea} placeholder="m²" />
        <select value={lease} onChange={(e) => setLease(e.target.value as CompLeaseStatus)} aria-label="Lease">
          <option value="unknown">Lease unknown</option>
          <option value="long">Long lease (checked)</option>
          <option value="short">Short lease</option>
        </select>
        <Button kind="secondary" onClick={add} disabled={!address || !price || !date}>
          Add
        </Button>
      </div>
    </Card>
  )
}
