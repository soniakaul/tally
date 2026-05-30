import { useEffect, useMemo, useState } from 'react'
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
import { ItemsPage } from './pages/ItemsPage'
import { SettingsPage } from './pages/SettingsPage'
import type { Payment } from './state/payments'
import type { Household, Person } from './state/household'
import type { Country } from './state/country'
import type { Item } from './state/item'
import {
  cn,
  computeStatus,
  convertToHome,
  formatCurrency,
  formatToday,
} from './lib/utils'
import {
  coldStartSnapshot,
  fetchFxRates,
  getCachedRates,
  isStale,
  setCachedRates,
  type FxSnapshot,
} from './lib/fx'
import { findItem } from './state/item'
import { findCountry } from './state/country'
import { useAuth } from './state/auth'
import { useHousehold } from './hooks/useHousehold'
import { usePeople } from './hooks/usePeople'
import { useCountries } from './hooks/useCountries'
import { useItems } from './hooks/useItems'
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
  const { countries } = useCountries()
  const { items } = useItems()
  const {
    payments,
    add: addPayment,
    update: updatePayment,
    removeScoped: removeScopedPayment,
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
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot>(
    () => getCachedRates() ?? coldStartSnapshot,
  )

  useEffect(() => {
    const cached = getCachedRates()
    if (cached && !isStale(cached)) return

    fetchFxRates()
      .then((snapshot) => {
        setCachedRates(snapshot)
        setFxSnapshot(snapshot)
      })
      .catch((err) => {
        console.warn(
          'FX fetch failed, sticking with last cached rates',
          err,
        )
      })
  }, [])

  const handleSavePayment = async (payload: PaymentSavePayload) => {
    if (editingPayment) {
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

  const handleRemovePayment = async (
    scope: 'one' | 'future' | 'all',
  ) => {
    if (!editingPayment) return
    await removeScopedPayment({ payment: editingPayment, scope })
    setEditingPayment(undefined)
  }

  const handleDeleteHousehold = async () => {
    if (!household) return
    await Promise.all(reminders.map((r) => removeReminder(r.id)))
    await signOut()
  }

  const handleNavigate = (key: string) => {
    setActivePage(key)
    setSidebarOpen(false)
  }

  const canAddPayment = countries.length > 0 && items.length > 0

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
                  placeholder="Search payments, items, people…"
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
                  disabled={!canAddPayment}
                  title={
                    canAddPayment
                      ? 'Add payment'
                      : 'Add a country and item first'
                  }
                  className={cn(
                    'group inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition md:px-5 md:py-2.5',
                    canAddPayment
                      ? 'bg-ink text-cream hover:bg-ink-muted'
                      : 'cursor-not-allowed bg-edge text-ink-faint',
                  )}
                >
                  <span>+</span>
                  <span className="hidden md:inline">Add payment</span>
                  {canAddPayment && (
                    <span className="hidden transition group-hover:translate-x-0.5 md:inline">
                      →
                    </span>
                  )}
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
              countries={countries}
              items={items}
              payments={payments}
              fxRates={fxSnapshot.rates}
              search={search}
              onEditPayment={setEditingPayment}
              onTogglePaid={togglePaid}
            />
          )}
          {activePage === 'items' && <ItemsPage />}
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
          countries={countries}
          items={items}
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
  countryId: 'all' | string
  itemId: 'all' | string
  person: 'all' | string
  overdueOnly: boolean
  minAmount: string
  maxAmount: string
}

function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  )
}

