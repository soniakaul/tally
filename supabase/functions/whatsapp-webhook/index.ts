// Supabase Edge Function: whatsapp-webhook
//
// Receives inbound WhatsApp replies from Twilio and resolves them to a
// specific payment using a 3-step stack:
//
//   1. Quote reply — Twilio sends `OriginalRepliedMessageSid` when the user
//      long-presses our outbound reminder and uses WhatsApp's native quote
//      gesture. We look up that SID in the reminders table → payment_id.
//      Strongest signal, no guessing.
//
//   2. Digit reply — if the body is just a number (1, 2, ...) AND we recently
//      asked the user to pick from a menu (whatsapp_pending_choice), resolve
//      to the payment at that index.
//
//   3. PAID / SNOOZE — look for unresolved candidates: payments still not
//      paid for this person AND reminded in the last 14 days.
//        - 0 candidates: friendly "nothing pending" reply
//        - 1 candidate: resolve directly
//        - N candidates: store the menu in whatsapp_pending_choice and ask
//          "Which one?" with a numbered list
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided)

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Recurrence = 'one-off' | 'monthly' | 'quarterly' | 'yearly'

type Person = { id: string; household_id: string; name: string; whatsapp: string }
type PaymentRow = {
  id: string
  household_id: string
  item_id: string | null
  person: string
  name: string
  amount: number
  currency: string
  direction: string
  due_date: string
  recurrence: Recurrence
  end_date: string | null
  status: 'upcoming' | 'overdue' | 'paid'
  paid_at: string | null
}
type Action =
  | { kind: 'PAID' }
  | { kind: 'SNOOZE'; days: number }

const CANDIDATE_WINDOW_DAYS = 14

// ---------- helpers ----------

