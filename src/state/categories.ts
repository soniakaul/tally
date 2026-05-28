import type { Database } from '../lib/database.types'

export type Category = Database['public']['Tables']['categories']['Row']
export type CategoryInsert = Database['public']['Tables']['categories']['Insert']
export type CategoryUpdate = Database['public']['Tables']['categories']['Update']

export type CategoryColor =
  | 'sage'
  | 'amber'
  | 'tan'
  | 'olive'
  | 'moss'
  | 'terracotta'
  | 'walnut'
  | 'clay'
  | 'forest'
  | 'slate-warm'
  | 'rose'
  | 'coral'
  | 'rust'
  | 'plum'
  | 'mustard'

export const categoryColors: CategoryColor[] = [
  'sage',
  'moss',
  'forest',
  'olive',
  'mustard',
  'amber',
  'tan',
  'walnut',
  'clay',
  'coral',
  'rust',
  'terracotta',
  'rose',
  'plum',
  'slate-warm',
]

export const colorBgClass: Record<CategoryColor, string> = {
  sage: 'bg-sage',
  amber: 'bg-amber',
  tan: 'bg-tan',
  olive: 'bg-olive',
  moss: 'bg-moss',
  terracotta: 'bg-terracotta',
  walnut: 'bg-walnut',
  clay: 'bg-clay',
  forest: 'bg-forest',
  'slate-warm': 'bg-slate-warm',
  rose: 'bg-rose',
  coral: 'bg-coral',
  rust: 'bg-rust',
  plum: 'bg-plum',
  mustard: 'bg-mustard',
}

export const colorPillClass: Record<CategoryColor, string> = {
  sage: 'bg-sage-soft text-sage',
  amber: 'bg-amber-soft text-ochre',
  tan: 'bg-tan-soft text-tan',
  olive: 'bg-olive-soft text-olive',
  moss: 'bg-moss-soft text-moss',
  terracotta: 'bg-terracotta-soft text-terracotta',
  walnut: 'bg-walnut-soft text-walnut',
  clay: 'bg-clay-soft text-clay',
  forest: 'bg-forest-soft text-forest',
  'slate-warm': 'bg-slate-warm-soft text-slate-warm',
  rose: 'bg-rose-soft text-rose',
  coral: 'bg-coral-soft text-coral',
  rust: 'bg-rust-soft text-rust',
  plum: 'bg-plum-soft text-plum',
  mustard: 'bg-mustard-soft text-mustard',
}

export const MAX_CATEGORIES = 10

export function nextCategoryColor(
  used: (string | CategoryColor)[],
): CategoryColor {
  const unused = categoryColors.find((c) => !used.includes(c))
  return unused ?? categoryColors[used.length % categoryColors.length]
}

export function newCategoryId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`cat-${i}`)) i++
  return `cat-${i}`
}

export function findCategory(
  categories: Category[],
  id: string | null,
): Category | undefined {
  if (!id) return undefined
  return categories.find((c) => c.id === id)
}
