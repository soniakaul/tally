import type { Database } from '../lib/database.types'
import { appColors, nextColor as nextAppColor, type AppColor } from './colors'

export type Household = Database['public']['Tables']['households']['Row']
export type HouseholdUpdate =
  Database['public']['Tables']['households']['Update']

export type Person = Database['public']['Tables']['people']['Row']
export type PersonInsert = Database['public']['Tables']['people']['Insert']
export type PersonUpdate = Database['public']['Tables']['people']['Update']

export type PersonColor = AppColor
export const personColors = appColors

export function initialOf(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
}

export function nextColor(used: (string | PersonColor)[]): PersonColor {
  return nextAppColor(used)
}

export function newPersonId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`p${i}`)) i++
  return `p${i}`
}
