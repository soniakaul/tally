import { useMemo, useState } from 'react'
import { useCountries } from '../hooks/useCountries'
import { useItems } from '../hooks/useItems'
import { usePayments } from '../hooks/usePayments'
import type { Country } from '../state/country'
import type { Item } from '../state/item'
import { newCountryId } from '../state/country'
import { newItemId } from '../state/item'
import {
  CountryDialog,
  type CountrySavePayload,
} from '../components/CountryDialog'
import { ItemDialog, type ItemSavePayload } from '../components/ItemDialog'
import { cn } from '../lib/utils'

type Editing<T> = T | null | undefined // undefined = closed, null = create, T = edit

export function ItemsPage() {
  const {
    countries,
    add: addCountry,
    update: updateCountry,
    remove: removeCountry,
  } = useCountries()
  const {
    items,
    add: addItem,
    update: updateItem,
    remove: removeItem,
  } = useItems()
  const { payments } = usePayments()

  const [editingCountry, setEditingCountry] = useState<Editing<Country>>(undefined)
  const [editingItem, setEditingItem] = useState<Editing<Item>>(undefined)
  // When creating an item from inside a country card, remember which.
  const [createItemForCountry, setCreateItemForCountry] = useState<string | null>(
    null,
  )

  const itemCountByCountry = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of items) m[i.country_id] = (m[i.country_id] ?? 0) + 1
    return m
  }, [items])

  const paymentCountByItem = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of payments) {
      if (!p.item_id) continue
      m[p.item_id] = (m[p.item_id] ?? 0) + 1
    }
    return m
  }, [payments])

  const handleSaveCountry = async (payload: CountrySavePayload) => {
    if (editingCountry) {
      await updateCountry({ id: editingCountry.id, patch: payload })
    } else {
      await addCountry({
        id: newCountryId(countries.map((c) => c.id)),
        ...payload,
        sort_order: countries.length,
      })
    }
    setEditingCountry(undefined)
  }

  const handleRemoveCountry = async () => {
    if (!editingCountry) return
    await removeCountry(editingCountry.id)
    setEditingCountry(undefined)
  }

  const handleSaveItem = async (payload: ItemSavePayload) => {
    if (editingItem) {
      await updateItem({ id: editingItem.id, patch: payload })
    } else {
      await addItem({
        id: newItemId(items.map((i) => i.id)),
        ...payload,
        sort_order: items.filter((i) => i.country_id === payload.country_id)
          .length,
      })
    }
    setEditingItem(undefined)
    setCreateItemForCountry(null)
  }

  const handleRemoveItem = async () => {
    if (!editingItem) return
    await removeItem(editingItem.id)
    setEditingItem(undefined)
  }

  const openCreateItem = (countryId: string | null) => {
    setCreateItemForCountry(countryId)
    setEditingItem(null)
  }

  return (
    <div className="dotted-bg min-h-full px-4 pb-16 pt-8 md:px-10 md:pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 md:mb-10">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Organize payments
          </p>
          <h1 className="font-display text-3xl font-bold leading-[0.95] tracking-tightest md:text-5xl">
            Items
          </h1>
          <p className="mt-3 text-sm text-ink-muted md:mt-4 md:text-base">
            Group payments by country, then by item — properties, companies, or
            anything else.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingCountry(null)}
            className="rounded-full border border-edge bg-card/60 px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-card hover:text-ink"
          >
            + Country
          </button>
          <button
            onClick={() => openCreateItem(null)}
            disabled={countries.length === 0}
            className={cn(
              'group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition',
              countries.length === 0
                ? 'cursor-not-allowed bg-edge text-ink-faint'
                : 'bg-ink text-cream hover:bg-ink-muted',
            )}
            title={
              countries.length === 0 ? 'Add a country first' : undefined
            }
          >
            + Add item
            <span className="transition group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </div>

      {countries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-edge bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-ink-muted">
            No countries yet. Start by adding a country — its currency will
            auto-fill on new payments.
          </p>
          <button
            onClick={() => setEditingCountry(null)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-ink-muted"
          >
            + Add country
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {countries.map((country) => {
            const countryItems = items.filter(
              (i) => i.country_id === country.id,
            )
            return (
              <section
                key={country.id}
                className="rounded-2xl border border-edge bg-card/60 p-5"
              >
                <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-2xl font-bold tracking-tightest text-ink">
                      {country.name}
                    </h2>
                    <span className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs font-medium text-ink-muted">
                      {country.currency_code}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {itemCountByCountry[country.id] ?? 0} item
                      {(itemCountByCountry[country.id] ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openCreateItem(country.id)}
                      className="rounded-full border border-edge bg-cream px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-card hover:text-ink"
                    >
                      + Item
                    </button>
                    <button
                      onClick={() => setEditingCountry(country)}
                      className="rounded-full border border-edge bg-cream px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-card hover:text-ink"
                    >
                      Edit
                    </button>
                  </div>
                </header>

                {countryItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-edge bg-cream/40 px-4 py-6 text-center text-xs text-ink-faint">
                    No items yet — add a property or company in {country.name}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {countryItems.map((item) => {
                      const count = paymentCountByItem[item.id] ?? 0
                      return (
                        <button
                          key={item.id}
                          onClick={() => setEditingItem(item)}
                          className="flex flex-col items-start rounded-lg border border-edge bg-cream/60 px-4 py-3 text-left transition hover:border-ink-faint hover:bg-cream"
                        >
                          <div className="flex w-full items-center justify-between">
                            <h3 className="font-medium text-ink">
                              {item.name}
                            </h3>
                            <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                              {item.type}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-ink-muted">
                            {count === 0
                              ? 'No payments'
                              : `${count} payment${count === 1 ? '' : 's'}`}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {editingCountry !== undefined && (
        <CountryDialog
          initial={editingCountry}
          existingNames={countries.map((c) => c.name)}
          itemCount={
            editingCountry ? itemCountByCountry[editingCountry.id] ?? 0 : 0
          }
          onSave={handleSaveCountry}
          onRemove={editingCountry ? handleRemoveCountry : undefined}
          onClose={() => setEditingCountry(undefined)}
        />
      )}

      {editingItem !== undefined && (
        <ItemDialog
          initial={editingItem}
          countries={countries}
          allItems={items}
          defaultCountryId={createItemForCountry ?? undefined}
          paymentCount={
            editingItem ? paymentCountByItem[editingItem.id] ?? 0 : 0
          }
          onSave={handleSaveItem}
          onRemove={editingItem ? handleRemoveItem : undefined}
          onClose={() => {
            setEditingItem(undefined)
            setCreateItemForCountry(null)
          }}
        />
      )}
    </div>
  )
}
