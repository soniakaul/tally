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
import { findItem, itemsForCountry, newItemId } from '../state/item'
import { findCountry, newCountryId, COMMON_CURRENCIES } from '../state/country'
import type { Person } from '../state/household'
import { useCountries } from '../hooks/useCountries'
import { useItems } from '../hooks/useItems'
import { CountryDialog, type CountrySavePayload } from './CountryDialog'
import { ItemDialog, type ItemSavePayload } from './ItemDialog'
import { CredentialsDialog } from './CredentialsDialog'
import { usePaymentCredentials } from '../hooks/usePaymentCredentials'

const RECURRENCES: Recurrence[] = ['one-off', 'monthly', 'quarterly', 'yearly']

export type PaymentSavePayload = Omit<PaymentInsert, 'household_id'>

export type DeleteScope = 'one' | 'future' | 'all'

export type EditScope = 'one' | 'future' | 'all'

type Props = {
  initial: Payment | null // null = create mode
  countries: Country[]
  items: Item[]
  people: Person[]
  // All live payments — used to detect series siblings so we can prompt for
  // edit scope on a recurring row.
  payments: Payment[]
  // Returns the saved Payment so the dialog can call creds-set with its id
  // immediately after a create. Returning null is acceptable (the dialog
  // just skips the creds chain).
  onSave: (payload: PaymentSavePayload, scope: EditScope) => Promise<Payment | null>
  onRemove?: (scope: DeleteScope) => Promise<void> | void
  onTogglePaid?: () => void
  onClose: () => void
}

