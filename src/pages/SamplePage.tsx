import { useMemo, useState } from 'react'
import { Dashboard } from '../App'
import { PaymentDialog, type PaymentSavePayload } from '../components/PaymentDialog'
import { PersonAvatar } from '../components/PersonAvatar'
import { TallyMark } from '../components/TallyMark'
import {
  cn,
  computeStatus,
  formatLocalYMD,
  relativeDays,
} from '../lib/utils'
import { formatReminderOffset, type ReminderRule } from '../state/settings'
import type { Payment } from '../state/payments'
import type { Household, Person } from '../state/household'
import type { Country } from '../state/country'
import type { Item } from '../state/item'
import type { AppColor } from '../state/colors'
import { findItem } from '../state/item'
import { findCountry } from '../state/country'

// ---------------------------------------------------------------------------
// Sample data
//
// Everything below is in-memory only — the sample page never touches Supabase.
// It exists so a curious visitor can poke at a fully populated household before
// signing up. Due dates are anchored relative to "today" at load time so the
// mix of overdue / upcoming / paid always looks realistic whenever it's run.
// ---------------------------------------------------------------------------

const HH = 'sample-household'
const TODAY = new Date()
const NOW_ISO = TODAY.toISOString()

// Days from today → "YYYY-MM-DD" (local, no UTC shift).
function offset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return formatLocalYMD(d)
}

const SAMPLE_FX: Record<string, number> = {
  INR: 1,
  USD: 83.2,
  GBP: 105.6,
  SGD: 61.4,
  EUR: 90.1,
  AED: 22.6,
}

const SAMPLE_HOUSEHOLD: Household = {
  id: HH,
  name: 'The Sharma household',
  home_currency: 'INR',
  timezone: 'Asia/Kolkata',
  reminder_template:
    'Hi {name} 👋 Reminder: {payment} ({item}) is due {when} — {amount}. ' +
    'Pay via {portal_name} and reply PAID once it’s done.',
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
}

const SAMPLE_PEOPLE: Person[] = [
  {
    id: 'sp-priya',
    household_id: HH,
    name: 'Priya',
    whatsapp: '+91 98200 11223',
    color: 'sage',
    sort_order: 0,
    created_at: NOW_ISO,
    deleted_at: null,
  },
  {
    id: 'sp-arjun',
    household_id: HH,
    name: 'Arjun',
    whatsapp: '+91 98200 44556',
    color: 'clay',
    sort_order: 1,
    created_at: NOW_ISO,
    deleted_at: null,
  },
]

const SAMPLE_COUNTRIES: Country[] = [
  { id: 'sc-in', name: 'India', currency_code: 'INR', sort_order: 0 },
  { id: 'sc-us', name: 'United States', currency_code: 'USD', sort_order: 1 },
  { id: 'sc-uk', name: 'United Kingdom', currency_code: 'GBP', sort_order: 2 },
  { id: 'sc-sg', name: 'Singapore', currency_code: 'SGD', sort_order: 3 },
].map((c) => ({ ...c, household_id: HH, created_at: NOW_ISO, deleted_at: null }))

const SAMPLE_ITEMS: Item[] = [
  { id: 'si-mumbai', country_id: 'sc-in', name: 'Mumbai flat', type: 'Property', sort_order: 0 },
  { id: 'si-blr', country_id: 'sc-in', name: 'Bangalore office', type: 'Company', sort_order: 1 },
  { id: 'si-honda', country_id: 'sc-in', name: 'Honda City', type: 'Vehicle', sort_order: 2 },
  { id: 'si-health', country_id: 'sc-in', name: 'Family health plan', type: 'Insurance', sort_order: 3 },
  { id: 'si-nyc', country_id: 'sc-us', name: 'NYC condo', type: 'Property', sort_order: 0 },
  { id: 'si-london', country_id: 'sc-uk', name: 'London maisonette', type: 'Property', sort_order: 0 },
  { id: 'si-sgco', country_id: 'sc-sg', name: 'Lumen Consulting Pte', type: 'Company', sort_order: 0 },
].map((i) => ({ ...i, household_id: HH, created_at: NOW_ISO, deleted_at: null }))

// Build a full Payment row from a small spec. Non-paid rows get their status
// computed from the due date so the demo always reflects "today".
type PaymentSpec = Partial<Payment> &
  Pick<Payment, 'id' | 'name' | 'amount' | 'direction' | 'due_date'>