function bumpDueDate(iso: string, recurrence: Recurrence): string {
  const d = new Date(iso)
  if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (recurrence === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else return iso
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function computeStatus(
  dueDate: string,
  today = new Date(),
): 'upcoming' | 'overdue' {
  const due = new Date(dueDate)
  const diff = due.setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)
  return diff < 0 ? 'overdue' : 'upcoming'
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  const last = day % 10
  if (last === 1) return `${day}st`
  if (last === 2) return `${day}nd`
  if (last === 3) return `${day}rd`
  return `${day}th`
}

function formatLongDate(iso: string): string {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return `${month} ${ordinal(d.getDate())}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return `${month} ${d.getDate()}`
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

async function sendTwilioReply(toNumber: string, text: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM')
  if (!accountSid || !authToken || !fromNumber) {
    console.error('Cannot send reply — Twilio credentials missing')
    return
  }
  const form = new URLSearchParams()
  form.append('From', fromNumber)
  form.append('To', toNumber)
  form.append('Body', text)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  )
  if (!res.ok) console.error('Twilio reply send failed', await res.text())
}

function twimlOk(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Parse the inbound text and ButtonPayload into our internal action shape.
// Returns null if the text doesn't look like a command.
function parseAction(text: string, buttonPayload: string): Action | null {
  // Button taps win (Twilio Content templates send the button ID)
  if (buttonPayload) {
    const p = buttonPayload.trim().toUpperCase()
    if (p === 'PAID') return { kind: 'PAID' }
    if (p.startsWith('SNOOZE_')) {
      const n = parseInt(p.slice('SNOOZE_'.length), 10)
      if (!Number.isNaN(n) && n > 0 && n <= 60) return { kind: 'SNOOZE', days: n }
    }
  }
  const upper = text.trim().toUpperCase()
  if (upper === 'PAID' || upper === 'DONE' || upper === '✓') return { kind: 'PAID' }
  if (upper.startsWith('SNOOZE')) {
    const m = upper.match(/SNOOZE\s*(\d+)?/)
    const days = parseInt(m?.[1] ?? '2', 10)
    if (Number.isNaN(days) || days <= 0 || days > 60) return null
    return { kind: 'SNOOZE', days }
  }
  return null
}

// "12" → 12, "abc" → null, "  3 " → 3, "0" → null. Only positive small ints.
function parseDigit(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,2}$/.test(trimmed)) return null
  const n = parseInt(trimmed, 10)
  return n >= 1 && n <= 99 ? n : null
}

async function matchPerson(
  supabase: SupabaseClient,
  fromRaw: string,
): Promise<Person | null> {
  // Digits-only matching so "+91 98450 12345" and "whatsapp:+919845012345"
  // both match the same record. Person rows are scoped per household; pull
  // them all (service role bypasses RLS) and filter in JS.
  const fromDigits = fromRaw.replace(/[^\d]/g, '')
  const { data } = await supabase
    .from('people')
    .select('id, household_id, name, whatsapp')
    .is('deleted_at', null)
  if (!data) return null
  return (
    data.find((p) => p.whatsapp.replace(/[^\d]/g, '') === fromDigits) ?? null
  )
}

async function loadPayment(
  supabase: SupabaseClient,
  paymentId: string,
  householdId: string,
): Promise<PaymentRow | null> {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()
  return data
}

// Find unresolved candidate payments for this person — anything still not
// paid that we've reminded about in the last CANDIDATE_WINDOW_DAYS days.
// Returned in due_date order (oldest first).
async function findCandidates(
  supabase: SupabaseClient,
  person: Person,
): Promise<PaymentRow[]> {
  const cutoff = new Date(
    Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: recentReminders } = await supabase
    .from('reminders')
    .select('payment_id')
    .eq('household_id', person.household_id)
    .eq('person_id', person.id)
    .in('kind', ['reminder', 'test'])
    .gte('sent_at', cutoff)
    .not('payment_id', 'is', null)

  if (!recentReminders || recentReminders.length === 0) return []

  const paymentIds = Array.from(
    new Set(recentReminders.map((r: any) => r.payment_id as string)),
  )

  const { data: rows } = await supabase
    .from('payments')
    .select('*')
    .eq('household_id', person.household_id)
    .in('id', paymentIds)
    .neq('status', 'paid')
    .is('deleted_at', null)
    .order('due_date', { ascending: true })

  return (rows ?? []) as PaymentRow[]
}

async function clearPendingChoice(
  supabase: SupabaseClient,
  phone: string,
): Promise<void> {
  await supabase.from('whatsapp_pending_choice').delete().eq('phone', phone)
}

async function getPendingChoice(
  supabase: SupabaseClient,
  phone: string,
): Promise<{
  payment_ids: string[]
  household_id: string
  person_id: string
  action: 'PAID' | 'SNOOZE'
  snooze_days: number | null
  expires_at: string
} | null> {
  const { data } = await supabase
    .from('whatsapp_pending_choice')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  if (!data) return null
  // Expired? Clean up and return nothing.
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await clearPendingChoice(supabase, phone)
    return null
  }
  return data
}

async function insertPendingChoice(
  supabase: SupabaseClient,
  phone: string,
  person: Person,
  candidates: PaymentRow[],
  action: Action,
): Promise<void> {
  const ttlMin = 15
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000).toISOString()
  await supabase.from('whatsapp_pending_choice').upsert(
    {
      phone,
      household_id: person.household_id,
      person_id: person.id,
      payment_ids: candidates.map((c) => c.id),
      action: action.kind,
      snooze_days: action.kind === 'SNOOZE' ? action.days : null,
      expires_at: expiresAt,
    },
    { onConflict: 'phone' },
  )
}

function formatMenu(candidates: PaymentRow[], action: Action): string {
  const header =
    action.kind === 'PAID'
      ? 'Which payment did you pay?'
      : `Which payment to push by ${action.days} day${action.days === 1 ? '' : 's'}?`
  const lines = candidates.map((p, i) => {
    const amount = formatAmount(Number(p.amount), p.currency)
    const date = formatShortDate(p.due_date)
    return `${i + 1}. ${p.name} — ${amount} (${date})`
  })
  return `${header}\n${lines.join('\n')}\n\nReply with 1${candidates.length > 1 ? `–${candidates.length}` : ''}.`
}

// Apply PAID / SNOOZE to a resolved payment + send confirmation.
async function executeAction(
  supabase: SupabaseClient,
  toPhone: string,
  person: Person,
  payment: PaymentRow,
  action: Action,
): Promise<void> {
  if (payment.status === 'paid' && action.kind === 'PAID') {
    await sendTwilioReply(
      toPhone,
      `"${payment.name}" was already marked paid on ${formatLongDate(payment.paid_at?.slice(0, 10) ?? payment.due_date)}. ✓`,
    )
    return
  }

  let confirmation: string

  if (action.kind === 'PAID') {
    const now = new Date()
    const { error: updErr } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        paid_at: now.toISOString(),
        paid_via: 'whatsapp',
      })
      .eq('id', payment.id)
    if (updErr) {
      console.error('Failed to mark paid', updErr)
      return
    }

    // Create next recurring instance — skip if one already exists (live)
    // in the same series at the next due date.
    if (payment.recurrence !== 'one-off') {
      const nextDate = bumpDueDate(payment.due_date, payment.recurrence)
      const pastEnd = payment.end_date && nextDate > payment.end_date
      if (!pastEnd) {
        let dedupQ = supabase
          .from('payments')
          .select('id')
          .eq('household_id', payment.household_id)
          .eq('name', payment.name)
          .eq('recurrence', payment.recurrence)
          .eq('due_date', nextDate)
          .is('deleted_at', null)
        dedupQ =
          payment.item_id === null
            ? dedupQ.is('item_id', null)
            : dedupQ.eq('item_id', payment.item_id)
        const { data: existing } = await dedupQ.limit(1)
        if (!existing || existing.length === 0) {
          // Server-side clone via RPC so details + credential ciphertext
          // carry forward to the new row. See migration 009.
          const { error: cloneErr } = await supabase.rpc(
            'clone_payment_next_recurrence',
            {
              source_payment_id: payment.id,
              next_due_date: nextDate,
              next_status: computeStatus(nextDate, now),
            },
          )
          if (cloneErr) console.error('Next instance clone failed', cloneErr)
        }
      }
    }
    confirmation = `Got it — marked "${payment.name}" as paid. ✓`
  } else {
    const newDate = addDays(payment.due_date, action.days)
    const today = new Date()
    const { error: updErr } = await supabase
      .from('payments')
      .update({
        due_date: newDate,
        status: computeStatus(newDate, today),
      })
      .eq('id', payment.id)
    if (updErr) {
      console.error('Failed to snooze', updErr)
      return
    }
    confirmation = `Pushed "${payment.name}" to ${formatLongDate(newDate)}.`
  }

  await supabase.from('reminders').insert({
    household_id: payment.household_id,
    payment_id: payment.id,
    person_id: person.id,
    channel: 'whatsapp',
    kind: 'followup',
    body: `${action.kind}${action.kind === 'SNOOZE' ? `_${action.days}` : ''} (inbound from ${person.name || toPhone})`,
  })

  await sendTwilioReply(toPhone, confirmation)
}

// ---------- main flow ----------

async function handleInboundMessage(
  fromRaw: string,
  messageBody: string,
  buttonPayload: string,
  repliedSid: string,
): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const person = await matchPerson(supabase, fromRaw)
  if (!person) {
    console.warn('No person matched phone', fromRaw)
    // Don't auto-reply to unknown senders — could be spam, accidental, or
    // someone who hasn't been added yet. Logs it for debugging only.
    return
  }
  console.log('Matched person', person.name, 'household', person.household_id)

  // ---- Step 1: Quote reply ----------------------------------------------
  if (repliedSid) {
    const { data: quoted } = await supabase
      .from('reminders')
      .select('payment_id')
      .eq('household_id', person.household_id)
      .eq('twilio_sid', repliedSid)
      .not('payment_id', 'is', null)
      .maybeSingle()
    if (quoted?.payment_id) {
      const payment = await loadPayment(
        supabase,
        quoted.payment_id,
        person.household_id,
      )
      if (payment) {
        const action = parseAction(messageBody, buttonPayload)
        if (!action) {
          await sendTwilioReply(
            fromRaw,
            'Reply PAID to mark this payment done, or SNOOZE 7 to push it.',
          )
          return
        }
        // A new PAID/SNOOZE supersedes any prior menu.
        await clearPendingChoice(supabase, fromRaw)
        await executeAction(supabase, fromRaw, person, payment, action)
        return
      }
      console.warn('Quoted SID found but payment missing/deleted', repliedSid)
      // Fall through to other resolution paths.
    }
    // Fall through — quoted message wasn't a tally reminder.
  }

  // ---- Step 2: Digit reply (resolves a pending menu) --------------------
  const digit = parseDigit(messageBody)
  if (digit !== null && !parseAction(messageBody, buttonPayload)) {
    // Pure digit reply, e.g. "2"
    const pending = await getPendingChoice(supabase, fromRaw)
    if (!pending) {
      await sendTwilioReply(
        fromRaw,
        "I don't have a pending question for you. Reply PAID to mark a payment done.",
      )
      return
    }
    if (digit < 1 || digit > pending.payment_ids.length) {
      await sendTwilioReply(
        fromRaw,
        `Please pick 1${pending.payment_ids.length > 1 ? `–${pending.payment_ids.length}` : ''}.`,
      )
      return
    }
    const chosenId = pending.payment_ids[digit - 1]
    const payment = await loadPayment(supabase, chosenId, person.household_id)
    if (!payment) {
      await sendTwilioReply(
        fromRaw,
        "That payment isn't around anymore — open Tally to check.",
      )
      await clearPendingChoice(supabase, fromRaw)
      return
    }
    const action: Action =
      pending.action === 'PAID'
        ? { kind: 'PAID' }
        : { kind: 'SNOOZE', days: pending.snooze_days ?? 2 }
    await clearPendingChoice(supabase, fromRaw)
    await executeAction(supabase, fromRaw, person, payment, action)
    return
  }

  // ---- Step 3: PAID / SNOOZE — find candidates --------------------------
  const action = parseAction(messageBody, buttonPayload)
  if (!action) {
    await sendTwilioReply(
      fromRaw,
      "Sorry, didn't catch that. Reply PAID to mark a payment done, or SNOOZE 7 to push it.",
    )
    return
  }

  // A new command always clears any stale menu.
  await clearPendingChoice(supabase, fromRaw)

  const candidates = await findCandidates(supabase, person)
  if (candidates.length === 0) {
    await sendTwilioReply(
      fromRaw,
      "You don't have any pending payment reminders right now.",
    )
    return
  }
  if (candidates.length === 1) {
    await executeAction(supabase, fromRaw, person, candidates[0], action)
    return
  }

  // Multiple — ask which.
  await insertPendingChoice(supabase, fromRaw, person, candidates, action)
  await sendTwilioReply(fromRaw, formatMenu(candidates, action))
}

// ---------- HTTP entry point ----------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const formData = await req.formData()
    const fromRaw = formData.get('From')?.toString() ?? ''
    const messageBody = formData.get('Body')?.toString() ?? ''
    const buttonPayload = formData.get('ButtonPayload')?.toString() ?? ''
    // Twilio populates this when the user uses WhatsApp's native quote-reply.
    // It's the SID of OUR outbound message that they quoted.
    const repliedSid =
      formData.get('OriginalRepliedMessageSid')?.toString() ?? ''

    console.log('Inbound webhook fired', {
      from: fromRaw,
      body: messageBody,
      buttonPayload,
      repliedSid,
    })

    if (!fromRaw) {
      console.warn('Webhook missing From')
      return twimlOk()
    }
    if (!messageBody && !buttonPayload) {
      console.warn('Webhook missing both Body and ButtonPayload')
      return twimlOk()
    }

    await handleInboundMessage(fromRaw, messageBody, buttonPayload, repliedSid)
  } catch (err) {
    console.error('Webhook processing error', err)
  }

  // Always 200 + empty TwiML so Twilio doesn't retry-storm us.
  return twimlOk()
})
