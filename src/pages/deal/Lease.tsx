import { store } from '../../data/store'
import type { DealAnalysis } from '../../domain/analysis'
import { nowIso } from '../../domain/factories'
import { gbp, pct } from '../../domain/format'
import { LEASE_SOURCES, LEGAL_CHECKED, LEGAL_REGISTER, type LegalStatus, type PremiumBreakdown } from '../../domain/lease'
import type { Deal, Provenance } from '../../domain/types'
import { Card, Disclosure, Ext, Field, Notice, NumberInput, ProvenanceBadge, go } from '../../ui/kit'
import { SubjectLeaseCheck } from '../../ui/LeaseRegister'

const LEGAL_STYLE: Record<LegalStatus, [string, string]> = {
  'in-force': ['In force', 'bg-ok-soft text-ok'],
  'not-commenced': ['Enacted, not in force', 'bg-warn-soft text-warn'],
  proposed: ['Proposed', 'bg-info-soft text-info'],
  uncertain: ['Uncertain', 'bg-[#eeeae0] text-muted'],
}

export function LeaseTab({ deal, a }: { deal: Deal; a: DealAnalysis }) {
  const { lease, premium } = a
  const own = deal.inputs.premium
  const specialist = own && own.value != null && (own.provenance === 'quote' || own.provenance === 'verified')

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <h2 className="text-xl font-semibold">Lease position</h2>
          <p className="mt-2">{lease.headline}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Years remaining today</dt>
              <dd className="tabular text-lg font-medium">
                {lease.years ?? 'Unknown'} {deal.facts.leaseYears.value != null && <ProvenanceBadge p={deal.facts.leaseYears.provenance} />}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Marriage value</dt>
              <dd className="text-lg font-medium">{lease.marriageValueApplies == null ? 'Unknown' : lease.marriageValueApplies ? 'Applies' : 'Does not apply'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Mortgageability</dt>
              <dd>{lease.mortgageNote}</dd>
            </div>
          </dl>
          {deal.facts.leaseYears.provenance !== 'verified' && <SubjectLeaseCheck deal={deal} />}
          {lease.years != null && lease.years > 80 && lease.years < 82 && (
            <div className="mt-3">
              <Notice tone="warn">This lease is close to 80 years. Once it falls to 80, marriage value is added to the premium — timing matters.</Notice>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Extension premium</h2>
            {specialist ? <ProvenanceBadge p={own!.provenance} /> : <span className="text-xs font-medium text-warn">Indicative estimate</span>}
          </div>
          {specialist ? (
            <p className="mt-2">
              Using your specialist figure of <b>{gbp(own!.value)}</b>
              {own!.source ? ` from ${own!.source}` : ''}. The model adds 15% in the worst case.
            </p>
          ) : premium?.ok ? (
            <>
              <div className="tabular mt-2 font-display text-3xl font-semibold">
                {gbp(premium.low!.premium)} – {gbp(premium.high!.premium)}
              </div>
              <p className="text-sm text-muted">Central figure {gbp(premium.base!.premium)}. Not a quotation: a specialist RICS valuation is required.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="tabular w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 font-medium"></th>
                      <th className="py-1 text-right font-medium">Low</th>
                      <th className="py-1 text-right font-medium">Central</th>
                      <th className="py-1 text-right font-medium">High</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Loss of ground rent (term)', (p: PremiumBreakdown) => gbp(p.term)],
                        ['Loss of reversion', (p: PremiumBreakdown) => gbp(p.reversion - p.newReversion)],
                        ['Marriage value (50%)', (p: PremiumBreakdown) => gbp(p.marriageValue)],
                        ['Relativity used', (p: PremiumBreakdown) => pct(p.relativity)],
                        ['Deferment / capitalisation', (p: PremiumBreakdown) => `${pct(p.deferment, 2)} / ${pct(p.capitalisation)}`],
                      ] as const
                    ).map(([l, f]) => (
                      <tr key={l} className="border-t border-line">
                        <td className="py-1.5">{l}</td>
                        <td className="py-1.5 text-right">{f(premium.low!)}</td>
                        <td className="py-1.5 text-right">{f(premium.base!)}</td>
                        <td className="py-1.5 text-right">{f(premium.high!)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-ink font-semibold">
                      <td className="py-1.5">Premium</td>
                      <td className="py-1.5 text-right">{gbp(premium.low!.premium)}</td>
                      <td className="py-1.5 text-right">{gbp(premium.base!.premium)}</td>
                      <td className="py-1.5 text-right">{gbp(premium.high!.premium)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <Disclosure summary="How this was calculated">
                  <ul className="list-disc space-y-1 pl-5">
                    {premium.assumptions.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <p className="mt-2">Compare with the official {LEASE_SOURCES.map((s, i) => <span key={s.url}>{i > 0 && ' and '}<Ext href={s.url}>{s.label}</Ext></span>)}.</p>
                </Disclosure>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {premium?.reason ??
                (lease.years == null ? 'Add the lease length first.' : lease.years >= 90 ? 'No extension is modelled at 90+ years.' : 'Needs a long-lease value: ')}
              {lease.years != null && lease.years < 90 && !premium && (
                <button className="font-medium text-forest underline" onClick={() => go(`deals/${deal.id}/comps`)}>
                  fetch comparable sales
                </button>
              )}
            </p>
          )}
          <div className="mt-4 rounded-lg bg-paper p-3">
            <div className="text-sm font-medium">Have a specialist figure?</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_1fr]">
              <Field label="Premium (£)">
                <NumberInput
                  value={specialist ? own!.value : undefined}
                  onChange={(v) =>
                    store.updateDeal(deal.id, (d) => {
                      if (v == null) delete d.inputs.premium
                      else d.inputs.premium = { value: v, provenance: d.inputs.premium?.provenance === 'verified' ? 'verified' : 'quote', source: d.inputs.premium?.source, updatedAt: nowIso() }
                    })
                  }
                />
              </Field>
              <Field label="Basis">
                <select
                  value={own?.provenance === 'verified' ? 'verified' : 'quote'}
                  onChange={(e) => store.updateDeal(deal.id, (d) => d.inputs.premium && (d.inputs.premium.provenance = e.target.value as Provenance))}
                >
                  <option value="quote">Valuer’s estimate</option>
                  <option value="verified">Agreed / offered</option>
                </select>
              </Field>
              <Field label="From">
                <input defaultValue={own?.source} placeholder="Valuer or freeholder" onBlur={(e) => store.updateDeal(deal.id, (d) => d.inputs.premium && (d.inputs.premium.source = e.target.value))} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold">Extension routes</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
            {lease.routes.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">{lease.timeline}</p>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <h2 className="text-xl font-semibold">The law today</h2>
          <p className="mt-1 text-xs text-muted">England & Wales. Last reviewed {LEGAL_CHECKED}. Law changes — confirm with a solicitor.</p>
          <ul className="mt-3 space-y-3">
            {LEGAL_REGISTER.map((l) => (
              <li key={l.id} className="text-sm">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${LEGAL_STYLE[l.status][1]}`}>{LEGAL_STYLE[l.status][0]}</span>
                <div className="mt-1 font-medium">{l.title}</div>
                <p className="text-muted">{l.summary}</p>
                <p className="mt-0.5">{l.impact}</p>
                <div className="mt-0.5 text-xs">
                  <Ext href={l.source.url}>{l.source.label}</Ext>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