export function PaymentDialog({
  initial,
  countries,
  items,
  people,
  payments,
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
  const [portalName, setPortalName] = useState(initial?.portal_name ?? '')
  const [bankName, setBankName] = useState(initial?.bank_name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [removingMode, setRemovingMode] = useState<'idle' | 'picking'>('idle')
  const [confirmAllAt, setConfirmAllAt] = useState<number | null>(null)
  // Series-aware edit: when the user clicks Save on a recurring payment
  // that has siblings, we enter 'picking-edit' to ask which scope to apply
  // the change to.
  const [savingMode, setSavingMode] = useState<'idle' | 'picking-edit'>('idle')

  // Inline-create sub-dialogs. null = closed.
  const [creatingCountry, setCreatingCountry] = useState<boolean>(false)
  const [creatingItem, setCreatingItem] = useState<boolean>(false)
  // Credentials sub-dialog (edit mode). Tracks the "current" has_credentials
  // so the lock icon updates immediately after save without reloading the
  // payment row.
  const [credsOpen, setCredsOpen] = useState<boolean>(false)
  const [hasCredsLocal, setHasCredsLocal] = useState<boolean>(
    initial?.has_credentials ?? false,
  )
  // Inline credentials (CREATE mode only). Local plaintext that gets passed
  // to creds-set immediately after the payment row is inserted. We never
  // surface inline creds in edit mode because that would require fetching
  // the masked values up-front for everyone editing a payment, even users
  // just changing the amount.
  const [createCreds, setCreateCreds] = useState({
    portal_username: '',
    portal_password: '',
    bank_username: '',
    bank_password: '',
  })
  const [showPortalPw, setShowPortalPw] = useState(false)
  const [showBankPw, setShowBankPw] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { add: addCountryMut } = useCountries()
  const { add: addItemMut } = useItems()
  const { set: setCredsMut } = usePaymentCredentials()

  const isPaid = initial?.status === 'paid'
  const isRecurring = initial !== null && initial.recurrence !== 'one-off'

  // Other live rows in the same series — used to decide whether to prompt
  // for edit scope. Series = same (name, item_id, recurrence) and a
  // different id from the row being edited.
  const liveSiblingCount = useMemo(() => {
    if (!initial || !isRecurring) return 0
    return payments.filter(
      (p) =>
        p.id !== initial.id &&
        p.name === initial.name &&
        p.item_id === initial.item_id &&
        p.recurrence === initial.recurrence,
    ).length
  }, [initial, isRecurring, payments])

  const availableItems = useMemo(
    () => (countryId ? itemsForCountry(items, countryId) : []),
    [items, countryId],
  )

  // Picking a country always syncs the currency. If the user wants a
  // different currency (rare edge case — e.g. a Mumbai payment in USD),
  // they type it in the Currency field AFTER picking the country.
  const handleCountryChange = (cid: string) => {
    setCountryId(cid)
    setItemId('')
    const c = findCountry(countries, cid)
    if (c) setCurrency(c.currency_code)
  }

  // Picking an item likewise syncs currency (via the item's country).
  const handleItemChange = (iid: string) => {
    setItemId(iid)
    const item = findItem(items, iid)
    if (item) {
      const country = findCountry(countries, item.country_id)
      if (country) setCurrency(country.currency_code)
    }
  }

  // Inline-create: after saving the new country/item, auto-select it in the
  // payment form. addCountryMut / addItemMut return the inserted row, so we
  // get the new id without re-querying.
  const handleCreateCountry = async (payload: CountrySavePayload) => {
    const created = await addCountryMut({
      id: newCountryId(countries.map((c) => c.id)),
      ...payload,
      sort_order: countries.length,
    })
    setCreatingCountry(false)
    if (created) handleCountryChange(created.id)
  }

  const handleCreateItem = async (payload: ItemSavePayload) => {
    const created = await addItemMut({
      id: newItemId(items.map((i) => i.id)),
      ...payload,
      sort_order: items.filter((i) => i.country_id === payload.country_id).length,
    })
    setCreatingItem(false)
    if (created) handleItemChange(created.id)
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

  // The Save button click. For edit-mode on a recurring payment with
  // siblings, this just opens the scope picker — actual save runs from
  // commitSave(scope).
  const handleSaveClick = () => {
    if (!canSave || !direction || saving) return
    if (isEdit && liveSiblingCount > 0) {
      setSavingMode('picking-edit')
      return
    }
    void commitSave('one')
  }

  const commitSave = async (scope: EditScope) => {
    if (!canSave || !direction || saving) return
    setSavingMode('idle')
    setSaveError(null)
    setSaving(true)
    try {
      const saved = await onSave(
        {
          name: name.trim(),
          item_id: itemId,
          person,
          amount: numAmount,
          currency,
          direction,
          due_date: dueDate,
          recurrence,
          end_date: recurrence !== 'one-off' && endDate ? endDate : null,
          portal_name: portalName.trim() || null,
          bank_name: bankName.trim() || null,
          notes: notes.trim() || null,
        },
        scope,
      )

      // Create-mode inline credentials: if the user typed anything in the
      // inline cred fields, encrypt + store them now that we have the new id.
      // Failure here doesn't roll back the payment — it surfaces an error so
      // they can retry from the Edit credentials flow.
      if (!isEdit && saved) {
        const patch: Record<string, string | null> = {}
        for (const k of [
          'portal_username',
          'portal_password',
          'bank_username',
          'bank_password',
        ] as const) {
          const v = createCreds[k]
          if (v && v.length > 0) patch[k] = v
        }
        if (Object.keys(patch).length > 0) {
          try {
            await setCredsMut({ paymentId: saved.id, patch })
          } catch (err) {
            setSaveError(
              `Payment saved, but storing credentials failed: ${
                err instanceof Error ? err.message : 'unknown error'
              }. Reopen the payment and use Edit credentials.`,
            )
            setSaving(false)
            return
          }
        }
      }
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-cream shadow-2xl"
      >
        <div className="flex flex-none items-start justify-between border-b border-edge px-6 py-5">
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

        <div className="flex-1 overflow-y-auto">
        {(needsCountry || needsItem) && (
          <div className="mx-6 mt-5 rounded-lg border border-amber/60 bg-amber-soft px-4 py-3 text-xs text-ochre">
            {needsCountry
              ? 'No countries yet — tap “+ New” next to Country below to create one.'
              : 'No items yet — tap “+ New” next to Item below to create one.'}
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
            <FieldWithAction
              label="Country"
              actionLabel="+ New"
              onAction={() => setCreatingCountry(true)}
            >
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
            </FieldWithAction>
            <FieldWithAction
              label="Item"
              actionLabel="+ New"
              onAction={() => setCreatingItem(true)}
              actionDisabled={!countryId}
              actionTitle={
                countryId ? undefined : 'Pick a country first'
              }
            >
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
            </FieldWithAction>
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
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                list="payment-currencies"
                maxLength={6}
                placeholder="e.g. INR"
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

          <div className="border-t border-edge pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Payment details <span className="font-normal normal-case text-ink-faint">— all optional</span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Portal name">
                <input
                  value={portalName}
                  onChange={(e) => setPortalName(e.target.value)}
                  placeholder="e.g. ICICI iMobile"
                  className={inputCls}
                />
              </Field>
              <Field label="Bank name">
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. ICICI Bank"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything you want to see right when this reminder fires"
                  className={cn(inputCls, 'resize-none')}
                />
              </Field>
            </div>

            {isEdit && initial && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-edge bg-card/40 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      hasCredsLocal
                        ? 'bg-sage-soft text-sage'
                        : 'bg-edge text-ink-faint',
                    )}
                  >
                    🔒
                  </span>
                  <span className="text-ink">
                    {hasCredsLocal
                      ? 'Credentials saved (encrypted)'
                      : 'No credentials yet'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCredsOpen(true)}
                  className="rounded-full border border-edge bg-cream px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink hover:text-cream"
                >
                  {hasCredsLocal ? 'Edit credentials' : 'Add credentials'}
                </button>
              </div>
            )}
            {!isEdit && (
              <div className="mt-4 space-y-3 rounded-lg border border-edge bg-card/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Login credentials
                  <span className="font-normal normal-case text-ink-faint">
                    {' '}— optional, encrypted before saving
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Portal username">
                    <input
                      value={createCreds.portal_username}
                      onChange={(e) =>
                        setCreateCreds((c) => ({ ...c, portal_username: e.target.value }))
                      }
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Portal password">
                    <PasswordField
                      value={createCreds.portal_password}
                      onChange={(v) =>
                        setCreateCreds((c) => ({ ...c, portal_password: v }))
                      }
                      revealed={showPortalPw}
                      onToggleReveal={() => setShowPortalPw((s) => !s)}
                    />
                  </Field>
                  <Field label="Bank username">
                    <input
                      value={createCreds.bank_username}
                      onChange={(e) =>
                        setCreateCreds((c) => ({ ...c, bank_username: e.target.value }))
                      }
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Bank password">
                    <PasswordField
                      value={createCreds.bank_password}
                      onChange={(v) =>
                        setCreateCreds((c) => ({ ...c, bank_password: v }))
                      }
                      revealed={showBankPw}
                      onToggleReveal={() => setShowBankPw((s) => !s)}
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-ink-faint">
                  Encrypted with AES-256-GCM. Postgres stores ciphertext only.
                </p>
              </div>
            )}
          </div>
        </div>
        </div>

        {savingMode === 'picking-edit' ? (
          <div className="flex-none border-t border-edge bg-sage-soft/50 px-6 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-sage">
              Apply changes to which instances?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void commitSave('one')}
                disabled={saving}
                className="rounded-full border border-edge bg-cream px-4 py-2 text-sm font-medium text-ink hover:bg-card"
              >
                Just this one
              </button>
              <button
                onClick={() => void commitSave('future')}
                disabled={saving}
                className="rounded-full border border-edge bg-cream px-4 py-2 text-sm font-medium text-ink hover:bg-card"
              >
                This and all future
              </button>
              <button
                onClick={() => void commitSave('all')}
                disabled={saving}
                className="rounded-full bg-sage px-4 py-2 text-sm font-medium text-cream hover:bg-sage/90"
              >
                All {liveSiblingCount + 1} instances
              </button>
              <button
                onClick={() => setSavingMode('idle')}
                disabled={saving}
                className="ml-auto text-xs font-medium text-ink-muted underline-offset-4 hover:underline"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              Per-instance fields like due date stay on this row only — only
              shared fields (amount, item, notes, credentials, etc.) propagate.
            </p>
          </div>
        ) : removingMode === 'picking' ? (
          <div className="flex-none border-t border-edge bg-terracotta-soft/50 px-6 py-4">
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
          <div className="flex flex-none items-center justify-between border-t border-edge px-6 py-4">
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
                onClick={handleSaveClick}
                disabled={!canSave || saving}
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-medium transition',
                  canSave && !saving
                    ? 'bg-ink text-cream hover:bg-ink-muted'
                    : 'cursor-not-allowed bg-edge text-ink-faint',
                )}
              >
                {saving ? 'Saving…' : isEdit ? 'Save' : 'Create payment'}
              </button>
            </div>
          </div>
        )}
        {saveError && (
          <div className="flex-none border-t border-edge bg-terracotta-soft px-6 py-3 text-xs text-terracotta">
            {saveError}
          </div>
        )}
      </div>

      {/* Inline-create sub-dialogs render on top so the user can stay in flow. */}
      {creatingCountry && (
        <CountryDialog
          initial={null}
          existingNames={countries.map((c) => c.name)}
          itemCount={0}
          onSave={handleCreateCountry}
          onClose={() => setCreatingCountry(false)}
        />
      )}
      {creatingItem && (
        <ItemDialog
          initial={null}
          countries={countries}
          allItems={items}
          defaultCountryId={countryId || undefined}
          paymentCount={0}
          onSave={handleCreateItem}
          onClose={() => setCreatingItem(false)}
        />
      )}

      {credsOpen && initial && (
        <CredentialsDialog
          paymentId={initial.id}
          paymentName={name || initial.name}
          hasCredentials={hasCredsLocal}
          siblingCount={liveSiblingCount}
          onClose={() => setCredsOpen(false)}
          onSaved={() => setHasCredsLocal(true)}
        />
      )}
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

// Like Field, but renders a small action chip (e.g. "+ New") inline with the
// label. Used by the Country/Item rows so the user can spin up a new entity
// without leaving the payment form.
function FieldWithAction({
  label,
  actionLabel,
  onAction,
  actionDisabled,
  actionTitle,
  children,
}: {
  label: string
  actionLabel: string
  onAction: () => void
  actionDisabled?: boolean
  actionTitle?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-ink-muted">
        <span>{label}</span>
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          title={actionTitle}
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal transition',
            actionDisabled
              ? 'cursor-not-allowed bg-edge text-ink-faint'
              : 'bg-ink/5 text-ink hover:bg-ink hover:text-cream',
          )}
        >
          {actionLabel}
        </button>
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

function PasswordField({
  value,
  onChange,
  revealed,
  onToggleReveal,
}: {
  value: string
  onChange: (v: string) => void
  revealed: boolean
  onToggleReveal: () => void
}) {
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        className={cn(inputCls, 'pr-12')}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={onToggleReveal}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-card hover:text-ink"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      )}
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
