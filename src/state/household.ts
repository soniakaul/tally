import type { Database } from '../lib/database.types'
import { categoryColors, type CategoryColor } from './categories'

export type Household = Database['public']['Tables']['households']['Row']
export type HouseholdUpdate =
  Database['public']['Tables']['households']['Update']

export type Person = Database['public']['Tables']['people']['Row']
export type PersonInsert = Database['public']['Tables']['people']['Insert']
export type PersonUpdate = Database['public']['Tables']['people']['Update']

// Profile colors share the full category palette.
export type PersonColor = CategoryColor
export const personColors = categoryColors

export function initialOf(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
}

export function nextColor(used: (string | PersonColor)[]): PersonColor {
  const unused = personColors.find((c) => !used.includes(c))
  return unused ?? personColors[used.length % personColors.length]
}

export function newPersonId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`p${i}`)) i++
  return `p${i}`
}
