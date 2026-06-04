import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Shape returned by the creds-get edge function. Each field is the plaintext
// credential string OR null if not stored.
export type PaymentCredentials = {
  portal_username: string | null
  portal_password: string | null
  bank_username: string | null
  bank_password: string | null
}

// Patch shape for creds-set. Each field is:
//   - string  → encrypt and write
//   - null    → clear
//   - missing → leave alone
export type PaymentCredentialsPatch = Partial<{
  portal_username: string | null
  portal_password: string | null
  bank_username: string | null
  bank_password: string | null
}>

export type CredentialScope = 'one' | 'future' | 'all'

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  return `Bearer ${token}`
}

// Read decrypted credentials for a single payment. Returns null fields for
// columns that aren't populated. Throws on auth failure, 404, or rate-limit.
async function getCreds(paymentId: string): Promise<PaymentCredentials> {
  const res = await fetch(
    `${FUNCTIONS_BASE}/creds-get?payment_id=${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: await authHeader() } },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error ?? `Read failed (${res.status})`)
  }
  return body as PaymentCredentials
}

async function setCreds(
  paymentId: string,
  patch: PaymentCredentialsPatch,
  scope: CredentialScope = 'one',
): Promise<void> {
  const res = await fetch(`${FUNCTIONS_BASE}/creds-set`, {
    method: 'POST',
    headers: {
      Authorization: await authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payment_id: paymentId, scope, ...patch }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error ?? `Write failed (${res.status})`)
  }
}

// React-friendly wrapper. Both operations are mutations because they have
// real side effects (DB + audit log writes, rate-limit counters).
export function usePaymentCredentials() {
  const getMut = useMutation({ mutationFn: getCreds })
  const setMut = useMutation({
    mutationFn: async (args: {
      paymentId: string
      patch: PaymentCredentialsPatch
      scope?: CredentialScope
    }) => setCreds(args.paymentId, args.patch, args.scope ?? 'one'),
  })
  return {
    get: getMut.mutateAsync,
    set: setMut.mutateAsync,
    getError: getMut.error,
    setError: setMut.error,
    getting: getMut.isPending,
    setting: setMut.isPending,
  }
}
