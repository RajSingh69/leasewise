import { useDb } from '../data/store'
import { gbp, shortDate } from '../domain/format'
import { today } from '../domain/factories'
import { Card, Empty, SeverityBadge, Stat } from '../ui/kit'
import { DealCard } from '../ui/DealCard'
import { useAnalyses } from '../ui/useAnalysis'

export function HomePage() {
  const db = useDb()
  const analyses = useAnalyses(db)
  const s = db.settings
  const active = db.deals.filter((d) => d.stage !== 'rejected' && d.stage !== 'archived')
  const withA = active.map((d) => ({ d, a: analyses.get(d.id)! }))
  const promising = withA
    .filter((x) => x.a.risk.status === 'worth-investigating')
    .sort((x, y) => y.a.base.exit.netProfit - x.a.base.exit.netProfit)
  const investigate = withA.filter((x) => x.a.risk.status === 'more-info')
  const newCount = active.filter((d) => d.stage === 'new').length
  const t = today()
  const horizon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  const upcoming = [
    ...db.tasks.filter((x) => !x.done && x.due && x.due >= t && x.due <= horizon).map((x) => ({ date: x.due!, title: x.title, kind: x.kind, dealId: x.dealId })),
    ...active.filter((d) => d.flags.auctionDate && d.flags.auctionDate >= t && d.flags.auctionDate <= horizon).map((d) => ({ date: d.flags.auctionDate!, title: `Auction: ${d.address}`, kind: 'auction' as const, dealId: d.id })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const overdue = db.tasks.filter((x) => !x.done && x.due && x.due < t).length
  const outstanding = db.tasks.filter((x) => !x.done).length + withA.reduce((n, x) => n + x.a.risk.flags.filter((f) => f.missingInfo).length, 0)
  const warnings = withA
    .flatMap((x) => x.a.risk.flags.filter((f) => f.severity === 'critical' && !f.missingInfo).map((f) => ({ f, d: x.d })))
    .slice(0, 5)
  const spendable = s.capital - s.reserve

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold sm:text-4xl">Your property research desk</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Find short-lease flats, see what they would really cost, and know what to check next. Leasewise flags what it doesn’t know rather than guessing.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Available to invest" value={gbp(spendable)} sub={`${gbp(s.capital)} capital, ${gbp(s.reserve)} kept in reserve`} />
          <Stat label="Search area" value={<span className="text-xl sm:text-2xl">{s.location}</span>} sub={`${s.radiusMiles} mile radius · ${s.postcode}`} />
          <Stat label="New properties" value={newCount} sub={`${active.length} being tracked`} />
          <Stat label="Outstanding actions" value={outstanding} sub={overdue ? <span className="text-danger">{overdue} overdue</span> : 'Including missing information'} tone={overdue ? 'danger' : undefined} />
        </div>
      </Card>

      {active.length === 0 ? (
        <Card>
          <h2 className="text-2xl font-semibold">Start here</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              ['Find a flat', 'Search the portals for short-lease flats near Woking, then paste any interesting listing into Leasewise.', '#/discover', 'Go to Discover'],
              ['Let Leasewise research it', 'It pulls real sold prices from HM Land Registry, estimates the lease-extension cost and builds the full budget.', null, null],
              ['Act on the gaps', 'Next Actions lists what is still unknown, with ready-made emails to agents, solicitors and surveyors.', '#/actions', 'See Next Actions'],
            ].map(([t, body, href, cta], i) => (
              <li key={t} className="rounded-lg bg-paper p-4">
                <div className="font-display text-3xl text-brass">{i + 1}</div>
                <div className="mt-1 font-medium">{t}</div>
                <p className="mt-1 text-sm text-muted">{body}</p>
                {href && (
                  <a className="mt-2 inline-block text-sm font-medium" href={href}>
                    {cta} →
                  </a>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-3 lg:col-span-2">
            <h2 className="text-xl font-semibold">Most promising</h2>
            {promising.length ? (
              promising.slice(0, 4).map(({ d, a }) => <DealCard key={d.id} deal={d} a={a} />)
            ) : (
              <Empty title="Nothing has cleared the checks yet">
                That is normal. Most short-lease flats need more information first, and many won’t fit a {gbp(spendable)} budget.
              </Empty>
            )}
            {investigate.length > 0 && (
              <>
                <h2 className="pt-3 text-xl font-semibold">Needs investigating</h2>
                {investigate.slice(0, 4).map(({ d, a }) => (
                  <DealCard key={d.id} deal={d} a={a} compact />
                ))}
              </>
            )}
          </section>
          <aside className="space-y-6">
            <Card>
              <h3 className="text-lg font-semibold">Next 30 days</h3>
              {upcoming.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {upcoming.slice(0, 6).map((u, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="tabular w-16 shrink-0 text-xs text-muted">{shortDate(u.date).replace(/ \d{4}$/, '')}</span>
                      <a href={u.dealId ? `#/deals/${u.dealId}` : '#/actions'} className="text-ink">
                        {u.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No viewings, auctions or deadlines booked.</p>
              )}
              <a href="#/actions" className="mt-3 inline-block text-sm font-medium">
                All actions →
              </a>
            </Card>
            {warnings.length > 0 && (
              <Card>
                <h3 className="text-lg font-semibold">Important warnings</h3>
                <ul className="mt-3 space-y-3 text-sm">
                  {warnings.map(({ f, d }) => (
                    <li key={d.id + f.id}>
                      <SeverityBadge s={f.severity} /> <span className="font-medium">{f.title}</span>
                      <a href={`#/deals/${d.id}/risks`} className="block truncate text-xs text-muted">
                        {d.address}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
