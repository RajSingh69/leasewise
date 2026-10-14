import { useDb } from '../../data/store'
import type { Deal } from '../../domain/types'
import { Card } from '../../ui/kit'
import { TaskForm, TaskList } from '../Actions'

export function TasksTab({ deal }: { deal: Deal }) {
  const db = useDb()
  const tasks = db.tasks.filter((t) => t.dealId === deal.id)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <TaskList tasks={tasks} deals={db.deals} empty="No tasks for this property yet." />
      </div>
      <Card>
        <h3 className="text-lg font-semibold">Add a task, viewing or deadline</h3>
        <TaskForm dealId={deal.id} />
      </Card>
    </div>
  )
}
