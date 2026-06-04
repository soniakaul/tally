import { useEffect, useState } from 'react'
import type { Payment } from '../state/payments'
import type { Person } from '../state/household'
import type { Country } from '../state/country'
import type { Item } from '../state/item'
import { findItem } from '../state/item'
import { findCountry } from '../state/country'
import { cn, formatCurrency, formatDate, formatMonthYear } from '../lib/utils'
import { StatusPill } from './StatusPill'

const PAGE_SIZE = 25

function displayPerson(person: string, people: Person[]): string {
  if (person === 'both') return people.length > 2 ? 'Shared' : 'Both'
  const match = people.find((p) => p.id === person)
  return match?.name || '—'
}

export function PaymentsTable({
  payments,
  people,
  countries,
  items,
  onEditPayment,
  onTogglePaid,
}: {
  payments: Payment[]
  people: Person[]
  countries: Country[]
  items: Item[]
  onEditPayment?: (payment: Payment) => void
  onTogglePaid?: (payment: Payment) => void
}) {
  const [page, setPage] = useState(1)

  const total = payments.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [total])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const start = (page - 1) * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, total)
  const pageRows = payments.slice(start, end)

  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-card/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-edge text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-5 py-3 font-medium">Payment</th>
              <th className="px-5 py-3 font-medium">Item</th>
              <th className="px-5 py-3 font-medium">For</th>
              <th className="px-5 py-3 font-medium text-right">Amount</th>
              <th className="px-5 py-3 font-medium">Due</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => {
              const item = findItem(items, p.item_id)
              const country = item
                ? findCountry(countries, item.country_id)
                : undefined
              return (
                <tr
                  key={p.id}
                  onClick={() => onEditPayment?.(p)}
                  className={cn(
                    'cursor-pointer border-b border-edge/60 last:border-0 transition hover:bg-cream',
                    p.status === 'paid' && 'opacity-60',
                  )}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <DirectionMark direction={p.direction} />
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-ink">
                          {p.name}
                          {p.has_credentials && (
                            <span
                              title="Credentials saved (encrypted)"
                              className="text-[11px] text-sage"
                            >
                              🔒
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-faint">
                          <span className="capitalize">{p.recurrence}</span>
                          {p.end_date && p.recurrence !== 'one-off' && (
                            <span> · ends {formatMonthYear(p.end_date)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {item ? (
                      <div>
                        <div className="font-medium text-ink">{item.name}</div>
                        <div className="mt-0.5 text-xs text-ink-faint">
                          {country?.name ?? '—'} · {item.type}
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-edge px-2.5 py-1 text-xs font-medium text-ink-faint">
                        Unlinked
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-ink-muted">
                    {displayPerson(p.person, people)}
                  </td>
                  <td className="px-5 py-4 text-right font-display text-base font-semibold tracking-tight text-ink">
                    {formatCurrency(p.amount, p.currency)}
                  </td>
                  <td className="px-5 py-4 text-ink-muted">
                    {formatDate(p.due_date)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill
                      status={p.status}
                      dueDate={p.due_date}
                      paidAt={p.paid_at}
                    />
                  </td>
                  <td className="px-5 py-4">
                    {onTogglePaid && (
                      <PaidCheckbox
                        paid={p.status === 'paid'}
                        onToggle={() => onTogglePaid(p)}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-2 border-t border-edge px-4 py-3 text-xs text-ink-muted sm:flex-row sm:px-5">
          <span>
            Showing {start + 1}–{end} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                page === 1
                  ? 'cursor-not-allowed text-ink-faint'
                  : 'text-ink hover:bg-cream',
              )}
            >
              ‹ Prev
            </button>
            <span className="text-ink">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                page === totalPages
                  ? 'cursor-not-allowed text-ink-faint'
                  : 'text-ink hover:bg-cream',
              )}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DirectionMark({ direction }: { direction: 'incoming' | 'outgoing' }) {
  const isIn = direction === 'incoming'
  return (
    <span
      title={isIn ? 'Money coming in' : 'Money going out'}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        isIn ? 'bg-sage-soft text-sage' : 'bg-terracotta-soft text-terracotta',
      )}
    >
      {isIn ? '↓' : '↑'}
    </span>
  )
}

function PaidCheckbox({
  paid,
  onToggle,
}: {
  paid: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={paid ? 'Click to mark unpaid' : 'Click to mark paid'}
      className="group inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-cream"
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border-2 transition',
          paid
            ? 'border-sage bg-sage'
            : 'border-edge bg-cream group-hover:border-ink',
        )}
      >
        {paid && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-cream"
          >
            <path d="M2 5l2 2 4-4" />
          </svg>
        )}
      </span>
      {!paid && (
        <span className="text-xs font-medium text-ink">Mark paid</span>
      )}
    </button>
  )
}