function mkPayment(spec: PaymentSpec): Payment {
  const base: Payment = {
    id: '',
    household_id: HH,
    item_id: null,
    person: 'both',
    name: '',
    amount: 0,
    currency: 'INR',
    direction: 'outgoing',
    due_date: '',
    recurrence: 'monthly',
    end_date: null,
    status: 'upcoming',
    paid_at: null,
    paid_via: null,
    last_reminder_sent: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    deleted_at: null,
    portal_name: null,
    bank_name: null,
    notes: null,
    has_credentials: false,
  }
  const merged: Payment = { ...base, ...spec }
  if (merged.status !== 'paid') {
    merged.status = computeStatus(merged.due_date, TODAY)
  }
  return merged
}

const INITIAL_PAYMENTS: Payment[] = [
  mkPayment({
    id: 'spay-proptax',
    name: 'Property tax',
    item_id: 'si-mumbai',
    person: 'both',
    amount: 85000,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'yearly',
    due_date: offset(14),
    has_credentials: true,
    portal_name: 'MCGM portal',
    bank_name: 'HDFC Bank',
    notes: 'Pay before the early-bird rebate window closes.',
  }),
  mkPayment({
    id: 'spay-emi',
    name: 'Home loan EMI',
    item_id: 'si-mumbai',
    person: 'sp-arjun',
    amount: 61500,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'monthly',
    due_date: offset(-4),
    end_date: offset(1825),
    has_credentials: true,
    portal_name: 'ICICI iMobile',
    bank_name: 'ICICI Bank',
  }),
  mkPayment({
    id: 'spay-maint',
    name: 'Society maintenance',
    item_id: 'si-mumbai',
    person: 'both',
    amount: 12000,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'monthly',
    due_date: offset(-5),
    status: 'paid',
    paid_at: offset(-6),
    paid_via: 'whatsapp',
  }),
  mkPayment({
    id: 'spay-nycrent',
    name: 'Rent received — NYC condo',
    item_id: 'si-nyc',
    person: 'sp-priya',
    amount: 3200,
    currency: 'USD',
    direction: 'incoming',
    recurrence: 'monthly',
    due_date: offset(4),
  }),
  mkPayment({
    id: 'spay-usptax',
    name: 'US property tax',
    item_id: 'si-nyc',
    person: 'both',
    amount: 1850,
    currency: 'USD',
    direction: 'outgoing',
    recurrence: 'quarterly',
    due_date: offset(39),
    notes: 'Cook County installment.',
  }),
  mkPayment({
    id: 'spay-londonrent',
    name: 'London flat rent received',
    item_id: 'si-london',
    person: 'both',
    amount: 2100,
    currency: 'GBP',
    direction: 'incoming',
    recurrence: 'monthly',
    due_date: offset(2),
  }),
  mkPayment({
    id: 'spay-council',
    name: 'UK council tax',
    item_id: 'si-london',
    person: 'both',
    amount: 184,
    currency: 'GBP',
    direction: 'outgoing',
    recurrence: 'monthly',
    due_date: offset(-9),
  }),
  mkPayment({
    id: 'spay-health',
    name: 'Family health insurance',
    item_id: 'si-health',
    person: 'both',
    amount: 47000,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'yearly',
    due_date: offset(30),
    bank_name: 'Star Health',
  }),
  mkPayment({
    id: 'spay-carins',
    name: 'Car insurance renewal',
    item_id: 'si-honda',
    person: 'sp-arjun',
    amount: 21500,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'yearly',
    due_date: offset(-20),
    status: 'paid',
    paid_at: offset(-22),
    paid_via: 'portal',
  }),
  mkPayment({
    id: 'spay-netflix',
    name: 'Netflix',
    item_id: null,
    person: 'both',
    amount: 649,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'monthly',
    due_date: offset(8),
  }),
  mkPayment({
    id: 'spay-consulting',
    name: 'Consulting income',
    item_id: 'si-sgco',
    person: 'sp-priya',
    amount: 8500,
    currency: 'SGD',
    direction: 'incoming',
    recurrence: 'monthly',
    due_date: offset(19),
  }),
  mkPayment({
    id: 'spay-gst',
    name: 'GST advance tax',
    item_id: 'si-blr',
    person: 'both',
    amount: 75000,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'quarterly',
    due_date: offset(-12),
    has_credentials: true,
    portal_name: 'GST portal',
    notes: 'Q1 FY26 advance.',
  }),
  mkPayment({
    id: 'spay-stampduty',
    name: 'Stamp duty — registration',
    item_id: 'si-mumbai',
    person: 'both',
    amount: 250000,
    currency: 'INR',
    direction: 'outgoing',
    recurrence: 'one-off',
    due_date: offset(22),
    notes: 'One-time, due at registration.',
  }),
]

