import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import type {
  Payment,
  PaymentInsert,
  Recurrence,
} from '../state/payments'
import type { Category } from '../state/categories'
import type { Person } from '../state/household'

const CURRENCIES = ['INR', 'USD', 'SEK', 'THB', 'AED', 'SGD', 'GBP', 'EUR'] as const
const RECURRENCES: Recurrence[] = ['one-off', 'monthly', 'quarterly', 'yearly']

export type PaymentSavePayload = Omit<PaymentInsert, 'household_id'>

type Props = {
  initial: Payment | null // null = create mode
  categories: Category[]
  people: Person[]
  onSave: (payload: PaymentSavePayload) => Promise<void> | void
  onRemove?: () => Promise<void> | void
  onTogglePaid?: () => void
  onClose: () => void
}

export function PaymentDialog({
  initial,
  categories,
  people,
  onSave,
  onRemove,
  onTogglePaid,
  onClose,
}: Props) {
  const isEdit = initial !== null
  const todayStr = new Date().toISOString().slice(0, 10)

  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState<string>(
    initial?.amount != null ? String(initial.amount) : '',
  )
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? todayStr)
  const [recurrence, setRecurrence] = useState<Recurrence>(
    initial?.recurrence ?? 'monthly',
  )
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [category, setCategory] = useState(
    initial?.category_id ?? categories[0]?.id ?? '',
  )
  const [person, setPerson] = useState(
    initial?.person ?? people[0]?.id ?? 'both',
  )

  const isPaid = initial?.status === 'paid'
  const numAmount = parseFloat(amount)
  const canSave =
    name.trim().length > 0 &&
    !Number.isNaN(numAmount) &&
    numAmount > 0 &&
    dueDate &&
    category &&
    person

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = async () => {
    if (!canSave) return
    await onSave({
      name: name.trim(),
      category_id: category,
      person,
      amount: numAmount,
      currency,
      due_date: dueDate,
      recurrence,
      end_date:
        recurrence !== 'one-off' && endDate ? endDate : null,
    })
  }

  const handleRecurrenceChange = (r: Recurrence) => {
    setRecurrence(r)
    if (r === 'one-off') setEndDate('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-cream shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-edge px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-ink">
              {isEdit ? 'Edit payment' : 'New payment'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {isEdit
                ? 'Update details, mark as paid, or remove.'
                : 'Track a recurring or one-off payment.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition hover:bg-card hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ICICI home loan EMI"
              className={inputCls}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Amount">
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </Field>
            <Field label="Currency">
              <SelectField
                value={currency}
                onChange={(v) => setCurrency(v)}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Recurrence">
              <SelectField
                value={recurrence}
                onChange={(v) => handleRecurrenceChange(v as Recurrence)}
                options={RECURRENCES.map((r) => ({
                  value: r,
                  label: r === 'one-off' ? 'One-off' : capitalize(r),
                }))}
              />
            </Field>
          </div>

          {recurrence !== 'one-off' && (
            <Field label="Repeat until (optional)">
              <input
                type="date"
                value={endDate ?? ''}
                min={dueDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-ink-faint">
                Leave empty to repeat forever. Useful for fixed-term loans or
                policies.
              </p>
            </Field>
          )}

          <Field label="Category">
            <SelectField
              value={category}
              onChange={setCategory}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>

          <Field label="For whom">
            <SelectField
              value={person}
              onChange={setPerson}
              options={[
                ...people.map((p) => ({
                  value: p.id,
                  label: p.name || 'Unnamed',
                })),
                {
                  value: 'both',
                  label: people.length > 2 ? 'Shared' : 'Both',
                },
              ]}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-edge px-6 py-4">
          <div className="flex items-center gap-4">
            {isEdit && onRemove && (
              <button
                onClick={() => void onRemove()}
                className="text-xs font-medium text-terracotta underline-offset-4 hover:underline"
              >
                Remove payment
              </button>
            )}
            {isEdit && onTogglePaid && (
              isPaid ? (
                <button
                  onClick={onTogglePaid}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1.5 text-xs font-semibold text-ochre transition hover:bg-amber hover:text-cream"
                >
                  ↺ Mark as unpaid
                </button>
              ) : (
                <button
                  onClick={onTogglePaid}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1.5 text-xs font-semibold text-sage transition hover:bg-sage hover:text-cream"
                >
                  ✓ Mark as paid
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-edge bg-card/60 px-4 py-2 text-sm font-medium text-ink-muted hover:bg-card hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              className={cn(
                'rounded-full px-5 py-2 text-sm font-medium transition',
                canSave
                  ? 'bg-ink text-cream hover:bg-ink-muted'
                  : 'cursor-not-allowed bg-edge text-ink-faint',
              )}
            >
              {isEdit ? 'Save' : 'Create payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  )
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, 'cursor-pointer appearance-none pr-8')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
        ▾
      </span>
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
