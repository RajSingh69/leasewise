import type { DealAnalysis } from '../domain/analysis'
import { gbp } from '../domain/format'
import type { Deal } from '../domain/types'
import { StatusBadge } from './kit'

export function DealCard({ deal, a, compact }: { deal: Deal; a: DealAnalysis; compact?: boolean }) {
  const lease = a.lease.years
  return (
    <a href={`#/deals/${deal.id}`} className="block rounded-xl border border-line bg-card p-4 text-ink no-underline transition hover:border-forest/40 hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{deal.address}</div>
          <div className="mt-0.5 text-xs text-muted">
            {deal.facts.askingPrice.value ? gbp(deal.facts.askingPrice.value) : 'Price unknown'} · {lease != null ? `${lease} yrs lease` : 'lease unknown'}
            {deal.flags.auction && ' · Auction'}
            {deal.postcode && ` · ${deal.postcode}`}
          </div>
        </div>
        <StatusBadge s={a.risk.status} />
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted">Cash needed</div>
            <div className="tabular font-medium">{a.base.cashComplete ? gbp(a.base.cashRequired) : 'Unknown'}</div>
          </div>
          <div>
            <div className="text-muted">Base profit</div>
            <div className={`tabular font-medium ${a.base.exit.complete && a.base.exit.netProfit < 0 ? 'text-danger' : ''}`}>{a.base.exit.complete ? gbp(a.base.exit.netProfit) : 'Unknown'}</div>
          </div>
          <div>
            <div className="text-muted">Worst case</div>
            <div className={`tabular font-medium ${a.worst.exit.complete && a.worst.exit.netProfit < 0 ? 'text-danger' : ''}`}>{a.worst.exit.complete ? gbp(a.worst.exit.netProfit) : 'Unknown'}</div>
          </div>
        </div>
      )}
      <div className="mt-2 text-xs text-muted">{a.risk.reasons[0]}</div>
    </a>
  )
}
