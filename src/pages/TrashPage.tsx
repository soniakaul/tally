import { useMemo, useState } from 'react'
import { useTrash } from '../hooks/useTrash'
import { useCountries } from '../hooks/useCountries'
import { useItems } from '../hooks/useItems'
import { usePayments } from '../hooks/usePayments'
import { usePeople } from '../hooks/usePeople'
import { cn, formatCurrency, formatDate } from '../lib/utils'

// Auto-purge runs nightly on rows older than this many days.
const PURGE_AFTER_DAYS = 30

// Window for the tap-again-to-confirm pattern on destructive actions.
const CONFIRM_WINDOW_MS = 4000

// Display a soft-deleted-at timestamp as a friendly relative string.
function formatDeletedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

// Days remaining before the row gets auto-purged. 0 means "any minute now"
// — the next nightly job will sweep it.
function daysUntilPurge(deletedAt: string | null): number {
  if (!deletedAt) return PURGE_AFTER_DAYS
  const elapsedMs = Date.now() - new Date(deletedAt).getTime()
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000)
  return Math.max(0, Math.ceil(PURGE_AFTER_DAYS - elapsedDays))
}

function purgeLabel(deletedAt: string | null): string {
  const d = daysUntilPurge(deletedAt)
  if (d === 0) return 'purges tonight'
  if (d === 1) return 'purges in 1 day'
  return `purges in ${d} days`
}

