import { store } from '../../data/store'
import type { DealAnalysis } from '../../domain/analysis'
import { nowIso } from '../../domain/factories'
import { INPUT_DEFS, SCENARIO_NOTES, type InputGroup, type Line, type ModelResult } from '../../domain/finance'
import { gbp, pct } from '../../domain/format'
import { SDLT_CHECKED, SDLT_SOURCE } from '../../domain/sdlt'
import type { Deal, InputKey, Provenance } from '../../domain/types'
import { Card, Disclosure, Ext, NumberInput, ProvenanceBadge } from '../../ui/kit'

const GROUPS: { id: InputGroup; title: string; blurb: string }[] = [
  { id: 'financing', title: 'Funding', blurb: 'How the purchase is paid for.' },
  { id: 'acquisition', title: 'Buying', blurb: 'Price and transaction costs.' },
  { id: 'lease', title: 'Lease extension', blurb: 'Premium and both sides’ professional costs.' },
  { id: 'improvements', title: 'Improvements', blurb: 'Works to add value.' },
  { id: 'holding', title: 'Holding costs', blurb: 'Costs while you own it before selling or letting.' },
  { id: 'exit', title: 'Selling', blurb: 'Sale after extension and works.' },
  { id: 'rental', title: 'Letting', blurb: 'Keeping it as a rental instead.' },
  { id: 'refinance', title: 'Refinancing', blurb: 'Remortgaging after works to release cash. Never guaranteed.' },
]

