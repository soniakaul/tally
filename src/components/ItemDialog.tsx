import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import type { Country } from '../state/country'
import type { Item } from '../state/item'
import { ITEM_TYPE_SUGGESTIONS, distinctItemTypes } from '../state/item'

export type ItemSavePayload = {
  name: string
  type: string
  country_id: string
}

type Props = {
  initial: Item | null // null = create mode
  countries: Country[]
  allItems: Item[] // used for type autocomplete suggestions
  defaultCountryId?: string
  paymentCount: number // payments linked to this item (for delete guard)
  onSave: (payload: ItemSavePayload) => Promise<void> | void
  onRemove?: () => Promise<void> | void
  onClose: () => void
}

export function ItemDialog({
  initial,
  countries,
  allItems,
  defaultCountryId,
  paymentCount,
  onSave,
  onRemove,
  onClose,
}: Props) {
  const isEdit = initial !== null
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? ITEM_TYPE_SUGGESTIONS[0])
  const [countryId, setCountryId] = useState(
    initial?.country_id ?? defaultCountryId ?? countries[0]?.id ?? '',
  )

  const trimmedName = name.trim()
  const trimmedType = type.trim()
  const canSave =
    trimmedName.length > 0 && trimmedType.length > 0 && countryId.length > 0
  const canRemove = isEdit && paymentCount === 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const typeOptions = distinctItemTypes(allItems)

  const handleSave = () => {
    if (!canSave) return
    void onSave({ name: trimmedName, type: trimmedType, country_id: countryId })
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
              {isEdit ? 'Edit item' : 'New item'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              A property, company, or anything else you track payments for.
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
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mumbai flat, Tally LLC"
              className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Type
            </label>
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              list="item-types"
              placeholder="Property"
              className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
            <datalist id="item-types">
              {typeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-ink-faint">
              Property, Company, or any label you want. Past values autocomplete.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Country
            </label>
            <select
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-lg border border-edge bg-card/60 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
            >
              {countries.length === 0 && (
                <option value="" disabled>
                  Add a country first
                </option>
              )}
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.currency_code})
                </option>
              ))}
            </select>
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
                    ? 'Remove this item'
                    : `Can't remove — ${paymentCount} payment${paymentCount === 1 ? '' : 's'} linked`
                }
                className={cn(
                  'text-xs font-medium underline-offset-4',
                  canRemove
                    ? 'text-terracotta hover:underline'
                    : 'cursor-not-allowed text-ink-faint',
                )}
              >
                Remove item
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
              {isEdit ? 'Save' : 'Create item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
