import type { Database } from '../lib/database.types'

export type ReminderRule = Database['public']['Tables']['reminder_rules']['Row']
export type ReminderRuleInsert =
  Database['public']['Tables']['reminder_rules']['Insert']
export type ReminderRuleUpdate =
  Database['public']['Tables']['reminder_rules']['Update']

export const SUPPORTED_CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'SEK', label: 'Swedish Krona (kr)' },
  { code: 'THB', label: 'Thai Baht (฿)' },
  { code: 'AED', label: 'UAE Dirham (د.إ)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
] as const

export const SUPPORTED_TIMEZONES = [
  { tz: 'Asia/Kolkata', label: 'India · IST' },
  { tz: 'America/New_York', label: 'US East · ET' },
  { tz: 'America/Los_Angeles', label: 'US West · PT' },
  { tz: 'America/Chicago', label: 'US Central · CT' },
  { tz: 'Europe/London', label: 'UK · GMT/BST' },
  { tz: 'Europe/Berlin', label: 'Central Europe · CET' },
  { tz: 'Asia/Dubai', label: 'UAE · GST' },
  { tz: 'Asia/Singapore', label: 'Singapore · SGT' },
  { tz: 'Asia/Hong_Kong', label: 'Hong Kong · HKT' },
  { tz: 'Asia/Tokyo', label: 'Japan · JST' },
  { tz: 'Australia/Sydney', label: 'Sydney · AET' },
] as const

export function newReminderId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`r${i}`)) i++
  return `r${i}`
}

export function formatReminderOffset(offset: number | null): string {
  if (offset === null) return 'Pick a day…'
  if (offset === 0) return 'Day of due date'
  const n = Math.abs(offset)
  const noun = n === 1 ? 'day' : 'days'
  return offset < 0 ? `${n} ${noun} before` : `${n} ${noun} after`
}
