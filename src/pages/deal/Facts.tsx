import { store } from '../../data/store'
import { nowIso } from '../../domain/factories'
import { normalisePostcode } from '../../domain/listing'
import type { Deal, DealFacts, DealFlags, FinancingType, Provenance, TriState } from '../../domain/types'
import { Button, Card, Field, NumberInput, ProvenanceBadge, go } from '../../ui/kit'

const FACT_PROV: Provenance[] = ['agent', 'verified', 'estimate', 'missing']
const NUM_FACTS: { key: keyof DealFacts; label: string; unit?: string }[] = [
  { key: 'askingPrice', label: 'Asking price', unit: '£' },
  { key: 'leaseYears', label: 'Lease remaining', unit: 'years' },
  { key: 'groundRent', label: 'Ground rent', unit: '£ / year' },
  { key: 'serviceCharge', label: 'Service charge', unit: '£ / year' },
  { key: 'bedrooms', label: 'Bedrooms' },
  { key: 'floorAreaSqm', label: 'Floor area', unit: 'm²' },
]

export function FactsTab({ deal }: { deal: Deal }) {
  const upd = (fn: (d: Deal) => void) => store.updateDeal(deal.id, fn)
  const setFlag = <K extends keyof DealFlags>(k: K, v: DealFlags[K]) => upd((d) => (d.flags[k] = v))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-xl font-semibold">Key facts</h2>
        <p className="mt-1 text-sm text-muted">Mark a figure “Verified” only once you’ve seen it in the lease, title register, accounts or other documents.</p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Address" className="col-span-2">
              <input defaultValue={deal.address} onBlur={(e) => e.target.value.trim() && upd((d) => (d.address = e.target.value.trim()))} />
            </Field>
            <Field label="Postcode">
              <input defaultValue={deal.postcode} onBlur={(e) => upd((d) => (d.postcode = normalisePostcode(e.target.value) ?? (e.target.value.trim() || undefined)))} />
            </Field>
            <Field label="Property type">
              <input defaultValue={deal.facts.propertyType.value} onBlur={(e) => upd((d) => (d.facts.propertyType = { value: e.target.value, provenance: 'estimate' }))} />
            </Field>
          </div>
          {NUM_FACTS.map(({ key, label, unit }) => {
            const f = deal.facts[key]
            return (
              <div key={key} className="grid grid-cols-[1fr_7.5rem] items-end gap-2 sm:grid-cols-[1fr_8rem_9rem]">
                <Field label={label} hint={unit}>
                  <NumberInput
                    value={f.value as number | undefined}
                    onChange={(v) =>
                      upd((d) => {
                        const prev = d.facts[key]
                        ;(d.facts[key] as typeof prev) = { ...prev, value: v as never, provenance: v == null ? 'missing' : prev.provenance === 'missing' ? 'estimate' : prev.provenance, updatedAt: nowIso() }
                        if (key === 'leaseYears' && v != null) d.leaseYearsAsAt = nowIso().slice(0, 10)
                      })
                    }
                  />
                </Field>
                <select
                  aria-label={`${label} source`}
                  value={f.provenance}
                  onChange={(e) => upd((d) => ((d.facts[key] as typeof f) = { ...d.facts[key], provenance: e.target.value as Provenance } as typeof f))}
                >
                  {FACT_PROV.map((p) => (
                    <option key={p} value={p}>
                      {p === 'agent' ? 'Agent claim' : p === 'verified' ? 'Verified' : p === 'estimate' ? 'My estimate' : 'Missing'}
                    </option>
                  ))}
                </select>
                <div className="col-span-2 pb-2 text-xs text-muted sm:col-span-1">
                  <ProvenanceBadge p={f.provenance} /> {f.source}
                  {key === 'leaseYears' && deal.leaseYearsAsAt && <div>as at {deal.leaseYearsAsAt}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <h2 className="text-xl font-semibold">Restrictions & features</h2>
          <div className="mt-3 space-y-3 text-sm">
            <Tri label="Retirement / age restricted" v={deal.flags.retirement} on={(v) => setFlag('retirement', v)} />
            <Tri label="Shared ownership" v={deal.flags.sharedOwnership} on={(v) => setFlag('sharedOwnership', v)} />
            <Tri label="Unusual lease or title terms" v={deal.flags.unusualLeaseTerms} on={(v) => setFlag('unusualLeaseTerms', v)} />
            <Field label="Ground rent review">
              <select value={deal.flags.groundRentReview} onChange={(e) => setFlag('groundRentReview', e.target.value as DealFlags['groundRentReview'])}>
                <option value="unknown">Unknown</option>
                <option value="fixed">Fixed</option>
                <option value="doubling">Doubling</option>
                <option value="rpi">RPI / index-linked</option>
                <option value="other">Other review</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['auction', 'Sold at auction'],
                  ['legalPackReviewed', 'Legal pack reviewed'],
                  ['priceReduced', 'Price reduced'],
                  ['refurbOpportunity', 'Needs refurbishment'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" className="w-auto" checked={deal.flags[k]} onChange={(e) => setFlag(k, e.target.checked)} /> {l}
                </label>
              ))}
            </div>
            {deal.flags.auction && (
              <Field label="Auction date">
                <input type="date" value={deal.flags.auctionDate ?? ''} onChange={(e) => setFlag('auctionDate', e.target.value || undefined)} />
              </Field>
            )}
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Funding</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['cash', 'mortgage', 'bridging'] as FinancingType[]).map((f) => (
              <button key={f} onClick={() => upd((d) => (d.financing = f))} className={`rounded-lg border px-3 py-2 text-sm capitalize ${deal.financing === f ? 'border-forest bg-forest-soft font-medium text-forest' : 'border-line bg-white'}`}>
                {f}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Short leases are often unmortgageable, so cash is the cautious default. Change it to model a mortgage or bridging loan.</p>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Notes</h2>
          <textarea rows={6} className="mt-3" defaultValue={deal.notes} onBlur={(e) => upd((d) => (d.notes = e.target.value))} />
          <div className="mt-3 flex justify-end">
            <Button
              kind="danger"
              onClick={() => {
                if (confirm('Remove this property and all its research?')) {
                  store.remove('deals', deal.id)
                  go('deals')
                }
              }}
            >
              Remove property
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Tri({ label, v, on }: { label: string; v: TriState; on: (v: TriState) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-line">
        {(['yes', 'no', 'unknown'] as TriState[]).map((o) => (
          <button key={o} onClick={() => on(o)} className={`px-2.5 py-1 text-xs capitalize ${v === o ? (o === 'yes' ? 'bg-danger-soft font-medium text-danger' : o === 'no' ? 'bg-ok-soft font-medium text-ok' : 'bg-paper font-medium') : 'bg-white text-muted'}`}>
            {o === 'unknown' ? 'Not sure' : o}
          </button>
        ))}
      </div>
    </div>
  )
}
