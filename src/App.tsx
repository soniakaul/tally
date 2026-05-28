import { useEffect, useState } from 'react'
import { AuthGate } from './components/AuthGate'
import { Sidebar } from './components/Sidebar'
import { StatCard } from './components/StatCard'
import { PaymentsTable } from './components/PaymentsTable'
import { HouseholdChip } from './components/HouseholdChip'
import { HouseholdDialog } from './components/HouseholdDialog'
import {
  PaymentDialog,
  type PaymentSavePayload,
} from './components/PaymentDialog'
import { CategoriesPage } from './pages/CategoriesPage'
import { SettingsPage } from './pages/SettingsPage'
import type { Payment } from './state/payments'
import type { Household, Person } from './state/household'
import type { Category } from './state/categories'
import {
  cn,
  computeStatus,
  convertToHome,
  formatCurrency,
  formatToday,
  relativeDays,
} from './lib/utils'
import {
  coldStartSnapshot,
  fetchFxRates,
  getCachedRates,
  isStale,
  setCachedRates,
  type FxSnapshot,
} from './lib/fx'
import { findCategory } from './state/categories'
import { useAuth } from './state/auth'
import { useHousehold } from './hooks/useHousehold'
import { usePeople } from './hooks/usePeople'
import { useCategories } from './hooks/useCategories'
import { usePayments } from './hooks/usePayments'
import { useReminders } from './hooks/useReminders'

const TODAY = new Date()

export default function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  )
}

