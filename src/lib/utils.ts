export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-IE',
}

export function formatCurrency(amount: number, currency: string) {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

export function formatToday(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDay = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })
  const year = date.getFullYear()
  return `${weekday} · ${monthDay}, ${year}`
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function relativeDays(iso: string, today = new Date()) {
  const due = new Date(iso)
  const diffMs = due.setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)
  return Math.round(diffMs / MS_PER_DAY)
}

export function relativeDueLabel(iso: string, today = new Date()) {
  const days = relativeDays(iso, today)
  if (days < 0) return `overdue ${Math.abs(days)}d`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
}

export type Recurrence = 'one-off' | 'monthly' | 'quarterly' | 'yearly'

export function bumpDueDate(iso: string, recurrence: Recurrence): string {
  const d = new Date(iso)
  if (recurrence === 'monthly') {
    d.setMonth(d.getMonth() + 1)
  } else if (recurrence === 'quarterly') {
    d.setMonth(d.getMonth() + 3)
  } else if (recurrence === 'yearly') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    return iso
  }
  return d.toISOString().slice(0, 10)
}

export function computeStatus(
  dueDate: string,
  today = new Date(),
): 'upcoming' | 'overdue' {
  return relativeDays(dueDate, today) < 0 ? 'overdue' : 'upcoming'
}

export function newPaymentId(existing: string[]): string {
  let i = existing.length + 1
  while (existing.includes(`p${i}`)) i++
  return `p${i}`
}

// Convert payment.amount (in fromCurrency) to homeCurrency.
// `rates` are stored as "1 unit of currency = X INR" (INR = 1, USD ~= 83).
// Pass a live snapshot from lib/fx.ts, or the fallback if offline.
export function convertToHome(
  amount: number,
  fromCurrency: string,
  homeCurrency: string,
  rates: Record<string, number>,
): number {
  const inrAmount = amount * (rates[fromCurrency] ?? 1)
  return inrAmount / (rates[homeCurrency] ?? 1)
}