function Dashboard({
  household,
  people,
  countries,
  items,
  payments,
  fxRates,
  search,
  onEditPayment,
  onTogglePaid,
}: {
  household: Household | null
  people: Person[]
  countries: Country[]
  items: Item[]
  payments: Payment[]
  fxRates: Record<string, number>
  search: string
  onEditPayment: (p: Payment) => void
  onTogglePaid: (p: Payment) => void
}) {
  const [filters, setFilters] = useState<DashboardFilters>({
    countryId: 'all',
    itemId: 'all',
    person: 'all',
    overdueOnly: false,
    minAmount: '',
    maxAmount: '',
  })

  const homeCurrency = household?.home_currency ?? 'INR'
  const monthName = TODAY.toLocaleDateString('en-US', { month: 'long' })

  // When the user filters to a single country (directly, or implicitly by
  // picking an item that belongs to one country), the stat cards switch to
  // that country's currency. Otherwise we stay in the home currency so totals
  // across multiple currencies roll up sensibly.
  const filterCountry = (() => {
    if (filters.countryId !== 'all') {
      return findCountry(countries, filters.countryId)
    }
    if (filters.itemId !== 'all') {
      const item = findItem(items, filters.itemId)
      return item ? findCountry(countries, item.country_id) : undefined
    }
    return undefined
  })()
  const statCurrency = filterCountry?.currency_code ?? homeCurrency

  // Country filter resets the item filter (since item belongs to country).
  const setCountryFilter = (cid: string) => {
    setFilters((f) => ({
      ...f,
      countryId: cid,
      itemId: cid === 'all' ? f.itemId : 'all',
    }))
  }

  // Items the user can pick from in the filter — restricted to the currently
  // filtered country if one is set.
  const availableItems = useMemo(
    () =>
      filters.countryId === 'all'
        ? items
        : items.filter((i) => i.country_id === filters.countryId),
    [items, filters.countryId],
  )

  const minN = filters.minAmount ? parseFloat(filters.minAmount) : null
  const maxN = filters.maxAmount ? parseFloat(filters.maxAmount) : null
  const q = search.trim().toLowerCase()

  const matchesSearch = (p: Payment): boolean => {
    if (!q) return true
    if (p.name.toLowerCase().includes(q)) return true
    const item = findItem(items, p.item_id)
    if (item?.name.toLowerCase().includes(q)) return true
    if (item?.type.toLowerCase().includes(q)) return true
    const country = item ? findCountry(countries, item.country_id) : undefined
    if (country?.name.toLowerCase().includes(q)) return true
    if (p.person === 'both' && 'both shared'.includes(q)) return true
    const person = people.find((per) => per.id === p.person)
    if (person?.name.toLowerCase().includes(q)) return true
    return false
  }

  const passesStructuralFilters = (p: Payment): boolean => {
    if (filters.countryId !== 'all') {
      const item = findItem(items, p.item_id)
      if (!item || item.country_id !== filters.countryId) return false
    }
    if (filters.itemId !== 'all' && p.item_id !== filters.itemId) return false
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
  }

  // Visible rows in the table = full filter set including search.
  const filtered = payments.filter(
    (p) => passesStructuralFilters(p) && matchesSearch(p),
  )

  // Stat cards reflect structural filters (country/item/person/overdue/amount)
  // but ignore the search box — search is a quick view tool, not a budget knob.
  const inScopeForStats = payments.filter(passesStructuralFilters)
  const thisMonth = inScopeForStats.filter((p) => isSameMonth(p.due_date, TODAY))
  const inflowThisMonth = thisMonth
    .filter((p) => p.direction === 'incoming')
    .reduce(
      (sum, p) =>
        sum + convertToHome(p.amount, p.currency, statCurrency, fxRates),
      0,
    )
  const outflowThisMonth = thisMonth
    .filter((p) => p.direction === 'outgoing')
    .reduce(
      (sum, p) =>
        sum + convertToHome(p.amount, p.currency, statCurrency, fxRates),
      0,
    )
  const overdueCount = inScopeForStats.filter((p) => p.status === 'overdue')
    .length
  const inflowCount = thisMonth.filter((p) => p.direction === 'incoming').length
  const outflowCount = thisMonth.filter((p) => p.direction === 'outgoing').length

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

  const clearFilters = () =>
    setFilters({
      countryId: 'all',
      itemId: 'all',
      person: 'all',
      overdueOnly: false,
      minAmount: '',
      maxAmount: '',
    })

  const hasFilter =
    filters.countryId !== 'all' ||
    filters.itemId !== 'all' ||
    filters.person !== 'all' ||
    filters.overdueOnly ||
    filters.minAmount !== '' ||
    filters.maxAmount !== '' ||
    q !== ''

  const statScopeLabel = (() => {
    if (filters.countryId === 'all' && filters.itemId === 'all') return null
    const country = findCountry(countries, filters.countryId)
    const item = findItem(items, filters.itemId)
    if (item) return `for ${item.name}`
    if (country) return `in ${country.name}`
    return null
  })()

  return (
    <div className="dotted-bg px-4 pb-16 pt-8 md:px-10 md:pt-10">
      <div className="mb-8 md:mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          {formatToday(TODAY)}
        </p>
        <h1 className="font-display text-4xl font-bold leading-[0.95] tracking-tightest md:text-6xl">
          payments.
        </h1>
        <p className="mt-3 text-sm text-ink-muted md:mt-4 md:text-base">
          {inflowCount + outflowCount} payments due this month ·{' '}
          {overdueCount} overdue
          {statScopeLabel ? ` · ${statScopeLabel}` : ''}.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 md:mb-10 md:gap-4">
        <StatCard
          label={`incoming · ${monthName.toLowerCase()}`}
          value={formatCurrency(inflowThisMonth, statCurrency)}
          subtitle={inflowCount === 0 ? '—' : `${inflowCount} payment${inflowCount === 1 ? '' : 's'}`}
          icon={<ArrowDownIcon />}
        />
        <StatCard
          label={`outgoing · ${monthName.toLowerCase()}`}
          value={formatCurrency(outflowThisMonth, statCurrency)}
          subtitle={outflowCount === 0 ? '—' : `${outflowCount} payment${outflowCount === 1 ? '' : 's'}`}
          icon={<ArrowUpIcon />}
        />
        <StatCard
          label="overdue"
          value={String(overdueCount)}
          subtitle={
            overdueCount === 0
              ? 'all caught up'
              : `oldest: ${[...inScopeForStats]
                  .filter((p) => p.status === 'overdue')
                  .sort(
                    (a, b) =>
                      new Date(a.due_date).getTime() -
                      new Date(b.due_date).getTime(),
                  )[0]?.name ?? '—'}`
          }
          icon={<AlertIcon />}
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
          <FilterSelect
            label="Country"
            value={filters.countryId}
            onChange={setCountryFilter}
            options={[
              { value: 'all', label: 'All countries' },
              ...countries.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.currency_code})`,
              })),
            ]}
          />
          <FilterSelect
            label="Item"
            value={filters.itemId}
            onChange={(v) => setFilters({ ...filters, itemId: v })}
            disabled={availableItems.length === 0}
            options={[
              {
                value: 'all',
                label:
                  filters.countryId === 'all' ? 'All items' : 'All items in country',
              },
              ...availableItems.map((i) => ({
                value: i.id,
                label: `${i.name} · ${i.type}`,
              })),
            ]}
          />

          <FilterChip
            label="Overdue"
            active={filters.overdueOnly}
            onClick={() =>
              setFilters({ ...filters, overdueOnly: !filters.overdueOnly })
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
          countries={countries}
          items={items}
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full border border-edge bg-card/60 pl-3 pr-7 text-xs font-medium text-ink-muted',
        disabled && 'opacity-60',
      )}
    >
      <span className="text-ink-faint">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="cursor-pointer appearance-none bg-transparent py-1.5 pr-1 text-xs font-medium text-ink focus:outline-none disabled:cursor-not-allowed"
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

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  )
}
function ArrowDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v10M3 8l5 5 5-5" />
    </svg>
  )
}
function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V3M3 8l5-5 5 5" />
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
