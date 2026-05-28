import { cn } from '../lib/utils'
import { colorPillClass, type Category, type CategoryColor } from '../state/categories'

export function CategoryPill({ category }: { category: Category | undefined }) {
  if (!category) {
    return (
      <span className="inline-flex items-center rounded-full bg-edge px-2.5 py-1 text-xs font-medium text-ink-faint">
        Uncategorized
      </span>
    )
  }
  const colorClass =
    colorPillClass[category.color as CategoryColor] ?? colorPillClass.sage
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        colorClass,
      )}
    >
      {category.name}
    </span>
  )
}
