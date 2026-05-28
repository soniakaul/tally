import { useMemo, useState } from 'react'
import {
  MAX_CATEGORIES,
  colorBgClass,
  newCategoryId,
  nextCategoryColor,
  type Category,
  type CategoryColor,
} from '../state/categories'
import { CategoryDialog, type CategorySavePayload } from '../components/CategoryDialog'
import { useCategories } from '../hooks/useCategories'
import { usePayments } from '../hooks/usePayments'
import { cn, formatCurrency } from '../lib/utils'

export function CategoriesPage() {
  const { categories, add, update, remove } = useCategories()
  const { payments } = usePayments()
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  // undefined = closed, null = create, Category = edit

  const statsByCategory = useMemo(() => {
    const map: Record<string, { count: number; totalInr: number }> = {}
    for (const p of payments) {
      const key = p.category_id ?? '__none__'
      if (!map[key]) map[key] = { count: 0, totalInr: 0 }
      map[key].count++
      map[key].totalInr += p.currency === 'USD' ? p.amount * 83 : p.amount
    }
    return map
  }, [payments])

  const atLimit = categories.length >= MAX_CATEGORIES

  const handleSave = async (payload: CategorySavePayload) => {
    if (editing) {
      await update({ id: editing.id, patch: payload })
    } else {
      await add({
        id: newCategoryId(categories.map((c) => c.id)),
        ...payload,
        sort_order: categories.length,
      })
    }
    setEditing(undefined)
  }

  const handleRemove = async () => {
    if (!editing) return
    await remove(editing.id)
    setEditing(undefined)
  }

  const openCreate = () => {
    if (atLimit) return
    setEditing(null)
  }

  const seedColor: CategoryColor = nextCategoryColor(
    categories.map((c) => c.color),
  )

  return (
    <div className="dotted-bg min-h-full px-4 pb-16 pt-8 md:px-10 md:pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 md:mb-10">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Organize payments
          </p>
          <h1 className="font-display text-3xl font-bold leading-[0.95] tracking-tightest md:text-5xl">
            Categories
          </h1>
          <p className="mt-3 text-sm text-ink-muted md:mt-4 md:text-base">
            {categories.length} of {MAX_CATEGORIES} used · group payments by
            country, type, or however you like.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={atLimit}
          className={cn(
            'group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition',
            atLimit
              ? 'cursor-not-allowed bg-edge text-ink-faint'
              : 'bg-ink text-cream hover:bg-ink-muted',
          )}
          title={atLimit ? `Limit is ${MAX_CATEGORIES} categories` : undefined}
        >
          + Add category
          <span className="transition group-hover:translate-x-0.5">→</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => {
          const stats = statsByCategory[cat.id] ?? { count: 0, totalInr: 0 }
          return (
            <button
              key={cat.id}
              onClick={() => setEditing(cat)}
              className="group flex flex-col items-start rounded-2xl border border-edge bg-card/60 p-5 text-left transition hover:border-ink-faint hover:bg-card"
            >
              <div className="mb-4 flex w-full items-start justify-between">
                <div
                  className={cn(
                    'h-8 w-8 rounded-lg',
                    colorBgClass[cat.color as CategoryColor],
                  )}
                />
                <span className="text-xs text-ink-faint opacity-0 transition group-hover:opacity-100">
                  Edit ›
                </span>
              </div>
              <h3 className="font-display text-xl font-bold tracking-tightest text-ink">
                {cat.name}
              </h3>
              {cat.description && (
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                  {cat.description}
                </p>
              )}
              <div className="mt-4 flex w-full items-center justify-between border-t border-edge/60 pt-3 text-xs">
                <span className="text-ink-muted">
                  {stats.count === 0
                    ? 'No payments yet'
                    : `${stats.count} payment${stats.count === 1 ? '' : 's'}`}
                </span>
                {stats.count > 0 && (
                  <span className="font-display font-semibold text-ink">
                    {formatCurrency(stats.totalInr, 'INR')}
                  </span>
                )}
              </div>
            </button>
          )
        })}

        {!atLimit && (
          <button
            onClick={openCreate}
            className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-edge bg-card/30 p-5 text-ink-faint transition hover:border-ink-faint hover:bg-card/60 hover:text-ink"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-sm font-medium">Add category</span>
            <span className="text-xs">
              {MAX_CATEGORIES - categories.length} slot
              {MAX_CATEGORIES - categories.length === 1 ? '' : 's'} left
            </span>
          </button>
        )}
      </div>

      {editing !== undefined && (
        <CategoryDialog
          initial={editing}
          defaultColor={editing === null ? seedColor : undefined}
          onSave={handleSave}
          onRemove={editing ? handleRemove : undefined}
          onClose={() => setEditing(undefined)}
          paymentCount={editing ? statsByCategory[editing.id]?.count ?? 0 : 0}
        />
      )}
    </div>
  )
}
