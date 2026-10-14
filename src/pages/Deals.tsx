import { useState } from 'react'
import { useDb } from '../data/store'
import { STATUS_LABEL, type DealStatus } from '../domain/risk'
import { Empty, PageHead } from '../ui/kit'
import { DealCard } from '../ui/DealCard'
import { useAnalyses } from '../ui/useAnalysis'

const FILTERS: (DealStatus | 'all' | 'rejected')[] = ['all', 'worth-investigating', 'more-info', 'high-risk', 'unaffordable', 'rejected']

export function DealsPage() {
  const db = useDb()
  const analyses = useAnalyses(db)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const list = db.deals
    .filter((d) => (filter === 'rejected' ? d.stage === 'rejected' || d.stage === 'archived' : d.stage !== 'rejected' && d.stage !== 'archived'))
    .filter((d) => filter === 'all' || filter === 'rejected' || analyses.get(d.id)!.risk.status === filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <div>
      <PageHead eyebrow="Step 2 · Assess" title="My deals">
        Every property has a live cost model, lease analysis and risk review. Statuses are deliberately cautious.
      </PageHead>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-sm ${filter === f ? 'border-forest bg-forest text-white' : 'border-line bg-card text-ink hover:border-forest/40'}`}>
            {f === 'all' ? 'All active' : f === 'rejected' ? 'Rejected / archived' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((d) => (
            <DealCard key={d.id} deal={d} a={analyses.get(d.id)!} />
          ))}
        </div>
      ) : (
        <Empty title={db.deals.length ? 'No properties in this view' : 'No properties yet'}>
          {db.deals.length ? 'Try another filter.' : <a href="#/discover">Add your first listing from Discover →</a>}
        </Empty>
      )}
    </div>
  )
}
