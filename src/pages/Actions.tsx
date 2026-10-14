import { useState } from 'react'
import { store, useDb } from '../data/store'
import { nowIso, today, uid } from '../domain/factories'
import { shortDate } from '../domain/format'
import type { Deal, Task, TaskKind } from '../domain/types'
import { Button, Card, Empty, Field, PageHead, SeverityBadge } from '../ui/kit'
import { useAnalyses } from '../ui/useAnalysis'
import { flagAction } from './deal/Risks'

const KIND_LABEL: Record<TaskKind, string> = { task: 'Task', viewing: 'Viewing', auction: 'Auction', deadline: 'Deadline', 'follow-up': 'Follow-up' }

export function ActionsPage() {
  const db = useDb()
  const analyses = useAnalyses(db)
  const active = db.deals.filter((d) => d.stage !== 'rejected' && d.stage !== 'archived')
  const open = db.tasks.filter((t) => !t.done)
  const done = db.tasks.filter((t) => t.done).slice(-10)
  const suggestions = active.flatMap((d) =>
    analyses
      .get(d.id)!
      .risk.flags.filter((f) => f.action && (f.missingInfo || f.severity === 'critical' || f.severity === 'high'))
      .slice(0, 3)
      .map((f) => ({ d, f })),
  )
  const t = today()
  const auctions = active.filter((d) => d.flags.auctionDate && d.flags.auctionDate >= t).sort((a, b) => a.flags.auctionDate!.localeCompare(b.flags.auctionDate!))

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Step 3 · Act" title="Next actions">
        Your tasks, viewings and deadlines, plus what Leasewise suggests doing next for each property.
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-xl font-semibold">Your list</h2>
            <TaskList tasks={open} deals={db.deals} empty="No open tasks. Add one, or use a suggestion below." />
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">Suggested next steps</h2>
            {suggestions.length ? (
              <ul className="space-y-2">
                {suggestions.map(({ d, f }) => (
                  <li key={d.id + f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
                    <SeverityBadge s={f.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{f.action!.label}</div>
                      <a href={`#/deals/${d.id}`} className="block truncate text-xs text-muted">
                        {d.address} · {f.title}
                      </a>
                    </div>
                    <Button kind="secondary" onClick={() => flagAction(d, f)}>
                      Do it
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Nothing suggested">Add properties in Discover and Leasewise will suggest what to find out first.</Empty>
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold">Add to your list</h3>
            <TaskForm />
          </Card>
          {auctions.length > 0 && (
            <Card>
              <h3 className="text-lg font-semibold">Upcoming auctions</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {auctions.map((d) => (
                  <li key={d.id}>
                    <span className="tabular text-muted">{shortDate(d.flags.auctionDate)}</span> · <a href={`#/deals/${d.id}`}>{d.address}</a>
                    {!d.flags.legalPackReviewed && <div className="text-xs text-danger">Legal pack not reviewed</div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {done.length > 0 && (
            <Card tone="quiet">
              <h3 className="font-semibold">Recently done</h3>
              <TaskList tasks={done} deals={db.deals} compact />
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

export function TaskList({ tasks, deals, empty, compact }: { tasks: Task[]; deals: Deal[]; empty?: string; compact?: boolean }) {
  const t = today()
  const sorted = [...tasks].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  if (!sorted.length) return empty ? <Empty title={empty} /> : null
  return (
    <ul className={compact ? 'mt-2 space-y-1 text-sm' : 'space-y-2'}>
      {sorted.map((task) => {
        const deal = deals.find((d) => d.id === task.dealId)
        const overdue = !task.done && task.due && task.due < t
        return (
          <li key={task.id} className={compact ? 'flex items-center gap-2 text-muted line-through' : 'flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3'}>
            <input type="checkbox" className="mt-1 w-auto" checked={task.done} onChange={(e) => store.upsert('tasks', { ...task, done: e.target.checked })} aria-label="Done" />
            <div className="min-w-0 flex-1">
              <div className={compact ? '' : 'text-sm font-medium'}>{task.title}</div>
              {!compact && (
                <div className="text-xs text-muted">
                  {KIND_LABEL[task.kind]}
                  {task.due && <span className={overdue ? 'font-medium text-danger' : ''}> · {overdue ? 'overdue, ' : ''}due {shortDate(task.due)}</span>}
                  {deal && (
                    <>
                      {' · '}
                      <a href={`#/deals/${deal.id}`}>{deal.address}</a>
                    </>
                  )}
                </div>
              )}
              {!compact && task.notes && <div className="mt-0.5 text-xs text-muted">{task.notes}</div>}
            </div>
            {!compact && (
              <button className="text-sm text-muted hover:text-danger" title="Delete" onClick={() => store.remove('tasks', task.id)}>
                ✕
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function TaskForm({ dealId }: { dealId?: string }) {
  const db = useDb()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('task')
  const [due, setDue] = useState('')
  const [deal, setDeal] = useState(dealId ?? '')
  const add = () => {
    if (!title.trim()) return
    store.upsert('tasks', { id: uid(), ownerId: db.settings.ownerId, dealId: deal || undefined, kind, title: title.trim(), due: due || undefined, done: false, createdAt: nowIso() })
    setTitle('')
    setDue('')
  }
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <Field label="What">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. View the flat with the agent" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      {!dealId && (
        <Field label="Property">
          <select value={deal} onChange={(e) => setDeal(e.target.value)}>
            <option value="">— none —</option>
            {db.deals
              .filter((d) => d.stage !== 'rejected' && d.stage !== 'archived')
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.address}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Button type="submit" disabled={!title.trim()}>
        Add
      </Button>
    </form>
  )
}
