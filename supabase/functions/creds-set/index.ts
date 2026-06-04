// Supabase Edge Function: creds-set
//
// Encrypts and stores the four credential fields for a single payment, or
// for an entire recurring series.
//
// Request body (JSON):
//   {
//     "payment_id": "<uuid>",
//     "scope": "one" | "future" | "all"  (optional, defaults to "one")
//     "portal_username": "..." | null | undefined,
//     "portal_password": "..." | null | undefined,
//     "bank_username":   "..." | null | undefined,
//     "bank_password":   "..." | null | undefined
//   }
//
// Semantics per field:
//   - string  → encrypt and write
//   - null    → clear the column (set to NULL)
//   - missing → leave the column alone
//
// Series identity = (name, item_id, recurrence). Each field is encrypted
// ONCE with a fresh IV, then the same ciphertext is written to every row
// in the chosen scope. That means viewing any sibling's credentials yields
// the same plaintext — exactly what mom expects.
//
// Auth + rate limit identical in shape to creds-get; the write limit is
// WRITE_LIMIT_PER_HOUR. A scoped write counts as ONE write regardless of
// how many rows it touched, so propagating to 12 monthly instances doesn't
// drain the budget.
//
// Encryption: AES-256-GCM with a random 12-byte IV per field. Stored as
// IV || ciphertext+tag in a BYTEA column.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WRITE_LIMIT_PER_HOUR = 60
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
}

// Format: 12-byte IV prepended to AES-GCM ciphertext (which includes the tag).
async function encrypt(plaintext: string, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  )
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0)
  out.set(ct, iv.length)
  return out
}

// Postgres BYTEA insert via PostgREST wants `\x<hex>`.
function toHexLiteral(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return '\\x' + hex
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'missing bearer token' }, 401)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'bad request' }, 400)
  }
  const paymentId: string | undefined = body?.payment_id
  if (!paymentId) return jsonResponse({ error: 'payment_id required' }, 400)

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

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'unauthorized' }, 401)

  // Rate limit BEFORE doing crypto + writes.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: writeCount } = await serviceClient
    .from('creds_access_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', 'write')
    .eq('succeeded', true)
    .gte('created_at', oneHourAgo)
  if ((writeCount ?? 0) >= WRITE_LIMIT_PER_HOUR) {
    await serviceClient.from('creds_access_log').insert({
      user_id: user.id,
      payment_id: paymentId,
      action: 'write',
      succeeded: false,
    })
    return jsonResponse(
      {
        error: `Rate limit: max ${WRITE_LIMIT_PER_HOUR} credential writes per hour. Try again later.`,
      },
      429,
    )
  }

  // Ownership: RLS on payments scopes the user-client UPDATE to their
  // household. If the user doesn't own the payment, the update affects 0 rows.
  let key: CryptoKey
  try {
    key = await importKey()
  } catch (err) {
    console.error('key import failed', err)
    return jsonResponse({ error: 'server misconfigured' }, 500)
  }

  // Build the patch by walking the known fields only — silently ignore any
  // extras the client sent so we never accidentally write user-supplied
  // columns.
  const patch: Record<string, string | null> = {}
  for (const f of FIELDS) {
    if (!(f in body)) continue
    const v: unknown = body[f]
    if (v === null || v === '') {
      patch[`${f}_ct`] = null
      continue
    }
    if (typeof v !== 'string') {
      return jsonResponse({ error: `${f} must be a string or null` }, 400)
    }
    try {
      const ct = await encrypt(v, key)
      patch[`${f}_ct`] = toHexLiteral(ct)
    } catch (err) {
      console.error('encrypt failed', err)
      return jsonResponse({ error: 'encryption failed' }, 500)
    }
  }

  if (Object.keys(patch).length === 0) {
    return jsonResponse({ ok: true, updated: 0 })
  }

  // Scope handling. Default 'one' for backwards-compat with existing callers.
  const rawScope = (body?.scope ?? 'one') as string
  if (!['one', 'future', 'all'].includes(rawScope)) {
    return jsonResponse({ error: "scope must be 'one', 'future', or 'all'" }, 400)
  }
  const scope = rawScope as 'one' | 'future' | 'all'

  // For series scopes we need to know the source row's (name, item_id,
  // recurrence, due_date) so we can match siblings. RLS ensures we only
  // see rows the user owns.
  let updateQ = userClient
    .from('payments')
    .update(patch)
    .is('deleted_at', null)

  if (scope === 'one') {
    updateQ = updateQ.eq('id', paymentId)
  } else {
    const { data: src, error: srcErr } = await userClient
      .from('payments')
      .select('name, item_id, recurrence, due_date')
      .eq('id', paymentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (srcErr || !src) {
      return jsonResponse({ error: 'not found' }, 404)
    }
    updateQ = updateQ
      .eq('name', src.name)
      .eq('recurrence', src.recurrence)
    updateQ =
      src.item_id === null
        ? updateQ.is('item_id', null)
        : updateQ.eq('item_id', src.item_id)
    if (scope === 'future') {
      updateQ = updateQ.gte('due_date', src.due_date)
    }
  }

  const { data: updated, error: updErr } = await updateQ.select('id')
  if (updErr) {
    await serviceClient.from('creds_access_log').insert({
      user_id: user.id,
      payment_id: paymentId,
      action: 'write',
      succeeded: false,
    })
    return jsonResponse({ error: updErr.message }, 500)
  }
  if (!updated || updated.length === 0) {
    // Either not owned by the user or already in trash.
    return jsonResponse({ error: 'not found' }, 404)
  }

  await serviceClient.from('creds_access_log').insert({
    user_id: user.id,
    payment_id: paymentId,
    action: 'write',
    succeeded: true,
  })

  return jsonResponse({ ok: true, updated: updated.length })
})
