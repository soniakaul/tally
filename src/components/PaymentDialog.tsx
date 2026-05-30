import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import type {
  Direction,
  Payment,
  PaymentInsert,
  Recurrence,
} from '../state/payments'
import type { Country } from '../state/country'
import type { Item } from '../state/item'
import { findItem, itemsForCountry } from '../state/item'
import { findCountry, COMMON_CURRENCIES } from '../state/country'
import type { Person } from '../state/household'

const RECURRENCES: Recurrence[] = ['one-off', 'monthly', 'quarterly', 'yearly']

export type PaymentSavePayload = Omit<PaymentInsert, 'household_id'>

export type DeleteScope = 'one' | 'future' | 'all'

type Props = {
  initial: Payment | null // null = create mode
  countries: Country[]
  items: Item[]
  people: Person[]
  onSave: (payload: PaymentSavePayload) => Promise<void> | void
  onRemove?: (scope: DeleteScope) => Promise<void> | void
  onTogglePaid?: () => void
  onClose: () => void
}

export function PaymentDialog({
  initial,
  countries,
  items,
  people,
  onSave,
  onRemove,
  onTogglePaid,
  onClose,
}: Props) {
  const isEdit = initial !== null
  const todayStr = new Date().toISOString().slice(0, 10)

  // Resolve the country for an existing payment via its item.
  const initialItem = initial ? findItem(items, initial.item_id) : undefined
  const initialCountryId = initialItem?.country_id ?? ''

  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState<string>(
    initial?.amount != null ? String(initial.amount) : '',
  )
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [currencyTouched, setCurrencyTouched] = useState(isEdit)
  const [dueDate, setDueDate] = useState(initial?.due_date ?? todayStr)
  const [recurrence, setRecurrence] = useState<Recurrence>(
    initial?.recurrence ?? 'monthly',
  )
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [countryId, setCountryId] = useState<string>(initialCountryId)
  const [itemId, setItemId] = useState<string>(initial?.item_id ?? '')
  const [direction, setDirection] = useState<Direction | ''>(
    initial?.direction ?? '',
  )
  const [person, setPerson] = useState(
    initial?.person ?? people[0]?.id ?? 'both',
  )
  const [removingMode, setRemovingMode] = useState<'idle' | 'picking'>('idle')
  const [confirmAllAt, setConfirmAllAt] = useState<number | null>(null)

  const isPaid = initial?.status === 'paid'
  const isRecurring = initial !== null && initial.recurrence !== 'one-off'

  const availableItems = useMemo(
    () => (countryId ? itemsForCountry(items, countryId) : []),
    [items, countryId],
  )

  // When user picks a country, reset item and (if not edited) auto-fill currency.
  const handleCountryChange = (cid: string) => {
    setCountryId(cid)
    setItemId('')
    if (!currencyTouched) {
      const c = findCountry(countries, cid)
      if (c) setCurrency(c.currency_code)
    }
  }

  // Same when picking an item — if the country changed implicitly, keep
  // currency in sync unless the user has explicitly overridden.
  const handleItemChange = (iid: string) => {
    setItemId(iid)
    if (!currencyTouched) {
      const item = findItem(items, iid)
      if (item) {
        const country = findCountry(countries, item.country_id)
        if (country) setCurrency(country.currency_code)
      }
    }
  }

  const numAmount = parseFloat(amount)
  const canSave =
    name.trim().length > 0 &&
    !Number.isNaN(numAmount) &&
    numAmount > 0 &&
    dueDate &&
    countryId &&
    itemId &&
    direction !== '' &&
    currency.length > 0 &&
    person

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = async () => {
    if (!canSave || !direction) return
    await onSave({
      name: name.trim(),
      item_id: itemId,
      person,
      amount: numAmount,
      currency,
      direction,
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

  const startRemove = () => {
    if (!onRemove) return
    if (!isRecurring) {
      // One-off: there's only one row, just delete.
      void onRemove('one')
      return
    }
    setRemovingMode('picking')
  }

  const pickScope = (scope: DeleteScope) => {
    if (!onRemove) return
    if (scope === 'all') {
      const now = Date.now()
      // First tap arms the confirmation for 4 seconds; second tap commits.
      if (confirmAllAt === null || now - confirmAllAt > 4000) {
        setConfirmAllAt(now)
        return
      }
    }
    setConfirmAllAt(null)
    setRemovingMode('idle')
    void onRemove(scope)
  }

  const cancelRemove = () => {
    setRemovingMode('idle')
    setConfirmAllAt(null)
  }

  const needsCountry = countries.length === 0
  const needsItem = !needsCountry && items.length === 0

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

        {(needsCountry || needsItem) && (
          <div className="mx-6 mt-5 rounded-lg border border-amber/60 bg-amber-soft px-4 py-3 text-xs text-ochre">
            {needsCountry
              ? 'Add a country (with its currency) on the Items page before creating payments.'
              : 'Add an item on the Items page before creating payments.'}
          </div>
        )}

        <div className="space-y-4 px-6 py-5">
          <Field label="Direction">
            <DirectionToggle value={direction} onChange={setDirection} />
          </Field>

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ICICI home loan EMI"
              className={inputCls}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <SelectField
                value={countryId}
                onChange={handleCountryChange}
                options={[
                  { value: '', label: 'Select country…', disabled: true },
                  ...countries.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.currency_code})`,
                  })),
                ]}
              />
            </Field>
            <Field label="Item">
              <SelectField
                value={itemId}
                onChange={handleItemChange}
                disabled={!countryId}
                options={[
                  {
                    value: '',
                    label: countryId
                      ? availableItems.length
                        ? 'Select item…'
                        : 'No items in this country'
                      : 'Pick a country first',
                    disabled: true,
                  },
                  ...availableItems.map((i) => ({
                    value: i.id,
                    label: `${i.name}${i.type ? ` · ${i.type}` : ''}`,
                  })),
                ]}
              />
            </Field>
          </div>

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
              <input
                value={currency}
                onChange={(e) => {
                  setCurrencyTouched(true)
                  setCurrency(e.target.value.toUpperCase())
                }}
                list="payment-currencies"
                maxLength={6}
                placeholder="INR"
                className={cn(inputCls, 'font-mono')}
              />
              <datalist id="payment-currencies">
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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

        {removingMode === 'picking' ? (
          <div className="border-t border-edge bg-terracotta-soft/50 px-6 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-terracotta">
              Delete which instances?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => pickScope('one')}
                className="rounded-full border border-edge bg-cream px-4 py-2 text-sm font-medium text-ink hover:bg-card"
              >
                Just this one
              </button>
              <button
                onClick={() => pickScope('future')}
                className="rounded-full border border-edge bg-cream px-4 py-2 text-sm font-medium text-ink hover:bg-card"
              >
                This and all future
              </button>
              <button
                onClick={() => pickScope('all')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  confirmAllAt !== null
                    ? 'bg-terracotta text-cream hover:bg-terracotta/90'
                    : 'border border-terracotta/40 bg-cream text-terracotta hover:bg-terracotta hover:text-cream',
                )}
              >
                {confirmAllAt !== null
                  ? 'Tap again to wipe series'
                  : 'All instances (including paid)'}
              </button>
              <button
                onClick={cancelRemove}
                className="ml-auto text-xs font-medium text-ink-muted underline-offset-4 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-edge px-6 py-4">
            <div className="flex items-center gap-4">
              {isEdit && onRemove && (
                <button
                  onClick={startRemove}
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
        )}
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

function DirectionToggle({
  value,
  onChange,
}: {
  value: Direction | ''
  onChange: (v: Direction) => void
}) {
  const opts: { value: Direction; label: string; icon: string; activeCls: string }[] = [
    {
      value: 'outgoing',
      label: 'Outgoing',
      icon: '↑',
      activeCls: 'bg-terracotta text-cream',
    },
    {
      value: 'incoming',
      label: 'Incoming',
      icon: '↓',
      activeCls: 'bg-sage text-cream',
    },
  ]
  return (
    <div className="flex gap-2">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
            value === o.value
              ? `${o.activeCls} border-transparent`
              : 'border-edge bg-card/60 text-ink-muted hover:bg-card hover:text-ink',
          )}
        >
          <span className="text-base leading-none">{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  )
}

type SelectOption = { value: string; label: string; disabled?: boolean }

function SelectField({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          inputCls,
          'cursor-pointer appearance-none pr-8',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
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
