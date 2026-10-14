import { store } from '../../data/store'
import type { DealAnalysis } from '../../domain/analysis'
import { nowIso, uid } from '../../domain/factories'
import { STATUS_EXPLAIN, type RiskFlag } from '../../domain/risk'
import type { Deal } from '../../domain/types'
import { Button, Card, SeverityBadge, StatusBadge, go } from '../../ui/kit'

export function flagAction(deal: Deal, f: RiskFlag) {
  if (!f.action) return
  if (f.action.letter) return go(`deals/${deal.id}/letters/${f.action.letter}`)
  if (/comparable/i.test(f.action.label)) return go(`deals/${deal.id}/comps`)
  if (/price|lease details/i.test(f.action.label)) return go(`deals/${deal.id}/facts`)
}

export function RisksTab({ deal, a }: { deal: Deal; a: DealAnalysis }) {
  const tasks = store.db.tasks
  const addTask = (f: RiskFlag) =>
    store.upsert('tasks', { id: uid(), ownerId: deal.ownerId, dealId: deal.id, kind: 'task', title: `${f.title} — ${deal.address}`, done: false, createdAt: nowIso(), notes: f.why })
  return (
    <div className="space-y-4">
      <Card>
        <StatusBadge s={a.risk.status} size="lg" />
        <p className="mt-2 text-sm">{STATUS_EXPLAIN[a.risk.status]}</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted">
          {a.risk.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Leasewise never labels a property safe or guarantees a profit. Unknown costs always count against a property.</p>
      </Card>
      <ul className="space-y-2">
        {a.risk.flags.map((f) => {
          const tracked = tasks.some((t) => t.dealId === deal.id && t.title.startsWith(f.title))
          return (
            <li key={f.id}>
              <Card className="py-3 sm:py-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <SeverityBadge s={f.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{f.title}</div>
                    <p className="text-sm text-muted">{f.why}</p>
                  </div>
                  <div className="flex gap-2">
                    {f.action && (
                      <Button kind="secondary" onClick={() => flagAction(deal, f)}>
                        {f.action.label}
                      </Button>
                    )}
                    {f.severity !== 'info' && (
                      <Button kind="ghost" disabled={tracked} onClick={() => addTask(f)}>
                        {tracked ? 'In tasks' : 'Add task'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