const SAMPLE_REMINDERS: ReminderRule[] = [
  { id: 'sr1', household_id: HH, offset_days: -5, enabled: true, sort_order: 0, created_at: NOW_ISO },
  { id: 'sr2', household_id: HH, offset_days: -1, enabled: true, sort_order: 1, created_at: NOW_ISO },
  { id: 'sr3', household_id: HH, offset_days: 0, enabled: true, sort_order: 2, created_at: NOW_ISO },
  { id: 'sr4', household_id: HH, offset_days: 3, enabled: false, sort_order: 3, created_at: NOW_ISO },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type View = 'payments' | 'settings'

export function SamplePage({
  onExit,
  onSignup,
}: {
  onExit: () => void
  onSignup: () => void
}) {
  const [payments, setPayments] = useState<Payment[]>(INITIAL_PAYMENTS)
  const [view, setView] = useState<View>('payments')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // undefined = closed, null = create mode, Payment = edit mode
  const [editing, setEditing] = useState<Payment | null | undefined>(undefined)

  const handleSave = async (
    payload: PaymentSavePayload,
  ): Promise<Payment | null> => {
    if (editing) {
      const status =
        editing.status === 'paid'
          ? 'paid'
          : computeStatus(payload.due_date as string, TODAY)
      const updated: Payment = {
        ...editing,
        ...payload,
        item_id: payload.item_id ?? null,
        status,
        updated_at: new Date().toISOString(),
      }
      setPayments((ps) => ps.map((p) => (p.id === editing.id ? updated : p)))
      return updated
    }
    const created: Payment = mkPayment({
      id: `spay-${crypto.randomUUID().slice(0, 8)}`,
      item_id: payload.item_id ?? null,
      person: payload.person ?? 'both',
      name: payload.name,
      amount: payload.amount,
      currency: payload.currency ?? 'INR',
      direction: payload.direction,
      due_date: payload.due_date,
      recurrence: payload.recurrence ?? 'monthly',
      end_date: payload.end_date ?? null,
      portal_name: payload.portal_name ?? null,
      bank_name: payload.bank_name ?? null,
      notes: payload.notes ?? null,
    })
    setPayments((ps) => [created, ...ps])
    return created
  }

  const handleRemove = async () => {
    if (!editing) return
    setPayments((ps) => ps.filter((p) => p.id !== editing.id))
    setEditing(undefined)
  }

  const togglePaid = (p: Payment) => {
    setPayments((ps) =>
      ps.map((x) =>
        x.id === p.id
          ? {
              ...x,
              status:
                x.status === 'paid'
                  ? computeStatus(x.due_date, TODAY)
                  : 'paid',
              paid_at: x.status === 'paid' ? null : offset(0),
              paid_via: x.status === 'paid' ? null : 'portal',
            }
          : x,
      ),
    )
  }

  return (
    <div className="flex h-screen flex-col bg-cream">
      <SampleBanner onSignup={onSignup} onExit={onExit} />

      <div className="flex flex-1 overflow-hidden">
        <SampleSidebar
          active={view}
          onNavigate={(v) => {
            setView(v)
            setSidebarOpen(false)
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSignup={onSignup}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          <header className="border-b border-edge bg-cream/80 px-4 py-4 backdrop-blur md:px-10 md:py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg p-2 text-ink transition hover:bg-card md:hidden"
                  aria-label="Open menu"
                >
                  ☰
                </button>
                {view === 'payments' && (
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search payments, items, people…"
                    className="hidden w-80 rounded-full border border-edge bg-card/60 px-4 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none md:block"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <HouseholdChip household={SAMPLE_HOUSEHOLD} people={SAMPLE_PEOPLE} />
                {view === 'payments' && (
                  <button
                    onClick={() => setEditing(null)}
                    title="Add payment"
                    className="group inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-sm font-medium text-cream transition hover:bg-ink-muted md:px-5 md:py-2.5"
                  >
                    <span>+</span>
                    <span className="hidden md:inline">Add payment</span>
                  </button>
                )}
              </div>
            </div>
            {view === 'payments' && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search payments…"
                className="mt-3 block w-full rounded-full border border-edge bg-card/60 px-4 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none md:hidden"
              />
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            {view === 'payments' ? (
              <Dashboard
                household={SAMPLE_HOUSEHOLD}
                people={SAMPLE_PEOPLE}
                countries={SAMPLE_COUNTRIES}
                items={SAMPLE_ITEMS}
                payments={payments}
                fxRates={SAMPLE_FX}
                search={search}
                onEditPayment={setEditing}
                onTogglePaid={togglePaid}
              />
            ) : (
              <SampleSettings payments={payments} />
            )}
          </div>
        </main>
      </div>

      {editing !== undefined && (
        <PaymentDialog
          initial={editing}
          countries={SAMPLE_COUNTRIES}
          items={SAMPLE_ITEMS}
          people={SAMPLE_PEOPLE}
          payments={payments}
          onSave={handleSave}
          onRemove={editing ? handleRemove : undefined}
          onTogglePaid={
            editing
              ? () => {
                  togglePaid(editing)
                  setEditing(undefined)
                }
              : undefined
          }
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shell pieces
// ---------------------------------------------------------------------------

function SampleBanner({
  onSignup,
  onExit,
}: {
  onSignup: () => void
  onExit: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-edge bg-ink px-4 py-2.5 text-center text-xs text-cream">
      <span className="font-medium">
        Sample household — explore freely, nothing here is saved.
      </span>
      <span className="flex items-center gap-3">
        <button
          onClick={onSignup}
          className="font-semibold text-cream underline-offset-4 hover:underline"
        >
          Create your own →
        </button>
        <button
          onClick={onExit}
          className="text-cream/70 underline-offset-4 hover:text-cream hover:underline"
        >
          Back to login
        </button>
      </span>
    </div>
  )
}

function SampleSidebar({
  active,
  onNavigate,
  isOpen,
  onClose,
  onSignup,
}: {
  active: View
  onNavigate: (v: View) => void
  isOpen: boolean
  onClose: () => void
  onSignup: () => void
}) {
  const navItems: { key: View; label: string; icon: string }[] = [
    { key: 'payments', label: 'Payments', icon: '⌂' },
    { key: 'settings', label: 'Settings', icon: '✦' },
  ]
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-edge bg-cream px-3 py-5 transition-transform md:relative md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="mb-8 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-cream">
              <TallyMark size={18} strokeWidth={2.2} />
            </div>
            <span className="font-display text-xl font-bold tracking-tightest text-ink">
              tally
            </span>
            <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ochre">
              Sample
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-faint transition hover:bg-card hover:text-ink md:hidden"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                active === item.key
                  ? 'bg-ink text-cream'
                  : 'text-ink-muted hover:bg-card hover:text-ink',
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2">
          <div className="rounded-xl border border-edge bg-card p-4">
            <p className="text-xs leading-relaxed text-ink-muted">
              Like what you see? Spin up your own household in under a minute —
              your real payments, reminders, and people.
            </p>
            <button
              onClick={onSignup}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-cream transition hover:bg-ink-muted"
            >
              Create your household →
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function HouseholdChip({
  household,
  people,
}: {
  household: Household
  people: Person[]
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-edge bg-card/60 py-1.5 pl-3 pr-2">
      <span className="hidden text-sm font-medium text-ink sm:inline">
        {household.name}
      </span>
      <div className="flex -space-x-1.5">
        {people.map((p) => (
          <PersonAvatar
            key={p.id}
            name={p.name}
            color={p.color as AppColor}
            className="ring-2 ring-cream"
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings showcase (read-only mirror of the real Settings page)
// ---------------------------------------------------------------------------

function SampleSettings({ payments }: { payments: Payment[] }) {
  // Live preview of the WhatsApp template using a representative payment.
  const previewPayment =
    payments.find((p) => p.status !== 'paid') ?? payments[0]
  const previewPerson = SAMPLE_PEOPLE[1]
  const preview = useMemo(
    () =>
      renderPreview(
        SAMPLE_HOUSEHOLD.reminder_template,
        previewPerson,
        previewPayment,
      ),
    [previewPayment, previewPerson],
  )

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
          description="Name and members. People also receive the WhatsApp reminders."
        >
          <div className="rounded-lg border border-edge bg-cream/60 px-3 py-2 text-sm text-ink">
            {SAMPLE_HOUSEHOLD.name}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <span>{SAMPLE_PEOPLE.length} members</span>
            <span>·</span>
            <span>{SAMPLE_COUNTRIES.length} countries</span>
            <span>·</span>
            <span>{SAMPLE_ITEMS.length} items</span>
            <span>·</span>
            <span>{payments.length} payments tracked</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_PEOPLE.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-edge bg-cream/60 py-1 pl-1 pr-3"
              >
                <PersonAvatar name={p.name} color={p.color as AppColor} size="md" />
                <div className="leading-tight">
                  <div className="text-sm font-medium text-ink">{p.name}</div>
                  <div className="text-[11px] text-ink-faint">{p.whatsapp}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Currency & locale"
          description="The home currency rolls up totals on the dashboard across every currency you track."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Home currency">
              <div className="rounded-lg border border-edge bg-cream/60 px-3 py-2 text-sm text-ink">
                Indian Rupee (₹)
              </div>
            </Field>
            <Field label="Timezone">
              <div className="rounded-lg border border-edge bg-cream/60 px-3 py-2 text-sm text-ink">
                India · IST
              </div>
            </Field>
          </div>
        </Section>

        <Section
          title="Reminder cadence"
          description="When WhatsApp reminders fire for each upcoming payment."
        >
          <div className="space-y-1">
            {SAMPLE_REMINDERS.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <span className="flex-1 text-sm text-ink">
                  {formatReminderOffset(rule.offset_days)}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium',
                    rule.enabled
                      ? 'bg-sage-soft text-sage'
                      : 'bg-edge text-ink-faint',
                  )}
                >
                  {rule.enabled ? 'On' : 'Off'}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="WhatsApp"
          description="Reminders go out as freeform WhatsApp text. Parents reply PAID or SNOOZE N to mark or postpone."
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-edge bg-cream/60 p-4">
              <span className="h-2.5 w-2.5 rounded-full bg-sage" />
              <div className="text-sm font-medium text-ink">
                Twilio Sandbox configured
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Message template
              </span>
              <pre className="w-full whitespace-pre-wrap rounded-lg border border-edge bg-cream/60 px-3 py-2 font-mono text-xs leading-relaxed text-ink">
                {SAMPLE_HOUSEHOLD.reminder_template}
              </pre>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                Variables:{' '}
                {['{name}', '{payment}', '{amount}', '{when}', '{item}', '{country}', '{portal_name}', '{bank_name}', '{notes}'].map(
                  (v) => (
                    <code key={v} className="mr-1 text-ink">
                      {v}
                    </code>
                  ),
                )}
              </p>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Preview
              </span>
              <div className="rounded-xl border border-edge bg-sage-soft/40 p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm text-ink">
                  {preview}
                </pre>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Data"
          description="In the real app you can export your whole household to JSON, or delete it and start fresh."
        >
          <div className="flex items-center justify-between rounded-xl border border-edge bg-cream/60 p-4 opacity-70">
            <div>
              <div className="text-sm font-medium text-ink">Export household data</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                Available once you create your own household.
              </div>
            </div>
            <span className="rounded-full border border-edge bg-card px-4 py-2 text-sm font-medium text-ink-faint">
              Download JSON
            </span>
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

// Minimal template renderer for the settings preview — mirrors how the real
// reminder text is built so the showcase reflects actual behaviour.
function renderPreview(
  template: string,
  person: Person,
  payment: Payment,
): string {
  const item = findItem(SAMPLE_ITEMS, payment.item_id)
  const country = item ? findCountry(SAMPLE_COUNTRIES, item.country_id) : undefined
  const diff = relativeDays(payment.due_date)
  const when =
    diff < 0
      ? `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} ago`
      : diff === 0
        ? 'today'
        : diff === 1
          ? 'tomorrow'
          : diff < 7
            ? `in ${diff} days`
            : diff < 14
              ? 'next week'
              : `in ${Math.round(diff / 7)} weeks`

  let amount = `${payment.amount} ${payment.currency}`
  try {
    amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: payment.currency,
      maximumFractionDigits: 0,
    }).format(payment.amount)
  } catch {
    // keep fallback
  }

  const vars: Record<string, string> = {
    name: person.name || 'there',
    payment: payment.name,
    item: item?.name ?? 'Unlinked',
    country: country?.name ?? '',
    amount,
    currency: payment.currency,
    when,
    portal_name: payment.portal_name ?? 'the portal',
    bank_name: payment.bank_name ?? '',
    notes: payment.notes ?? '',
  }
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}
