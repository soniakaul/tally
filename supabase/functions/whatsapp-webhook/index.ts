// Supabase Edge Function: whatsapp-webhook
//
// Receives inbound WhatsApp replies from Twilio.
//
// Twilio posts form-encoded data with fields like:
//   From=whatsapp:+919845012345
//   Body=PAID
//   MessageSid=SM...
//   AccountSid=AC...
//
// We parse the Body for "PAID" / "SNOOZE N" commands, look up which payment
// the most recent reminder to this person was about, and update accordingly.
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided)
//
// Deploy: paste this into Supabase → Edge Functions → create "whatsapp-webhook"
//
// IMPORTANT: when creating the function in the Supabase dashboard, toggle off
// "Enforce JWT" / "Verify JWT". Twilio's POSTs aren't authenticated with the
// Supabase JWT.
//
// After deploying, configure Twilio:
//   Twilio Console → Messaging → Try it out → Send a WhatsApp message →
//   Sandbox settings → "When a message comes in" → paste the function URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Recurrence = 'one-off' | 'monthly' | 'quarterly' | 'yearly'

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

function normalizePhoneCandidates(input: string): string[] {
  // Twilio sends "whatsapp:+919845012345". Users likely save as "+919845012345"
  // or sometimes "919845012345". Try a few formats when looking up the person.
  const stripped = input.replace(/^whatsapp:/i, '').replace(/\s+/g, '')
  const digits = stripped.replace(/[^\d]/g, '')
  return Array.from(new Set([stripped, `+${digits}`, digits]))
}

async function sendTwilioReply(
  toNumber: string,
  text: string,
): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM')
  if (!accountSid || !authToken || !fromNumber) {
    console.error('Cannot send confirmation — Twilio credentials missing')
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
  if (!res.ok) {
    console.error('Twilio confirmation send failed', await res.text())
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Twilio posts form-encoded body
    const formData = await req.formData()
    const fromRaw = formData.get('From')?.toString() ?? ''
    const messageBody = formData.get('Body')?.toString() ?? ''
    // When the user taps a quick-reply button, Twilio sends the button's
    // custom payload (the "ID" we set in the Content Template — PAID,
    // SNOOZE_2, SNOOZE_7) in this field. Empty for typed replies.
    const buttonPayload = formData.get('ButtonPayload')?.toString() ?? ''

    console.log('Inbound webhook fired', {
      from: fromRaw,
      body: messageBody,
      buttonPayload,
    })

    if (!fromRaw) {
      console.warn('Webhook missing From', { from: fromRaw })
      return twimlOk()
    }
    if (!messageBody && !buttonPayload) {
      console.warn('Webhook missing both Body and ButtonPayload')
      return twimlOk()
    }

    await handleInboundMessage(fromRaw, messageBody, buttonPayload)
  } catch (err) {
    console.error('Webhook processing error', err)
  }

  // Always 200 + empty TwiML so Twilio doesn't retry-storm us.
  return twimlOk()
})

function twimlOk(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

async function handleInboundMessage(
  fromRaw: string,
  messageBody: string,
  buttonPayload: string,
): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Digits-only matching so "+91 98450 12345" and "whatsapp:+919845012345"
  // both work. Pulls all people (service role bypasses RLS) and filters in JS.
  const fromDigits = fromRaw.replace(/[^\d]/g, '')
  const { data: allPeople } = await supabase
    .from('people')
    .select('id, household_id, name, whatsapp')

  const person = allPeople?.find(
    (p) => p.whatsapp.replace(/[^\d]/g, '') === fromDigits,
  )

  if (!person) {
    console.warn(
      'No person matched phone',
      fromRaw,
      'digits',
      fromDigits,
      'checked',
      allPeople?.length ?? 0,
      'people',
    )
    return
  }
  console.log('Matched person', person.name, 'in household', person.household_id)

  // Parse the action. Prefer ButtonPayload (button tap) over Body (typed).
  let action: string | null = null

  if (buttonPayload) {
    // Button tap — payload is our exact ID: "PAID", "SNOOZE_2", "SNOOZE_7"
    const p = buttonPayload.trim().toUpperCase()
    if (p === 'PAID' || p.startsWith('SNOOZE_')) {
      action = p
    }
  }

  if (!action) {
    // Fall back to typed text
    const text = messageBody.trim().toUpperCase()
    if (text === 'PAID' || text === 'DONE' || text === '✓') {
      action = 'PAID'
    } else if (text.startsWith('SNOOZE')) {
      const match = text.match(/SNOOZE\s*(\d+)?/)
      const days = match?.[1] ?? '2'
      action = `SNOOZE_${days}`
    }
  }

  if (!action) {
    // Unknown reply — send help text
    await sendTwilioReply(
      fromRaw,
      'Sorry, I didn\'t catch that. Reply PAID to mark a payment as done, or SNOOZE 2 (or 7) to push it.',
    )
    return
  }

  // Find the most recent outbound message we sent to this person so we know
  // which payment they're responding to. Match any kind (reminder OR test OR
  // followup) — the test-send from Settings logs as 'test', not 'reminder'.
  const { data: lastReminder } = await supabase
    .from('reminders')
    .select('payment_id, sent_at, kind')
    .eq('household_id', person.household_id)
    .eq('person_id', person.id)
    .in('kind', ['reminder', 'test'])
    .not('payment_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  console.log('Last reminder lookup', lastReminder)

  const paymentId = lastReminder?.payment_id
  if (!paymentId) {
    await sendTwilioReply(
      fromRaw,
      'Got your reply, but I can\'t tell which payment you meant. Open the Tally portal to update manually.',
    )
    return
  }

  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('household_id', person.household_id)
    .single()

  if (paymentErr || !payment) {
    console.warn('Payment not found or wrong household', paymentId)
    return
  }

  let confirmation: string

  if (action === 'PAID') {
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

    // Create next recurring instance
    if (payment.recurrence !== 'one-off') {
      const nextDate = bumpDueDate(payment.due_date, payment.recurrence)
      const pastEnd = payment.end_date && nextDate > payment.end_date
      if (!pastEnd) {
        const { error: insErr } = await supabase.from('payments').insert({
          household_id: payment.household_id,
          category_id: payment.category_id,
          person: payment.person,
          name: payment.name,
          amount: payment.amount,
          currency: payment.currency,
          due_date: nextDate,
          recurrence: payment.recurrence,
          end_date: payment.end_date,
          status: computeStatus(nextDate, now),
        })
        if (insErr) console.error('Next instance insert failed', insErr)
      }
    }

    confirmation = `Got it — marked "${payment.name}" as paid. ✓`
  } else if (action.startsWith('SNOOZE_')) {
    const days = parseInt(action.replace('SNOOZE_', ''), 10)
    if (Number.isNaN(days) || days <= 0 || days > 60) {
      await sendTwilioReply(
        fromRaw,
        'Pick a snooze between 1 and 60 days. Try "SNOOZE 7".',
      )
      return
    }
    const newDate = addDays(payment.due_date, days)
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
  } else {
    return
  }

  await supabase.from('reminders').insert({
    household_id: payment.household_id,
    payment_id: payment.id,
    person_id: person.id,
    channel: 'whatsapp',
    kind: 'followup',
    body: `${action} (inbound from ${person.name || fromRaw})`,
  })

  await sendTwilioReply(fromRaw, confirmation)
}
