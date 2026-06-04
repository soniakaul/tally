// Supabase Edge Function: creds-get
//
// Decrypts and returns the four credential fields for a single payment.
// Auth: requires the user's JWT; ownership of the payment is enforced by
// RLS (the user-scoped client can only see payments in their household).
//
// Rate limit: max READ_LIMIT_PER_HOUR successful reads per user per rolling
// hour. Excess returns 429. Every attempt is logged to creds_access_log.
//
// Returns JSON: { portal_username, portal_password, bank_username, bank_password }
// — each value is a string or null.
//
// Required Supabase secrets:
//   TALLY_CREDS_KEY  (base64-encoded 32-byte AES-256 key — see README)
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const READ_LIMIT_PER_HOUR = 30
const FIELDS = [
  'portal_username',
  'portal_password',
  'bank_username',
  'bank_password',
] as const

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get('TALLY_CREDS_KEY')
  if (!b64) throw new Error('TALLY_CREDS_KEY secret not configured')
  const raw = fromBase64(b64)
  if (raw.length !== 32) {
    throw new Error(`TALLY_CREDS_KEY must be 32 bytes (got ${raw.length})`)
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
}

// Inverse of encrypt() in creds-set: blob = [12-byte IV || ciphertext+tag].
async function decrypt(blob: Uint8Array, key: CryptoKey): Promise<string> {
  if (blob.length < 13) throw new Error('ciphertext too short')
  const iv = blob.slice(0, 12)
  const ct = blob.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'missing bearer token' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const userClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  let paymentId: string
  try {
    if (req.method === 'GET') {
      paymentId = new URL(req.url).searchParams.get('payment_id') ?? ''
    } else {
      const body = await req.json()
      paymentId = body?.payment_id ?? ''
    }
  } catch {
    return jsonResponse({ error: 'bad request' }, 400)
  }
  if (!paymentId) return jsonResponse({ error: 'payment_id required' }, 400)

  // Authenticate the caller. Without a valid user we don't even peek at the DB.
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'unauthorized' }, 401)

  // Rate limit BEFORE doing the expensive crypto work. Count successful reads
  // in the last hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: readCount } = await serviceClient
    .from('creds_access_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', 'read')
    .eq('succeeded', true)
    .gte('created_at', oneHourAgo)
  if ((readCount ?? 0) >= READ_LIMIT_PER_HOUR) {
    // Log the throttled attempt for audit visibility.
    await serviceClient.from('creds_access_log').insert({
      user_id: user.id,
      payment_id: paymentId,
      action: 'read',
      succeeded: false,
    })
    return jsonResponse(
      {
        error: `Rate limit: max ${READ_LIMIT_PER_HOUR} credential reads per hour. Try again later.`,
      },
      429,
    )
  }

  // Ownership: RLS on payments scopes the user-client read to their household.
  // If the user doesn't own the payment, the select returns no row.
  const { data: payment, error: paymentErr } = await userClient
    .from('payments')
    .select(
      'id, portal_username_ct, portal_password_ct, bank_username_ct, bank_password_ct',
    )
    .eq('id', paymentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (paymentErr) {
    return jsonResponse({ error: paymentErr.message }, 500)
  }
  if (!payment) return jsonResponse({ error: 'not found' }, 404)

  // Decrypt only the fields that are populated. Empty fields → null.
  let key: CryptoKey
  try {
    key = await importKey()
  } catch (err) {
    console.error('key import failed', err)
    return jsonResponse({ error: 'server misconfigured' }, 500)
  }

  const out: Record<string, string | null> = {}
  try {
    for (const f of FIELDS) {
      const ct: unknown = (payment as any)[`${f}_ct`]
      if (!ct) {
        out[f] = null
        continue
      }
      // Supabase returns BYTEA as `\x...` hex string or as Uint8Array depending
      // on client version. Normalize both.
      let bytes: Uint8Array
      if (ct instanceof Uint8Array) {
        bytes = ct
      } else if (typeof ct === 'string') {
        const hex = ct.startsWith('\\x') ? ct.slice(2) : ct
        bytes = new Uint8Array(
          hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
        )
      } else {
        throw new Error('unexpected ciphertext shape')
      }
      out[f] = await decrypt(bytes, key)
    }
  } catch (err) {
    console.error('decrypt failed', err)
    await serviceClient.from('creds_access_log').insert({
      user_id: user.id,
      payment_id: paymentId,
      action: 'read',
      succeeded: false,
    })
    return jsonResponse({ error: 'decryption failed' }, 500)
  }

  await serviceClient.from('creds_access_log').insert({
    user_id: user.id,
    payment_id: paymentId,
    action: 'read',
    succeeded: true,
  })

  return jsonResponse(out)
})
