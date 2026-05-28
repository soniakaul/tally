import type { Status } from '../state/payments'
import { cn, formatDate, relativeDueLabel } from '../lib/utils'

const styles: Record<Status, string> = {
  paid: 'bg-sage-soft text-sage',
  upcoming: 'bg-amber-soft text-ochre',
  overdue: 'bg-ink text-cream',
}

const dot: Record<Status, string> = {
  paid: 'bg-sage',
  upcoming: 'bg-amber',
  overdue: 'bg-cream',
}

export function StatusPill({
  status,
  dueDate,
  paidAt,
}: {
  status: Status
  dueDate: string
  paidAt?: string | null
}) {
  const label =
    status === 'paid'
      ? paidAt
        ? `paid ${formatDate(paidAt)}`
        : 'paid'
      : relativeDueLabel(dueDate)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        styles[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[status])} />
      {label}
    </span>
  )
}
