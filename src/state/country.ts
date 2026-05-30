import type { Database } from '../lib/database.types'

export type Country = Database['public']['Tables']['countries']['Row']
export type CountryInsert = Database['public']['Tables']['countries']['Insert']
export type CountryUpdate = Database['public']['Tables']['countries']['Update']

// Common currency suggestions (the dropdown is open-ended — user can type any
// ISO code, but these get first-class options).
export const COMMON_CURRENCIES = [
  'INR',
  'USD',
  'GBP',
  'EUR',
  'AED',
  'SGD',
  'SEK',
  'THB',
  'AUD',
  'CAD',
  'CHF',
  'JPY',
] as const

// Suggested countries with their default currency. Used to power the
// autocomplete when adding a country. Not a hard list — user can type anything.
export const COUNTRY_PRESETS: Array<{ name: string; currency: string }> = [
  { name: 'India', currency: 'INR' },
  { name: 'United States', currency: 'USD' },
  { name: 'United Kingdom', currency: 'GBP' },
  { name: 'United Arab Emirates', currency: 'AED' },
  { name: 'Singapore', currency: 'SGD' },
  { name: 'Sweden', currency: 'SEK' },
  { name: 'Thailand', currency: 'THB' },
  { name: 'Australia', currency: 'AUD' },
  { name: 'Canada', currency: 'CAD' },
  { name: 'Germany', currency: 'EUR' },
  { name: 'France', currency: 'EUR' },
  { name: 'Japan', currency: 'JPY' },
  { name: 'Switzerland', currency: 'CHF' },
]

export function newCountryId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`c${i}`)) i++
  return `c${i}`
}

export function findCountry(
  countries: Country[],
  id: string | null,
): Country | undefined {
  if (!id) return undefined
  return countries.find((c) => c.id === id)
}