function AppShell() {
  const { household } = useHousehold()
  const { people } = usePeople()
  const { categories } = useCategories()
  const {
    payments,
    add: addPayment,
    update: updatePayment,
    remove: removePayment,
    togglePaid,
  } = usePayments()
  const { reminders, remove: removeReminder } = useReminders()
  const { signOut } = useAuth()

  const [householdOpen, setHouseholdOpen] = useState(false)
  const [activePage, setActivePage] = useState<string>('dashboard')
  const [editingPayment, setEditingPayment] = useState<
    Payment | null | undefined
  >(undefined)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Prefer ANY cached snapshot over hardcoded fallback — even a stale cache
  // is way more accurate than constants we baked in months ago.
  // Hardcoded only kicks in for brand-new users who can't reach the API at all.
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot>(
    () => getCachedRates() ?? coldStartSnapshot,
  )

  useEffect(() => {
    const cached = getCachedRates()
    // If today's rates are already cached, nothing to do.
    if (cached && !isStale(cached)) return

    fetchFxRates()
      .then((snapshot) => {
        setCachedRates(snapshot)
        setFxSnapshot(snapshot)
      })
      .catch((err) => {
        // Keep the stale cache (already in state from useState init) — it's
        // a far better fallback than the hardcoded constants would be.
        console.warn(
          'FX fetch failed, sticking with last cached rates',
          err,
        )
      })
  }, [])

  const handleSavePayment = async (payload: PaymentSavePayload) => {
    if (editingPayment) {
      // Recompute status if dueDate changed and not paid
      const status =
        editingPayment.status === 'paid'
          ? 'paid'
          : computeStatus(payload.due_date as string, TODAY)
      await updatePayment({
        id: editingPayment.id,
        patch: { ...payload, status },
      })
    } else {
      await addPayment({
        ...payload,
        status: computeStatus(payload.due_date as string, TODAY),
      })
    }
    setEditingPayment(undefined)
  }

  const handleRemovePayment = async () => {
    if (!editingPayment) return
    await removePayment(editingPayment.id)
    setEditingPayment(undefined)
  }

  const handleDeleteHousehold = async () => {
    // Cascades via FK ON DELETE CASCADE — deleting the household row removes
    // everything attached. RLS allows it because the user owns it.
    if (!household) return
    // Delete payments, categories, people, reminders aren't strictly needed
    // because of CASCADE, but doing it explicitly is more obvious for debugging.
    await Promise.all(reminders.map((r) => removeReminder(r.id)))
    // For now, sign out — the household row deletion would need an RPC since
    // the FK from profiles.household_id with CASCADE will nuke the profile.
    // Simplest: sign out and let user manage from Supabase dashboard if needed.
    await signOut()
  }

  const handleNavigate = (key: string) => {
    setActivePage(key)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-screen bg-cream">
      <Sidebar
        active={activePage}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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
                <HamburgerIcon />
              </button>
              {activePage === 'dashboard' && (
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search payments, categories, people…"
                  className="hidden w-80 rounded-full border border-edge bg-card/60 px-4 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none md:block"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <HouseholdChip
                household={household}
                people={people}
                onClick={() => setHouseholdOpen(true)}
              />
              {activePage === 'dashboard' && (
                <button
                  onClick={() => setEditingPayment(null)}
                  className="group inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-sm font-medium text-cream transition hover:bg-ink-muted md:px-5 md:py-2.5"
                  title="Add payment"
                >
                  <span>+</span>
                  <span className="hidden md:inline">Add payment</span>
                  <span className="hidden transition group-hover:translate-x-0.5 md:inline">
                    →
                  </span>
                </button>
              )}
            </div>
          </div>
          {activePage === 'dashboard' && (
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
          {activePage === 'dashboard' && (
            <Dashboard
              household={household}
              people={people}
              categories={categories}
              payments={payments}
              fxRates={fxSnapshot.rates}
              search={search}
              onEditPayment={setEditingPayment}
              onTogglePaid={togglePaid}
            />
          )}
          {activePage === 'categories' && <CategoriesPage />}
          {activePage === 'settings' && (
            <SettingsPage
              fxSnapshot={fxSnapshot}
              onDeleteHousehold={handleDeleteHousehold}
            />
          )}
        </div>
      </main>

      {householdOpen && (
        <HouseholdDialog onClose={() => setHouseholdOpen(false)} />
      )}

      {editingPayment !== undefined && (
        <PaymentDialog
          initial={editingPayment}
          categories={categories}
          people={people}
          onSave={handleSavePayment}
          onRemove={editingPayment ? handleRemovePayment : undefined}
          onTogglePaid={
            editingPayment
              ? () => {
                  togglePaid(editingPayment)
                  setEditingPayment(undefined)
                }
              : undefined
          }
          onClose={() => setEditingPayment(undefined)}
        />
      )}
    </div>
  )
}

type DashboardFilters = {
  person: 'all' | string
  overdueOnly: boolean
  minAmount: string
  maxAmount: string
}

function Dashboard({
  household,
  people,
  categories,
  payments,
  fxRates,
  search,
  onEditPayment,
  onTogglePaid,
}: {
  household: Household | null
  people: Person[]
  categories: Category[]
  payments: Payment[]
  fxRates: Record<string, number>
  search: string
  onEditPayment: (p: Payment) => void
  onTogglePaid: (p: Payment) => void
}) {
  const [filters, setFilters] = useState<DashboardFilters>({
    person: 'all',
    overdueOnly: false,
    minAmount: '',
    maxAmount: '',
  })

  const homeCurrency = household?.home_currency ?? 'INR'

  const upcoming = payments.filter(
    (p) => p.status === 'upcoming' && relativeDays(p.due_date, TODAY) <= 7,
  )
  const paidThisMonth = payments.filter((p) => p.status === 'paid')
  const overdue = payments.filter((p) => p.status === 'overdue')
  const monthlyOutflow = payments
    .filter((p) => p.recurrence === 'monthly')
    .reduce(
      (sum, p) =>
        sum + convertToHome(p.amount, p.currency, homeCurrency, fxRates),
      0,
    )
  const dueThisWeekTotal = upcoming.reduce(
    (sum, p) =>
      sum + convertToHome(p.amount, p.currency, homeCurrency, fxRates),
    0,
  )

  const minN = filters.minAmount ? parseFloat(filters.minAmount) : null
  const maxN = filters.maxAmount ? parseFloat(filters.maxAmount) : null
  const q = search.trim().toLowerCase()

  const matchesSearch = (p: Payment): boolean => {
    if (!q) return true
    if (p.name.toLowerCase().includes(q)) return true
    const cat = findCategory(categories, p.category_id)
    if (cat?.name.toLowerCase().includes(q)) return true
    if (p.person === 'both' && 'both shared'.includes(q)) return true
    const person = people.find((per) => per.id === p.person)
    if (person?.name.toLowerCase().includes(q)) return true
    return false
  }

  const filtered = payments.filter((p) => {
    if (!matchesSearch(p)) return false
    if (filters.person !== 'all' && p.person !== filters.person) return false
    if (filters.overdueOnly && p.status !== 'overdue') return false
    const homeAmount = convertToHome(
      p.amount,
      p.currency,
      homeCurrency,
      fxRates,
    )
    if (minN != null && homeAmount < minN) return false
    if (maxN != null && homeAmount > maxN) return false
    return true
  })

  const sortedPayments = [...filtered].sort((a, b) => {
    const sa = a.status === 'overdue' ? -1 : a.status === 'paid' ? 1 : 0
    const sb = b.status === 'overdue' ? -1 : b.status === 'paid' ? 1 : 0
    if (sa !== sb) return sa - sb
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  })

  const currencySymbol = formatCurrency(0, homeCurrency).replace(
    /[\d.,\s]/g,
    '',
  )

  const firstPerson = people[0]
  const subtitleReminder = firstPerson
    ? `${firstPerson.name} will get the next reminder`
    : 'add people to start sending reminders'

  const clearFilters = () =>
    setFilters({ person: 'all', overdueOnly: false, minAmount: '', maxAmount: '' })

  const hasFilter =
    filters.person !== 'all' ||
    filters.overdueOnly ||
    filters.minAmount !== '' ||
    filters.maxAmount !== '' ||
    q !== ''

  return (
    <div className="dotted-bg px-4 pb-16 pt-8 md:px-10 md:pt-10">
      <div className="mb-8 md:mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          {formatToday(TODAY)}
        </p>
        <h1 className="font-display text-4xl font-bold leading-[0.95] tracking-tightest md:text-6xl">
          Everything due
          <br />
          this month.
        </h1>
        <p className="mt-3 text-sm text-ink-muted md:mt-4 md:text-base">
          {upcoming.length} payments coming up · {overdue.length} overdue ·{' '}
          {subtitleReminder}.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mb-10 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="due this week"
          value={String(upcoming.length)}
          subtitle={`${formatCurrency(dueThisWeekTotal, homeCurrency)} total`}
          icon={<CalendarIcon />}
        />
        <StatCard
          label="paid this month"
          value={String(paidThisMonth.length)}
          subtitle={paidThisMonth.length === 0 ? '—' : 'all on time'}
          icon={<CheckIcon />}
        />
        <StatCard
          label="overdue"
          value={String(overdue.length)}
          subtitle={overdue[0]?.name ?? 'nothing'}
          icon={<AlertIcon />}
        />
        <StatCard
          label="monthly outflow"
          value={formatCurrency(monthlyOutflow, homeCurrency)}
          subtitle={`across ${categories.length} categories`}
          icon={<ChartIcon />}
        />
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tightest md:text-2xl">
              All payments
            </h2>
            <p className="mt-1 text-xs text-ink-muted md:text-sm">
              {sortedPayments.length} of {payments.length} shown · click any row
              to edit
            </p>
          </div>
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-ink-muted underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FilterChip
            label="All"
            active={filters.person === 'all' && !filters.overdueOnly}
            onClick={() =>
              setFilters({ ...filters, person: 'all', overdueOnly: false })
            }
          />
          {people.map((p) => (
            <FilterChip
              key={p.id}
              label={p.name || 'Unnamed'}
              active={filters.person === p.id}
              onClick={() =>
                setFilters({
                  ...filters,
                  person: filters.person === p.id ? 'all' : p.id,
                })
              }
            />
          ))}
          <FilterChip
            label={people.length > 2 ? 'Shared' : 'Both'}
            active={filters.person === 'both'}
            onClick={() =>
              setFilters({
                ...filters,
                person: filters.person === 'both' ? 'all' : 'both',
              })
            }
          />
          <FilterChip
            label="Overdue"
            active={filters.overdueOnly}
            onClick={() =>
              setFilters({ ...filters, overdueOnly: !filters.overdueOnly })
            }
          />

          <div className="flex items-center gap-2 rounded-full border border-edge bg-card/60 px-3 py-1.5 md:ml-auto">
            <span className="text-xs font-medium text-ink-muted">Amount</span>
            <span className="text-xs text-ink-faint">{currencySymbol}</span>
            <input
              type="number"
              min="0"
              value={filters.minAmount}
              onChange={(e) =>
                setFilters({ ...filters, minAmount: e.target.value })
              }
              placeholder="min"
              className="w-14 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none md:w-16"
            />
            <span className="text-ink-faint">–</span>
            <input
              type="number"
              min="0"
              value={filters.maxAmount}
              onChange={(e) =>
                setFilters({ ...filters, maxAmount: e.target.value })
              }
              placeholder="max"
              className="w-14 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none md:w-16"
            />
          </div>
        </div>
      </div>

      {sortedPayments.length > 0 ? (
        <PaymentsTable
          payments={sortedPayments}
          people={people}
          categories={categories}
          onEditPayment={onEditPayment}
          onTogglePaid={onTogglePaid}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-edge bg-card/40 px-6 py-12 text-center">
          <p className="text-sm text-ink-muted">
            {payments.length === 0
              ? 'No payments yet. Hit "Add payment" up top to track your first one.'
              : q
                ? `No payments match "${q}"`
                : 'No payments match these filters.'}
          </p>
          {hasFilter && payments.length > 0 && (
            <button
              onClick={clearFilters}
              className="mt-2 text-xs font-medium text-ink underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'bg-ink text-cream'
          : 'border border-edge bg-card/60 text-ink-muted hover:bg-card hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2l6.5 11h-13L8 2z" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.5v.01" strokeLinecap="round" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 14h12M4 11V7M7 11V4M10 11V8M13 11V5" strokeLinecap="round" />
    </svg>
  )
}
