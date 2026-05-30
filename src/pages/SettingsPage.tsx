import { useEffect, useState } from 'react'
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  formatReminderOffset,
  newReminderId,
  type ReminderRule,
} from '../state/settings'
import type { FxSnapshot } from '../lib/fx'
import { cn } from '../lib/utils'
import { useDebouncedSync } from '../hooks/useDebouncedSync'
import { useHousehold } from '../hooks/useHousehold'
import { usePeople } from '../hooks/usePeople'
import { useCountries } from '../hooks/useCountries'
import { useItems } from '../hooks/useItems'
import { usePayments } from '../hooks/usePayments'
import { findItem } from '../state/item'
import { findCountry } from '../state/country'
import type { Country } from '../state/country'
import type { Item } from '../state/item'
import { useReminders } from '../hooks/useReminders'
import { useSendReminder } from '../hooks/useSendReminder'
import type { Payment } from '../state/payments'
import type { Person } from '../state/household'

type Props = {
  fxSnapshot: FxSnapshot
  onDeleteHousehold: () => void
}

export function SettingsPage({ fxSnapshot, onDeleteHousehold }: Props) {
  const { household, update: updateHousehold } = useHousehold()
  const { people } = usePeople()
  const { countries } = useCountries()
  const { items } = useItems()
  const { payments } = usePayments()
  const {
    reminders,
    add: addReminderMut,
    update: updateReminderMut,
    remove: removeReminderMut,
  } = useReminders()

  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateRule = (
    id: string,
    patch: Partial<{ offset_days: number | null; enabled: boolean }>,
  ) => void updateReminderMut({ id, patch })

  const removeRule = (id: string) => void removeReminderMut(id)

  const addRule = () => {
    const existingIds = reminders.map((r) => r.id)
    void addReminderMut({
      id: newReminderId(existingIds),
      offset_days: null,
      enabled: true,
      sort_order: reminders.length,
    })
  }

  const downloadExport = () => {
    const data = JSON.stringify(
      {
        household,
        people,
        countries,
        items,
        payments,
        reminders,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    )
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tally-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="dotted-bg min-h-full px-4 pb-16 pt-8 md:px-10 md:pt-10">
      <div className="mb-8 md:mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Configuration
        </p>
        <h1 className="font-display text-3xl font-bold leading-[0.95] tracking-tightest md:text-5xl">
          Settings
        </h1>
        <p className="mt-3 text-sm text-ink-muted md:mt-4 md:text-base">
          How Tally tracks payments, reminders, and your household data.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-4">
        <Section
          title="Household"
          description="Name and members. People are also editable from the chip in the top bar."
        >
          <Field label="Household name">
            <HouseholdNameField
              initial={household?.name ?? ''}
              onSync={(name) => void updateHousehold({ name })}
            />
          </Field>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
            <span>
              {people.length} member{people.length === 1 ? '' : 's'}
            </span>
            <span>·</span>
            <span>
              {countries.length} countr{countries.length === 1 ? 'y' : 'ies'}
            </span>
            <span>·</span>
            <span>
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
            <span>·</span>
            <span>{payments.length} payments tracked</span>
          </div>
        </Section>

        <Section
          title="Currency & locale"
          description={`The home currency rolls up totals on the dashboard. Rates updated ${fxSnapshot.date} · ${fxSnapshot.source}.`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Home currency">
              <Select
                value={household?.home_currency ?? 'INR'}
                onChange={(v) => void updateHousehold({ home_currency: v })}
                options={SUPPORTED_CURRENCIES.map((c) => ({
                  value: c.code,
                  label: c.label,
                }))}
              />
            </Field>
            <Field label="Timezone">
              <Select
                value={household?.timezone ?? 'Asia/Kolkata'}
                onChange={(v) => void updateHousehold({ timezone: v })}
                options={SUPPORTED_TIMEZONES.map((t) => ({
                  value: t.tz,
                  label: t.label,
                }))}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Reminder cadence"
          description="When WhatsApp reminders fire for each upcoming payment. Add custom intervals or remove ones you don't want."
        >
          <div className="space-y-1">
            {reminders.map((rule) => (
              <ReminderRuleRow
                key={rule.id}
                rule={rule}
                onChange={(patch) => updateRule(rule.id, patch)}
                onRemove={() => removeRule(rule.id)}
              />
            ))}
            {reminders.length === 0 && (
              <p className="rounded-lg border border-dashed border-edge bg-cream/40 px-3 py-3 text-sm text-ink-muted">
                No reminders. Add at least one so reminders get sent.
              </p>
            )}
          </div>
          <button
            onClick={addRule}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-edge bg-cream/40 px-3 py-2 text-sm font-medium text-ink-muted transition hover:border-ink-faint hover:bg-cream hover:text-ink"
          >
            <span className="text-base leading-none">+</span> Add reminder
          </button>
        </Section>

        <Section
          title="WhatsApp"
          description="Reminders go out via the Twilio WhatsApp Sandbox. The custom template below is sent as freeform text — no template approval required. Parents reply with PAID or SNOOZE N to mark/postpone."
        >
          {household ? (
            <WhatsAppPanel
              household={household}
              people={people}
              payments={payments}
              countries={countries}
              items={items}
              onTemplateChange={(reminder_template) =>
                void updateHousehold({ reminder_template })
              }
            />
          ) : (
            <div className="rounded-xl border border-edge bg-cream/60 px-4 py-6 text-center text-sm text-ink-muted">
              Loading…
            </div>
          )}
        </Section>

        <Section
          title="Data"
          description="Take your data with you, or start fresh."
        >
          <div className="space-y-2">
            <ActionRow
              label="Export household data"
              hint="JSON file with household, categories, payments, and reminders"
              actionLabel="Download JSON"
              onAction={downloadExport}
            />
            <ActionRow
              label="Delete this household"
              hint="Removes all payments, categories, people. Cannot be undone."
              actionLabel={confirmDelete ? 'Tap again to confirm' : 'Delete →'}
              destructive
              onAction={() => {
                if (confirmDelete) {
                  onDeleteHousehold()
                  setConfirmDelete(false)
                } else {
                  setConfirmDelete(true)
                  setTimeout(() => setConfirmDelete(false), 4000)
                }
              }}
            />
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-edge bg-card/60 p-6">
      <h2 className="font-display text-xl font-bold tracking-tightest text-ink">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-edge bg-cream/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none'

function WhatsAppPanel({
  household,
  people,
  payments,
  countries,
  items,
  onTemplateChange,
}: {
  household: { reminder_template: string }
  people: Person[]
  payments: Payment[]
  countries: Country[]
  items: Item[]
  onTemplateChange: (template: string) => void
}) {
  const { send, sending, lastResult, reset } = useSendReminder()

  // Local debounced state for the template so typing is smooth.
  // Initial value comes from household.reminder_template, which is guaranteed
  // present because the parent gates this component on household loaded.
  const [template, setTemplate] = useState(household.reminder_template)
  useDebouncedSync(template, onTemplateChange)
  // Local differs from server until the debounce flushes + the mutation
  // updates the cache. Use this to show a Saved / Saving… indicator.
  const isSaved = template === household.reminder_template

  // Default selections: first person with a WhatsApp number, first upcoming payment.
  const peopleWithPhone = people.filter((p) => p.whatsapp.trim().length > 0)
  const peopleWithoutPhone = people.length - peopleWithPhone.length
  const upcomingFirst = [...payments].sort((a, b) =>
    a.due_date.localeCompare(b.due_date),
  )
  const [personId, setPersonId] = useState(peopleWithPhone[0]?.id ?? '')
  const [paymentId, setPaymentId] = useState(upcomingFirst[0]?.id ?? '')

  // If state stale (e.g., people loaded after first render), pick first valid.
  useEffect(() => {
    if (!personId && peopleWithPhone[0]) setPersonId(peopleWithPhone[0].id)
  }, [personId, peopleWithPhone])
  useEffect(() => {
    if (!paymentId && upcomingFirst[0]) setPaymentId(upcomingFirst[0].id)
  }, [paymentId, upcomingFirst])

  const canSend =
    !!personId &&
    !!paymentId &&
    !sending &&
    peopleWithPhone.length > 0 &&
    payments.length > 0

  const handleSend = async () => {
    if (!canSend) return
    await send({ payment_id: paymentId, person_id: personId, kind: 'test' })
  }

  // Live preview using the chosen payment + person
  const previewPerson = people.find((p) => p.id === personId) ?? null
  const previewPayment = payments.find((p) => p.id === paymentId) ?? null
  const previewItem = previewPayment
    ? findItem(items, previewPayment.item_id) ?? null
    : null
  const previewCountry = previewItem
    ? findCountry(countries, previewItem.country_id) ?? null
    : null
  const previewBody = renderPreview(
    template,
    previewPerson,
    previewPayment,
    previewItem,
    previewCountry,
  )

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="flex items-center justify-between rounded-xl border border-edge bg-cream/60 p-4">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-sage" />
          <div>
            <div className="text-sm font-medium text-ink">
              Twilio Sandbox configured
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              Each person must text <code className="rounded bg-card px-1.5 py-0.5 text-[11px]">join &lt;your-sandbox-code&gt;</code> from their WhatsApp to{' '}
              <code className="rounded bg-card px-1.5 py-0.5 text-[11px]">+1 415 523 8886</code> once to opt in.
            </div>
          </div>
        </div>
      </div>

      {/* Template editor */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Message template
          </span>
          <SaveStatus isSaved={isSaved} />
        </div>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-edge bg-cream/60 px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-ink focus:outline-none"
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">
          Variables you can use:{' '}
          <code className="text-ink">{'{name}'}</code>{' '}
          <code className="text-ink">{'{payment}'}</code>{' '}
          <code className="text-ink">{'{category}'}</code>{' '}
          <code className="text-ink">{'{amount}'}</code>{' '}
          <code className="text-ink">{'{currency}'}</code>{' '}
          <code className="text-ink">{'{when}'}</code>
        </p>
      </div>

      {/* Preview */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
          Preview
        </label>
        <div className="rounded-xl border border-edge bg-sage-soft/40 p-4">
          {previewPayment && previewPerson ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-ink">
              {previewBody}
            </pre>
          ) : (
            <p className="text-xs italic text-ink-muted">
              Add a payment and a person with a WhatsApp number to see the preview.
            </p>
          )}
        </div>
      </div>

      {/* Test send */}
      <div className="rounded-xl border border-edge bg-cream/60 p-4">
        <div className="mb-3 text-sm font-medium text-ink">Send a test</div>

        {peopleWithPhone.length === 0 && (
          <div className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-ochre">
            No household members have a WhatsApp number yet. Add one via the household chip in the top bar.
          </div>
        )}
        {payments.length === 0 && (
          <div className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-ochre">
            Add at least one payment first so there's something to remind about.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Who">
            <Select
              value={personId}
              onChange={setPersonId}
              options={peopleWithPhone.map((p) => ({
                value: p.id,
                label: `${p.name || 'Unnamed'} · ${p.whatsapp}`,
              }))}
            />
          </Field>
          <Field label="About which payment">
            <Select
              value={paymentId}
              onChange={setPaymentId}
              options={upcomingFirst.map((p) => ({
                value: p.id,
                label: `${p.name} · due ${p.due_date}`,
              }))}
            />
          </Field>
        </div>

        {peopleWithoutPhone > 0 && peopleWithPhone.length > 0 && (
          <p className="mt-2 text-[11px] text-ink-faint">
            {peopleWithoutPhone} {peopleWithoutPhone === 1 ? 'person is' : 'people are'} hidden because they don't have a WhatsApp number.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => void handleSend()}
            disabled={!canSend}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition',
              canSend
                ? 'bg-ink text-cream hover:bg-ink-muted'
                : 'cursor-not-allowed bg-edge text-ink-faint',
            )}
          >
            {sending ? 'Sending…' : 'Send test message →'}
          </button>
          {lastResult && (
            <button
              onClick={reset}
              className="text-xs text-ink-faint underline-offset-4 hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        {lastResult && (
          <div
            className={cn(
              'mt-3 rounded-lg px-3 py-2 text-xs',
              lastResult.ok
                ? 'border border-sage/30 bg-sage-soft text-sage'
                : 'border border-terracotta/30 bg-terracotta-soft text-terracotta',
            )}
          >
            {lastResult.ok
              ? `✓ Sent to ${lastResult.to}. Message ID: ${lastResult.sid}.`
              : `Send failed: ${lastResult.error}`}
          </div>
        )}
      </div>
    </div>
  )
}

function SaveStatus({ isSaved }: { isSaved: boolean }) {
  return isSaved ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sage">
      <span className="h-1.5 w-1.5 rounded-full bg-sage" />
      Saved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ochre">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
      Saving…
    </span>
  )
}

function renderPreview(
  template: string,
  person: Person | null,
  payment: Payment | null,
  item: Item | null,
  country: Country | null,
): string {
  if (!person || !payment) return ''
  const today = new Date()
  const due = new Date(payment.due_date)
  const diffDays = Math.round(
    (due.setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24),
  )
  const when =
    diffDays < 0
      ? `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`
      : diffDays === 0
        ? 'today'
        : diffDays === 1
          ? 'tomorrow'
          : diffDays < 7
            ? `in ${diffDays} days`
            : diffDays < 14
              ? 'next week'
              : `in ${Math.round(diffDays / 7)} weeks`

  let amountFormatted = `${payment.amount} ${payment.currency}`
  try {
    amountFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: payment.currency,
      maximumFractionDigits: 0,
    }).format(payment.amount)
  } catch {
    // fall through
  }

  const vars: Record<string, string> = {
    name: person.name || 'there',
    payment: payment.name,
    item: item?.name ?? 'Unlinked',
    country: country?.name ?? '',
    category: item ? `${item.name} (${item.type})` : 'Unlinked',
    amount: amountFormatted,
    currency: payment.currency,
    direction: payment.direction,
    when,
  }
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

function HouseholdNameField({
  initial,
  onSync,
}: {
  initial: string
  onSync: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  useDebouncedSync(value, onSync)
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={inputCls}
    />
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  )
}

function Select({
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

type RuleType = 'before' | 'dayOf' | 'after'

function deriveType(offset: number | null): RuleType {
  if (offset === null || offset < 0) return 'before'
  if (offset === 0) return 'dayOf'
  return 'after'
}

function deriveDaysStr(offset: number | null): string {
  if (offset === null || offset === 0) return ''
  return String(Math.abs(offset))
}

function ReminderRuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: ReminderRule
  onChange: (patch: Partial<{ offset_days: number | null; enabled: boolean }>) => void
  onRemove: () => void
}) {
  const [localType, setLocalType] = useState<RuleType>(() =>
    deriveType(rule.offset_days),
  )
  const [localDays, setLocalDays] = useState<string>(() =>
    deriveDaysStr(rule.offset_days),
  )

  useEffect(() => {
    if (rule.offset_days === null) return
    setLocalType(deriveType(rule.offset_days))
    setLocalDays(deriveDaysStr(rule.offset_days))
  }, [rule.offset_days])

  const commit = (type: RuleType, days: string) => {
    let offset: number | null
    if (type === 'dayOf') {
      offset = 0
    } else if (!days || parseInt(days) <= 0) {
      offset = null
    } else {
      const n = Math.max(1, Math.min(60, parseInt(days) || 1))
      offset = type === 'before' ? -n : n
    }
    if (offset !== rule.offset_days) onChange({ offset_days: offset })
  }

  const handleType = (t: RuleType) => {
    setLocalType(t)
    commit(t, localDays)
  }

  const handleDays = (s: string) => {
    setLocalDays(s)
    commit(localType, s)
  }

  const isUnconfigured = rule.offset_days === null

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-cream/50">
      <span
        className={cn(
          'flex-1 text-sm',
          isUnconfigured ? 'italic text-ink-faint' : 'text-ink',
        )}
      >
        {formatReminderOffset(rule.offset_days)}
      </span>

      {localType !== 'dayOf' && (
        <input
          type="number"
          min={1}
          max={60}
          value={localDays}
          onChange={(e) => handleDays(e.target.value)}
          placeholder="—"
          className="w-14 rounded-md border border-edge bg-cream px-2 py-1 text-center text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      )}

      <div className="relative">
        <select
          value={localType}
          onChange={(e) => handleType(e.target.value as RuleType)}
          className="cursor-pointer appearance-none rounded-md border border-edge bg-cream py-1 pl-2 pr-6 text-sm text-ink focus:border-ink focus:outline-none"
        >
          <option value="before">days before</option>
          <option value="dayOf">day of</option>
          <option value="after">days after</option>
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
          ▾
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={rule.enabled}
        onClick={() => onChange({ enabled: !rule.enabled })}
        disabled={isUnconfigured}
        title={isUnconfigured ? 'Pick a day before enabling' : undefined}
        className={cn(
          'relative h-5 w-9 rounded-full transition',
          isUnconfigured
            ? 'cursor-not-allowed bg-edge opacity-50'
            : rule.enabled
              ? 'bg-ink'
              : 'bg-edge',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-cream transition',
            rule.enabled && !isUnconfigured ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>

      <button
        onClick={onRemove}
        className="rounded p-1 text-ink-faint transition hover:bg-cream hover:text-terracotta"
        aria-label="Remove reminder"
      >
        ✕
      </button>
    </div>
  )
}

function ActionRow({
  label,
  hint,
  actionLabel,
  onAction,
  destructive,
}: {
  label: string
  hint: string
  actionLabel: string
  onAction: () => void
  destructive?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-edge bg-cream/60 p-4">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>
      </div>
      <button
        onClick={onAction}
        className={cn(
          'rounded-full px-4 py-2 text-sm font-medium transition',
          destructive
            ? 'border border-terracotta/30 bg-terracotta-soft text-terracotta hover:bg-terracotta hover:text-cream'
            : 'border border-edge bg-card text-ink hover:bg-ink hover:text-cream',
        )}
      >
        {actionLabel}
      </button>
    </div>
  )
}
