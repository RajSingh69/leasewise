import { useMemo } from 'react'
import { store, useDb } from '../data/store'
import { analyseDeal } from '../domain/analysis'
import { shortDate } from '../domain/format'
import { STATUS_EXPLAIN } from '../domain/risk'
import type { DealStage } from '../domain/types'
import { Button, Empty, StatusBadge, Tabs, go } from '../ui/kit'
import { SummaryTab } from './deal/Summary'
import { FactsTab } from './deal/Facts'
import { LeaseTab } from './deal/Lease'
import { CompsTab } from './deal/Comps'
import { MoneyTab } from './deal/Money'
import { RisksTab } from './deal/Risks'
import { LettersTab } from './deal/Letters'
import { TasksTab } from './deal/Tasks'

export type DealTab = 'summary' | 'facts' | 'lease' | 'comps' | 'money' | 'risks' | 'letters' | 'tasks'

const STAGES: { id: DealStage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'researching', label: 'Researching' },
  { id: 'viewing', label: 'Viewing' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'archived', label: 'Archived' },
]

export function DealPage({ id, tab = 'summary', sub }: { id: string; tab?: string; sub?: string }) {
  const db = useDb()
  const deal = db.deals.find((d) => d.id === id)
  const a = useMemo(() => (deal ? analyseDeal(deal, db.settings) : null), [deal, db.settings])
  if (!deal || !a) return <Empty title="Property not found">It may have been removed. <a href="#/deals">Back to My Deals</a></Empty>
  const t = tab as DealTab
  const setTab = (x: DealTab) => go(`deals/${id}/${x}`)
  const missingCount = a.risk.flags.filter((f) => f.missingInfo).length
  const openTasks = db.tasks.filter((x) => x.dealId === id && !x.done).length

  return (
    <div>
      <a href="#/deals" className="text-sm text-muted no-underline hover:text-ink">
        ← My deals
      </a>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold sm:text-3xl">{deal.address}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {deal.postcode && <span>{deal.postcode}</span>}
            {deal.sources.map((s, i) =>
              s.url ? (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.provider}
                  {s.ref ? ` #${s.ref}` : ''} ↗
                </a>
              ) : (
                <span key={i}>{s.provider}</span>
              ),
            )}
            <span>Last checked {shortDate(deal.lastChecked ?? deal.updatedAt)}</span>
            {(deal.priceHistory?.length ?? 0) > 1 && (
              <span title={deal.priceHistory!.map((p) => `${shortDate(p.date)}: £${p.price.toLocaleString('en-GB')} (${p.source})`).join('; ')}>
                Price history: {deal.priceHistory!.map((p) => `£${Math.round(p.price / 1000)}k`).join(' → ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={deal.stage} onChange={(e) => store.updateDeal(id, (d) => (d.stage = e.target.value as DealStage))} className="w-auto">
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Button kind="ghost" onClick={() => store.updateDeal(id, (d) => (d.lastChecked = new Date().toISOString()))} title="Record that you re-checked the listing today">
            Mark checked
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <StatusBadge s={a.risk.status} size="lg" />
        <span className="text-sm text-muted">{STATUS_EXPLAIN[a.risk.status]}</span>
      </div>
      <div className="mt-5">
        <Tabs<DealTab>
          value={t}
          onChange={setTab}
          tabs={[
            { id: 'summary', label: 'Summary' },
            { id: 'facts', label: 'Property facts' },
            { id: 'lease', label: 'Lease' },
            { id: 'comps', label: 'Comparables' },
            { id: 'money', label: 'Money' },
            { id: 'risks', label: 'Risks', count: missingCount },
            { id: 'letters', label: 'Letters' },
            { id: 'tasks', label: `Tasks${openTasks ? ` (${openTasks})` : ''}` },
          ]}
        />
      </div>
      <div className="mt-5">
        {t === 'summary' && <SummaryTab deal={deal} a={a} />}
        {t === 'facts' && <FactsTab deal={deal} />}
        {t === 'lease' && <LeaseTab deal={deal} a={a} />}
        {t === 'comps' && <CompsTab deal={deal} a={a} />}
        {t === 'money' && <MoneyTab deal={deal} a={a} />}
        {t === 'risks' && <RisksTab deal={deal} a={a} />}
        {t === 'letters' && <LettersTab deal={deal} initial={sub} />}
        {t === 'tasks' && <TasksTab deal={deal} />}
      </div>
    </div>
  )
}
