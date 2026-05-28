import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'
import {
  categoryColors,
  colorBgClass,
  type Category,
  type CategoryColor,
} from '../state/categories'

export type CategorySavePayload = {
  name: string
  description: string
  color: CategoryColor
}

type Props = {
  initial: Category | null // null = create mode
  defaultColor?: CategoryColor
  onSave: (payload: CategorySavePayload) => Promise<void> | void
  onRemove?: () => Promise<void> | void
  onClose: () => void
  paymentCount: number
}

export function CategoryDialog({
  initial,
  defaultColor,
  onSave,
  onRemove,
  onClose,
  paymentCount,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState<CategoryColor>(
    (initial?.color as CategoryColor) ?? defaultColor ?? 'sage',
  )
  const isEdit = initial !== null
  const canRemove = isEdit && paymentCount === 0
  const canSave = name.trim().length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = () => {
    if (!canSave) return
    void onSave({
      name: name.trim(),
      description: description.trim(),
      color,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-cream shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-edge px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tightest text-ink">
              {isEdit ? 'Edit category' : 'New category'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {isEdit
                ? 'Update the name, description, or color.'
                : 'Categorize payments by type, country, or however you like.'}
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
              placeholder="e.g. India real estate"
              className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Description{' '}
              <span className="font-normal normal-case text-ink-faint">
                — optional
              </span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this category covers"
              className="w-full rounded-lg border border-edge bg-card/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {categoryColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={cn(
                    'h-8 w-8 rounded-full transition',
                    colorBgClass[c],
                    color === c
                      ? 'ring-2 ring-ink ring-offset-2 ring-offset-cream'
                      : 'hover:scale-110',
                  )}
                />
              ))}
            </div>
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
                    ? 'Remove this category'
                    : `Can't remove — ${paymentCount} payment${paymentCount === 1 ? '' : 's'} use this category`
                }
                className={cn(
                  'text-xs font-medium underline-offset-4',
                  canRemove
                    ? 'text-terracotta hover:underline'
                    : 'cursor-not-allowed text-ink-faint',
                )}
              >
                Remove category
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
              {isEdit ? 'Save' : 'Create category'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
