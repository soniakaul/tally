import type { Database } from '../lib/database.types'

export type Item = Database['public']['Tables']['items']['Row']
export type ItemInsert = Database['public']['Tables']['items']['Insert']
export type ItemUpdate = Database['public']['Tables']['items']['Update']

// Suggested item types — user can type any string.
export const ITEM_TYPE_SUGGESTIONS = ['Property', 'Company'] as const

export function newItemId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`i${i}`)) i++
  return `i${i}`
}

export function findItem(items: Item[], id: string | null): Item | undefined {
  if (!id) return undefined
  return items.find((i) => i.id === id)
}

export function itemsForCountry(items: Item[], countryId: string): Item[] {
  return items.filter((i) => i.country_id === countryId)
}

// Distinct types currently in use, plus suggestions — for the type field's
// autocomplete in the item editor.
export function distinctItemTypes(items: Item[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of ITEM_TYPE_SUGGESTIONS) {
    if (!seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  for (const item of items) {
    const t = item.type.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}
