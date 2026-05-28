// Live FX rates from Frankfurter (free, no API key, daily ECB rates).
// Internal representation: "1 unit of currency = X INR" (so INR -> 1, USD ~= 83).
//
// Cache strategy: every successful fetch is saved to localStorage. If the API
// is unreachable on a future load, we keep using the cached snapshot — stale
// but real rates always beat hardcoded constants.

export type FxSnapshot = {
  date: string // YYYY-MM-DD, as reported by the source
  source: string
  rates: Record<string, number>
}

// AED isn't in the ECB-tracked currency list, so Frankfurter never returns it.
// We supplement every successful fetch with this approximate rate so AED
// conversions still work. (Worth replacing if a daily rate matters for you.)
const ECB_SUPPLEMENT: Record<string, number> = {
  AED: 22.6,
}

// Minimal snapshot used on the very first app load if the user has no cache
// AND can't reach the API. After the first successful fetch, the cached
// snapshot replaces this forever (or until the user clears storage).
export const coldStartSnapshot: FxSnapshot = {
  date: '1970-01-01',
  source: 'No rates yet — refresh when online',
  rates: { INR: 1, ...ECB_SUPPLEMENT },
}

const STORAGE_KEY = 'tally:fx-rates'

export function getCachedRates(): FxSnapshot | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as FxSnapshot
  } catch {
    return null
  }
}

export function setCachedRates(snapshot: FxSnapshot): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

export function isStale(cached: FxSnapshot | null, today = new Date()): boolean {
  if (!cached) return true
  const todayStr = today.toISOString().slice(0, 10)
  return cached.date < todayStr
}

export async function fetchFxRates(): Promise<FxSnapshot> {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=INR')
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`)
  const data: { date: string; rates: Record<string, number> } = await res.json()

  // Frankfurter returns "X per 1 INR"; we want "INR per 1 X" so we invert.
  const rates: Record<string, number> = { INR: 1 }
  for (const [code, rate] of Object.entries(data.rates)) {
    if (rate > 0) rates[code] = 1 / rate
  }
  // Fill in currencies the ECB doesn't track.
  for (const [code, rate] of Object.entries(ECB_SUPPLEMENT)) {
    if (rates[code] == null) rates[code] = rate
  }
  return { date: data.date, source: 'Frankfurter (ECB)', rates }
}
