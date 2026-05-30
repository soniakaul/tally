import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import {
  COMMON_CURRENCIES,
  COUNTRY_PRESETS,
  type Country,
} from '../state/country'

export type CountrySavePayload = {
  name: string
  currency_code: string
}

type Props = {
  initial: Country | null // null = create mode
  existingNames: string[]
  itemCount: number // items linked to this country (for delete guard)
  onSave: (payload: CountrySavePayload) => Promise<void> | void
  onRemove?: () => Promise<void> | void
  onClose: () => void
}

export function CountryDialog({
  initial,
  existingNames,
  itemCount,
  onSave,
  onRemove,
  onClose,
}: Props) {
  const isEdit = initial !== null
  const [name, setName] = useState(initial?.name ?? '')
  const [currency, setCurrency] = useState(
    initial?.currency_code ?? 'INR',
  )

  const canRemove = isEdit && itemCount === 0
  const trimmedName = name.trim()
  const duplicate =
    trimmedName.length > 0 &&
    existingNames
      .filter((n) => n.toLowerCase() !== (initial?.name ?? '').toLowerCase())
      .some((n) => n.toLowerCase() === trimmedName.toLowerCase())
  const canSave = trimmedName.length > 0 && currency.length > 0 && !duplicate

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const presetMatch = useMemo(
    () =>
      COUNTRY_PRESETS.find(
        (p) => p.name.toLowerCase() === trimmedName.toLowerCase(),
      ),
    [trimmedName],
  )

  const handleNameChange = (v: string) => {
    setName(v)
    // Auto-fill currency from preset when the user types/picks a known country
    // — but only on create, and only if they haven't picked a custom currency.
    if (!isEdit) {
      const match = COUNTRY_PRESETS.find(
        (p) => p.name.toLowerCase() === v.trim().toLowerCase(),
      )
      if (match) setCurrency(match.currency)
    }
  }

  const handleSave = () => {
    if (!canSave) return
    void onSave({ name: trimmedName, currency_code: currency.trim().toUpperCase() })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-cream shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-edge px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-ink">
              {isEdit ? 'Edit country' : 'New country'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Picks the default currency for items under it.
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

        <div className="space-y-5 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              list="country-presets"
              placeholder="e.g. India"
              className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              autoFocus
            />
            <datalist id="country-presets">
              {COUNTRY_PRESETS.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
            {duplicate && (
              <p className="mt-1 text-xs text-terracotta">
                You already have a country with this name.
              </p>
            )}
            {presetMatch && !isEdit && (
              <p className="mt-1 text-xs text-ink-faint">
                Suggested currency for {presetMatch.name}: {presetMatch.currency}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Currency (ISO code)
            </label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              list="currency-codes"
              maxLength={6}
              placeholder="INR"
              className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-base font-mono text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
            <datalist id="currency-codes">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-ink-faint">
              New payments under items in this country will default to this
              currency.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-edge px-6 py-4">
          <div>
            {isEdit && onRemove && (
              <button
                onClick={() => void onRemove()}
                disabled={!canRemove}
                title={
                  canRemove
                    ? 'Remove this country'
                    : `Can't remove — ${itemCount} item${itemCount === 1 ? '' : 's'} linked`
                }
                className={cn(
                  'text-xs font-medium underline-offset-4',
                  canRemove
                    ? 'text-terracotta hover:underline'
                    : 'cursor-not-allowed text-ink-faint',
                )}
              >
                Remove country
              </button>
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
              onClick={handleSave}
              disabled={!canSave}
              className={cn(
                'rounded-full px-5 py-2 text-sm font-medium transition',
                canSave
                  ? 'bg-ink text-cream hover:bg-ink-muted'
                  : 'cursor-not-allowed bg-edge text-ink-faint',
              )}
            >
              {isEdit ? 'Save' : 'Create country'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