export function TrashPage() {
  const { contents, totalCount, isLoading } = useTrash()
  const {
    restore: restoreCountry,
    purge: purgeCountry,
  } = useCountries()
  const { restore: restoreItem, purge: purgeItem } = useItems()
  const { restore: restorePayment, purge: purgePayment } = usePayments()
  const { restore: restorePerson, purge: purgePerson } = usePeople()

  // Top-of-page error banner — shown if a purge fails (most likely the
  // "country still has items" guard from useCountries.purge).
  const [topError, setTopError] = useState<string | null>(null)

  // Tap-again-to-confirm for Empty Trash. null = idle, number = armed-at-ms.
  const [emptyArmedAt, setEmptyArmedAt] = useState<number | null>(null)
  const [emptying, setEmptying] = useState(false)

  // For payments we want a friendly "Item · Country" label even if the parent
  // is also in trash — pull from the trash maps.
  const deletedCountriesById = useMemo(() => {
    const m = new Map<string, (typeof contents.countries)[number]>()
    for (const c of contents.countries) m.set(c.id, c)
    return m
  }, [contents.countries])
  const deletedItemsById = useMemo(() => {
    const m = new Map<string, (typeof contents.items)[number]>()
    for (const i of contents.items) m.set(i.id, i)
    return m
  }, [contents.items])

  // Restoring a payment cascade-restores its item + country if those are
  // also in trash. Otherwise the restored payment would re-appear "Unlinked".
  const handleRestorePayment = async (paymentId: string, itemId: string | null) => {
    if (itemId) {
      const itemInTrash = deletedItemsById.get(itemId)
      if (itemInTrash) {
        const countryInTrash = deletedCountriesById.get(itemInTrash.country_id)
        if (countryInTrash) await restoreCountry(countryInTrash.id)
        await restoreItem(itemInTrash.id)
      }
    }
    await restorePayment(paymentId)
  }

  const handleRestoreItem = async (itemId: string, countryId: string) => {
    const countryInTrash = deletedCountriesById.get(countryId)
    if (countryInTrash) await restoreCountry(countryInTrash.id)
    await restoreItem(itemId)
  }

  // Wrap each purge with error capture so the failure surfaces in the top
  // banner (e.g. "Can't delete this country — N items still reference it.").
  const wrapPurge =
    (fn: (id: string) => Promise<void>) => async (id: string) => {
      setTopError(null)
      try {
        await fn(id)
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Delete failed. Please try again.'
        setTopError(msg)
        throw err
      }
    }

  // Empty trash: payments → items → countries → people, in that order so
  // countries' "no items reference me" guard sees an empty items table by
  // the time we try them. Per-country errors are collected, not fatal.
  const handleEmptyTrash = async () => {
    if (emptying) return
    const now = Date.now()
    if (emptyArmedAt === null || now - emptyArmedAt > CONFIRM_WINDOW_MS) {
      setEmptyArmedAt(now)
      return
    }
    setEmptyArmedAt(null)
    setEmptying(true)
    setTopError(null)
    const failures: string[] = []
    try {
      for (const p of contents.payments) {
        try {
          await purgePayment(p.id)
        } catch (e) {
          failures.push(`Payment "${p.name}"`)
        }
      }
      for (const i of contents.items) {
        try {
          await purgeItem(i.id)
        } catch (e) {
          failures.push(`Item "${i.name}"`)
        }
      }
      for (const c of contents.countries) {
        try {
          await purgeCountry(c.id)
        } catch (e) {
          failures.push(`Country "${c.name}"`)
        }
      }
      for (const person of contents.people) {
        try {
          await purgePerson(person.id)
        } catch (e) {
          failures.push(`Person "${person.name || 'Unnamed'}"`)
        }
      }
      if (failures.length > 0) {
        setTopError(
          `Couldn't delete ${failures.length} row${failures.length === 1 ? '' : 's'}: ${failures.join(', ')}. Likely needs cleanup first.`,
        )
      }
    } finally {
      setEmptying(false)
    }
  }

  if (isLoading) {
    return (
      <div className="dotted-bg min-h-full px-4 pb-16 pt-8 md:px-10 md:pt-10">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="dotted-bg min-h-full px-4 pb-16 pt-8 md:px-10 md:pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 md:mb-10">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Safety net
          </p>
          <h1 className="font-display text-3xl font-bold leading-[0.95] tracking-tightest md:text-5xl">
            Trash
          </h1>
          <p className="mt-3 text-sm text-ink-muted md:mt-4 md:text-base">
            Anything deleted shows up here. Restore brings it back where it was.
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Rows are automatically removed {PURGE_AFTER_DAYS} days after deletion.
          </p>
        </div>
        {totalCount > 0 && (
          <button
            onClick={() => void handleEmptyTrash()}
            disabled={emptying}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition',
              emptyArmedAt !== null
                ? 'bg-terracotta text-cream hover:bg-terracotta/90'
                : 'border border-terracotta/40 bg-cream text-terracotta hover:bg-terracotta hover:text-cream',
              emptying && 'cursor-not-allowed opacity-60',
            )}
          >
            {emptying
              ? 'Emptying…'
              : emptyArmedAt !== null
                ? 'Tap again to empty trash'
                : 'Empty trash'}
          </button>
        )}
      </div>

      {topError && (
        <div className="mb-5 rounded-lg border border-terracotta/30 bg-terracotta-soft px-4 py-3 text-sm text-terracotta">
          {topError}
        </div>
      )}

      {totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-edge bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-ink-muted">
            Trash is empty. Nothing has been deleted yet.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {contents.payments.length > 0 && (
            <Section title={`Payments (${contents.payments.length})`}>
              {contents.payments.map((p) => {
                const item = p.item_id ? deletedItemsById.get(p.item_id) : null
                const country = item
                  ? deletedCountriesById.get(item.country_id)
                  : null
                const subtitle = [
                  item?.name,
                  country?.name,
                  formatDate(p.due_date),
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <Row
                    key={p.id}
                    name={p.name}
                    subtitle={subtitle || formatDate(p.due_date)}
                    right={formatCurrency(p.amount, p.currency)}
                    deletedAt={p.deleted_at}
                    onRestore={() => handleRestorePayment(p.id, p.item_id)}
                    onPurge={() => wrapPurge(purgePayment)(p.id)}
                  />
                )
              })}
            </Section>
          )}

          {contents.items.length > 0 && (
            <Section title={`Items (${contents.items.length})`}>
              {contents.items.map((i) => (
                <Row
                  key={i.id}
                  name={i.name}
                  subtitle={i.type}
                  deletedAt={i.deleted_at}
                  onRestore={() => handleRestoreItem(i.id, i.country_id)}
                  onPurge={() => wrapPurge(purgeItem)(i.id)}
                />
              ))}
            </Section>
          )}

          {contents.countries.length > 0 && (
            <Section title={`Countries (${contents.countries.length})`}>
              {contents.countries.map((c) => (
                <Row
                  key={c.id}
                  name={c.name}
                  subtitle={c.currency_code}
                  deletedAt={c.deleted_at}
                  onRestore={() => restoreCountry(c.id)}
                  onPurge={() => wrapPurge(purgeCountry)(c.id)}
                />
              ))}
            </Section>
          )}

          {contents.people.length > 0 && (
            <Section title={`People (${contents.people.length})`}>
              {contents.people.map((p) => (
                <Row
                  key={p.id}
                  name={p.name || 'Unnamed'}
                  subtitle={p.whatsapp || '—'}
                  deletedAt={p.deleted_at}
                  onRestore={() => restorePerson(p.id)}
                  onPurge={() => wrapPurge(purgePerson)(p.id)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-edge bg-card/60 p-5">
      <h2 className="mb-3 font-display text-lg font-bold tracking-tightest text-ink">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Row({
  name,
  subtitle,
  right,
  deletedAt,
  onRestore,
  onPurge,
}: {
  name: string
  subtitle?: string
  right?: string
  deletedAt: string | null
  onRestore: () => void | Promise<void>
  onPurge: () => void | Promise<void>
}) {
  // Tap-again-to-confirm: first click arms the button for CONFIRM_WINDOW_MS,
  // second click within the window actually fires the purge.
  const [armedAt, setArmedAt] = useState<number | null>(null)

  const handlePurgeClick = async () => {
    const now = Date.now()
    if (armedAt === null || now - armedAt > CONFIRM_WINDOW_MS) {
      setArmedAt(now)
      return
    }
    setArmedAt(null)
    try {
      await onPurge()
    } catch {
      // The error has already been surfaced upstream via setTopError; we just
      // re-disarm so the user has to start over.
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-cream/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{name}</div>
        {subtitle && (
          <div className="mt-0.5 text-xs text-ink-faint">{subtitle}</div>
        )}
      </div>
      {right && (
        <div className="font-display text-sm font-semibold tracking-tight text-ink-muted">
          {right}
        </div>
      )}
      <div className="text-right text-xs text-ink-faint">
        <div>deleted {formatDeletedAt(deletedAt)}</div>
        <div className="mt-0.5 text-[10px]">{purgeLabel(deletedAt)}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void handlePurgeClick()}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition',
            armedAt !== null
              ? 'bg-terracotta text-cream hover:bg-terracotta/90'
              : 'text-terracotta hover:bg-terracotta-soft',
          )}
        >
          {armedAt !== null ? 'Tap again' : 'Delete forever'}
        </button>
        <button
          onClick={() => void onRestore()}
          className="rounded-full border border-edge bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-ink hover:text-cream"
        >
          ↺ Restore
        </button>
      </div>
    </div>
  )
}
