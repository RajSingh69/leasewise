import type { DealAnalysis } from '../../domain/analysis'
import { gbp } from '../../domain/format'
import type { Deal } from '../../domain/types'
import { Card, Notice, SeverityBadge, go } from '../../ui/kit'
import { buildGlance } from '../../domain/glance'
import { flagAction } from './Risks'

export function SummaryTab({ deal, a }: { deal: Deal; a: DealAnalysis }) {
  const { base, best, worst } = a
  const s = base.inputs
  const spendable = a.ctx.settings.capital - a.ctx.settings.reserve
  const parts = [
    { label: deal.financing === 'cash' ? 'Purchase (cash)' : 'Deposit', v: base.deposit, c: 'bg-forest' },
    { label: 'Buying costs', v: base.acquisition.total, c: 'bg-[#4f7d6c]' },
    { label: 'Lease extension', v: base.lease.total, c: 'bg-brass' },
    { label: 'Works', v: base.improvements.total, c: 'bg-[#c9a65a]' },
    { label: 'Holding', v: base.holding.total, c: 'bg-[#9aa7a1]' },
  ].filter((p) => p.v > 0)
  const total = parts.reduce((n, p) => n + p.v, 0) || 1
  const checks = a.risk.flags.filter((f) => f.missingInfo || f.severity === 'critical' || f.id === 'premium-unverified').slice(0, 6)

  const g = buildGlance(deal, a)
  const nextFlag = a.risk.flags.find((f) => f.id === g.next.flagId)
  const col = (title: string, items: { label: string; detail: string }[], tone: string, empty: string) => (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>{title}</div>
      {items.length ? (
        <ul className="mt-1.5 space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.label}>
              <span className="font-medium">{i.label}:</span> <span className="text-muted">{i.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-muted">{empty}</p>
      )}
    </div>
  )
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-5 md:grid-cols-3">
          {col('What we know', g.known, 'text-ok', 'Nothing checked yet — listing details are only the agent’s claims.')}
          {col('What is estimated', g.estimated, 'text-brass', 'Nothing estimated yet.')}
          {col('What is missing', g.missing, 'text-danger', 'No key gaps.')}
        </div>
        <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Can I afford it?</div>
            <p className={`mt-1 text-sm font-medium ${g.affordable.answer === 'yes' ? 'text-ok' : g.affordable.answer === 'no' ? 'text-danger' : 'text-ink'}`}>
              {g.affordable.answer === 'yes' ? 'Yes, on current figures. ' : g.affordable.answer === 'no' ? 'No. ' : 'Not known yet. '}
              <span className="font-normal text-muted">{g.affordable.text}</span>
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Do this next</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {nextFlag?.action ? (
                <button className="text-sm font-medium text-forest underline" onClick={() => flagAction(deal, nextFlag)}>
                  {g.next.title} →
                </button>
              ) : (
                <span className="text-sm font-medium">{g.next.title}</span>
              )}
              <span className="text-sm text-muted">— {g.next.why}</span>
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-brass">How much cash do I need?</div>
          {base.cashComplete ? (
            <>
              <div className={`tabular mt-1 font-display text-4xl font-semibold ${base.affordable ? '' : 'text-danger'}`}>{gbp(base.cashRequired)}</div>
              <div className="text-sm text-muted">
                Range {gbp(best.cashRequired)} – {gbp(worst.cashRequired)}. You have {gbp(spendable)} available.
              </div>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
                {parts.map((p) => (
                  <div key={p.label} className={p.c} style={{ width: `${(p.v / total) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                {parts.map((p) => (
                  <li key={p.label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${p.c}`} />
                      {p.label}
                    </span>
                    <span className="tabular">{gbp(p.v)}</span>
                  </li>
                ))}
              </ul>
              <p className={`mt-3 text-sm font-medium ${base.affordable ? 'text-ok' : 'text-danger'}`}>
                {base.affordable ? `Fits your budget with ${gbp(base.headroom)} to spare (base case).` : `${gbp(-base.headroom)} more than you have available.`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Can’t calculate yet — missing {base.missing.filter((m) => m.affects === 'cash required').map((m) => m.label.toLowerCase()).join(' and ')}.
            </p>
          )}
        </Card>

        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-brass">What could I make?</div>
          {base.exit.complete ? (
            <>
              <div className={`tabular mt-1 font-display text-4xl font-semibold ${base.exit.netProfit < 0 ? 'text-danger' : ''}`}>{gbp(base.exit.netProfit)}</div>
              <div className="text-sm text-muted">
                Base case after tax, selling with an extended lease. Best case {gbp(best.exit.netProfit)}.
              </div>
              {s.resaleValue.provenance === 'calculated' && a.values && (a.values.confidence === 'provisional' || a.values.confidence === 'low' || a.values.leaseBasis === 'unverified') && (
                <p className="mt-2 text-sm font-medium text-warn">Based on a weakly evidenced resale value — not a reliable profit figure until long-lease sales are verified.</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Needs a resale value. Fetch comparable sales or enter your own estimate.</p>
          )}
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">If let instead</dt>
              <dd className="tabular">{base.rental.complete ? `${gbp(base.rental.monthlyCashflow)} a month` : 'Add a rent estimate'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">If refinanced</dt>
              <dd className="tabular">{base.refinance.complete ? `${gbp(Math.max(0, base.refinance.cashLeftIn))} left in the deal` : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-brass">What could I lose?</div>
          {worst.exit.complete ? (
            <>
              <div className={`tabular mt-1 font-display text-4xl font-semibold ${worst.exit.netProfit < 0 ? 'text-danger' : ''}`}>{gbp(worst.exit.netProfit)}</div>
              <p className="text-sm text-muted">Worst case: resale 10% lower, premium at the top of the range, works 30% over, holding 50% longer.</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Unknown until the price, premium and resale value are in.</p>
          )}
          <p className="mt-3 text-sm text-muted">
            Money spent on surveys, valuations and legal work is lost if you don’t proceed — roughly {gbp((s.survey.value ?? 0) + (s.leaseValuer.value ?? 0) + (s.legalPackReview.value ?? 0))} on these figures.
          </p>
        </Card>

        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-brass">What needs checking?</div>
          {checks.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {checks.map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <SeverityBadge s={f.severity} />
                  <span>{f.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No critical gaps. Review the full risk list.</p>
          )}
          <button className="mt-3 text-sm font-medium text-forest underline" onClick={() => go(`deals/${deal.id}/risks`)}>
            All {a.risk.flags.length} checks →
          </button>
        </Card>
      </div>
      <Notice tone="info">
        <b>Lease:</b> {a.lease.headline}
      </Notice>
    </div>
  )
}