export function MoneyTab({ deal, a }: { deal: Deal; a: DealAnalysis }) {
  const { best, base, worst } = a
  const S = [best, base, worst]
  const row = (label: string, f: (m: ModelResult) => number | null, opts: { bold?: boolean; signed?: boolean } = {}) => (
    <tr className={`border-t border-line ${opts.bold ? 'font-semibold' : ''}`}>
      <td className="py-1.5 pr-3">{label}</td>
      {S.map((m) => {
        const v = f(m)
        return (
          <td key={m.scenario} className={`tabular py-1.5 text-right ${v != null && opts.signed && v < 0 ? 'text-danger' : ''} ${m.scenario === 'base' ? 'bg-forest-soft/50' : ''} px-2`}>
            {v == null ? '—' : gbp(v)}
          </td>
        )
      })}
    </tr>
  )
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-xl font-semibold">Scenarios</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th></th>
                <th className="px-2 py-1 text-right font-medium">Best</th>
                <th className="bg-forest-soft/50 px-2 py-1 text-right font-medium text-forest">Base</th>
                <th className="px-2 py-1 text-right font-medium">Worst</th>
              </tr>
            </thead>
            <tbody>
              {row('Cash you need', (m) => (m.cashComplete ? m.cashRequired : null), { bold: true })}
              {row('Headroom vs available cash', (m) => (m.cashComplete ? m.headroom : null), { signed: true })}
              {row('Total project cost', (m) => (m.cashComplete ? m.exit.totalProjectCost : null))}
              {row('Resale value', (m) => (m.exit.complete ? m.exit.resale : null))}
              {row('Profit before tax', (m) => (m.exit.complete ? m.exit.profitPreTax : null), { signed: true })}
              {row('Profit after tax (sale)', (m) => (m.exit.complete ? m.exit.netProfit : null), { bold: true, signed: true })}
              {row('Rental cash flow / month', (m) => (m.rental.complete ? m.rental.monthlyCashflow : null), { signed: true })}
              {row('Cash left in after refinance', (m) => (m.refinance.complete ? m.refinance.cashLeftIn : null))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-0.5 text-xs text-muted">
          <li>
            <b>Best:</b> {SCENARIO_NOTES.best}
          </li>
          <li>
            <b>Worst:</b> {SCENARIO_NOTES.worst}
          </li>
        </ul>
        {base.missing.length > 0 && <p className="mt-2 text-sm text-danger">Missing: {base.missing.map((m) => m.label).join(', ')}.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <InputGroupCard key={g.id} group={g} deal={deal} a={a} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold">Sensitivity</h3>
          <p className="text-sm text-muted">How the base-case profit after tax moves when one thing changes.</p>
          {base.exit.complete ? (
            <table className="tabular mt-3 w-full text-sm">
              <tbody>
                {a.sensitivity.rows.map((r) => (
                  <tr key={r.label} className="border-t border-line">
                    <td className="py-1.5">{r.label}</td>
                    <td className={`py-1.5 text-right ${r.delta < 0 ? 'text-danger' : 'text-ok'}`}>{gbp(r.delta, { sign: true })}</td>
                    <td className="py-1.5 text-right text-muted">{gbp(r.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-muted">Available once price, premium and resale value are known.</p>
          )}
        </Card>
        <Card>
          <h3 className="text-lg font-semibold">Stamp Duty</h3>
          <div className="tabular mt-1 font-display text-2xl font-semibold">{gbp(base.sdlt.tax)}</div>
          <table className="tabular mt-2 w-full text-sm">
            <tbody>
              {base.sdlt.lines.map((l) => (
                <tr key={l.from} className="border-t border-line">
                  <td className="py-1">
                    {gbp(l.from)} – {Number.isFinite(l.to) ? gbp(l.to) : 'above'}
                  </td>
                  <td className="py-1 text-right">{pct(l.rate, 0)}</td>
                  <td className="py-1 text-right">{gbp(l.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
            {base.sdlt.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Rates from <Ext href={SDLT_SOURCE}>GOV.UK</Ext>, checked {SDLT_CHECKED}. Your buyer circumstances are in Settings.
          </p>
        </Card>
      </div>
    </div>
  )
}

function linesFor(group: InputGroup, m: ModelResult): { lines: Line[]; total?: number; extra?: [string, number][] } {
  switch (group) {
    case 'acquisition':
      return { lines: m.acquisition.lines, total: m.acquisition.total, extra: [['Price', m.price]] }
    case 'lease':
      return { lines: m.lease.lines, total: m.lease.total }
    case 'improvements':
      return { lines: m.improvements.lines, total: m.improvements.total }
    case 'holding':
      return { lines: m.holding.lines, total: m.holding.total }
    case 'financing':
      return { lines: [], extra: [['Your cash in the purchase', m.deposit], ['Borrowed', m.loan]] }
    case 'exit':
      return { lines: [], extra: [['Resale', m.exit.resale], ['Agent fees', -m.exit.agentFees], ['Legal', -m.exit.sellingLegal], ['Project cost', -m.exit.totalProjectCost], ['Tax (illustrative)', -m.exit.tax], ['Profit after tax', m.exit.netProfit]] }
    case 'rental':
      return { lines: m.rental.costs, extra: [['Rent after voids (year)', m.rental.annualRentAfterVoids], ['Finance (year)', -m.rental.annualFinance], ['Cash flow (year)', m.rental.annualCashflow], ['Gross yield on price', m.rental.grossYield], ['Net yield on cost', m.rental.netYield]] }
    case 'refinance':
      return { lines: [], extra: [['New loan', m.refinance.newLoan], ['Repay existing debt', -m.refinance.repayExisting], ['Fees', -m.refinance.fees], ['Cash released', m.refinance.cashReleased], ['Cash left in the deal', m.refinance.cashLeftIn]] }
  }
}

const OWN_PROV: Provenance[] = ['estimate', 'quote', 'verified']

function InputGroupCard({ group, deal, a }: { group: (typeof GROUPS)[number]; deal: Deal; a: DealAnalysis }) {
  const defs = INPUT_DEFS.filter((d) => d.group === group.id)
  const res = a.base.inputs
  const out = linesFor(group.id, a.base)
  const set = (key: InputKey, value: number | undefined, provenance?: Provenance) =>
    store.updateDeal(deal.id, (d) => {
      if (value == null && !provenance) delete d.inputs[key]
      else d.inputs[key] = { ...d.inputs[key], value: value ?? d.inputs[key]?.value, provenance: provenance ?? d.inputs[key]?.provenance ?? 'estimate', updatedAt: nowIso() }
    })
  const assumptions = defs.filter((d) => res[d.key].provenance === 'assumption').length
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{group.title}</h3>
        {out.total != null && <span className="tabular font-medium">{gbp(out.total)}</span>}
      </div>
      <p className="text-xs text-muted">
        {group.blurb}
        {assumptions > 0 && ` ${assumptions} planning ${assumptions === 1 ? 'allowance' : 'allowances'} — replace with real figures.`}
      </p>
      <div className="mt-3 space-y-2">
        {defs.map((def) => {
          const r = res[def.key]
          const own = deal.inputs[def.key]
          const hasOwn = own?.value != null && own.provenance !== 'missing'
          const ph = r.value != null ? (def.unit === 'gbp' ? gbp(r.value) : `${+r.value.toFixed(2)}`) : 'Unknown'
          return (
            <div key={def.key} className="grid grid-cols-[1fr_6.5rem] items-center gap-x-2 gap-y-0.5 sm:grid-cols-[1fr_7rem_6.5rem]">
              <div className="min-w-0 text-sm" title={def.help}>
                {def.label}
                {def.unit !== 'gbp' && <span className="text-xs text-muted"> ({def.unit === 'pct' ? '%' : def.unit})</span>}
                <div className="truncate text-[11px] text-muted">
                  <ProvenanceBadge p={r.provenance} /> {r.source}
                </div>
              </div>
              <NumberInput value={hasOwn ? own!.value : undefined} placeholder={ph} onChange={(v) => set(def.key, v)} />
              <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                {hasOwn ? (
                  <>
                    <select aria-label="Figure basis" className="py-1 text-xs" value={own!.provenance} onChange={(e) => set(def.key, own!.value, e.target.value as Provenance)}>
                      {OWN_PROV.map((p) => (
                        <option key={p} value={p}>
                          {p === 'estimate' ? 'Estimate' : p === 'quote' ? 'Quote' : 'Verified'}
                        </option>
                      ))}
                    </select>
                    <button className="px-1 text-muted hover:text-danger" title="Reset to default" onClick={() => store.updateDeal(deal.id, (d) => delete d.inputs[def.key])}>
                      ✕
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted">default</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {(out.lines.length > 0 || out.extra) && (
        <div className="mt-3">
          <Disclosure summary="Base-case breakdown">
            <table className="tabular w-full text-sm">
              <tbody>
                {out.extra?.map(([l, v]) => (
                  <tr key={l} className="border-t border-line first:border-0">
                    <td className="py-1">{l}</td>
                    <td className={`py-1 text-right ${v < 0 ? 'text-muted' : ''}`}>{Math.abs(v) < 1 && v !== 0 ? pct(v) : gbp(v)}</td>
                  </tr>
                ))}
                {out.lines.map((l) => (
                  <tr key={l.label} className="border-t border-line first:border-0">
                    <td className="py-1">
                      {l.label} <ProvenanceBadge p={l.provenance} />
                    </td>
                    <td className="py-1 text-right">{gbp(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Disclosure>
        </div>
      )}
    </Card>
  )
}
