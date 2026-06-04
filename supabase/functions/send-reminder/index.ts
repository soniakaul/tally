// Supabase Edge Function: send-reminder
//
// Sends a WhatsApp message via the Twilio API (Sandbox or paid sender).
//
// POST body: { payment_id: string, person_id: string, kind?: 'reminder' | 'test' | 'followup' }
//
// Uses the caller's JWT (from Authorization header) to enforce RLS — the
// function can only send reminders for payments the user can read.
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID      — starts with "AC..."
//   TWILIO_AUTH_TOKEN       — long string from Twilio console
//   TWILIO_WHATSAPP_FROM    — e.g. "whatsapp:+14155238886" (Sandbox)
//
// Optional:
//   TWILIO_CONTENT_SID      — if set, uses Twilio Content API to send with
//                             quick-reply buttons. Falls back to plain text
//                             Body if not set.
//
// Deploy: paste this into Supabase → Edge Functions → send-reminder → Deploy

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Body = {
  payment_id: string
  person_id: string
  kind?: 'reminder' | 'test' | 'followup'
}

function relativeDueLabel(dueDateISO: string, today = new Date()): string {
  const due = new Date(dueDateISO)
  const diffMs = due.setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
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

function normalizeWhatsAppTo(input: string): string {
  // Twilio wants "whatsapp:+919845012345". Add prefix if missing, strip spaces.
  const cleaned = input.replace(/\s+/g, '')
  return cleaned.startsWith('whatsapp:')
    ? cleaned
    : `whatsapp:${cleaned}`
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonError('Missing Authorization header', 401)
    }

    const body = (await req.json()) as Body
    if (!body.payment_id || !body.person_id) {
      return jsonError('payment_id and person_id are required', 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return jsonError('Not authenticated', 401)

    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('household_id')
      .eq('user_id', user.id)
      .single()
    if (profileErr || !profile) return jsonError('No profile', 404)

    const { data: payment, error: paymentErr } = await userClient
      .from('payments')
      .select('*')
      .eq('id', body.payment_id)
      .single()
    if (paymentErr || !payment) return jsonError('Payment not found', 404)

    if (body.person_id === 'both') {
      return jsonError('Cannot send to "both" — pick a specific person', 400)
    }
    const { data: person, error: personErr } = await userClient
      .from('people')
      .select('*')
      .eq('id', body.person_id)
      .single()
    if (personErr || !person) return jsonError('Person not found', 404)

    if (!person.whatsapp || person.whatsapp.trim().length === 0) {
      return jsonError(
        `${person.name || 'Person'} has no WhatsApp number on file`,
        400,
      )
    }

    let itemName = 'Unlinked'
    let itemType = ''
    let countryName = ''
    if (payment.item_id) {
      const { data: item } = await userClient
        .from('items')
        .select('name, type, country_id')
        .eq('id', payment.item_id)
        .single()
      if (item) {
        itemName = item.name
        itemType = item.type
        const { data: country } = await userClient
          .from('countries')
          .select('name')
          .eq('id', item.country_id)
          .single()
        if (country) countryName = country.name
      }
    }

    const { data: household } = await userClient
      .from('households')
      .select('reminder_template')
      .eq('id', profile.household_id)
      .single()
    const template =
      household?.reminder_template ??
      'Hi {name}! {payment} is due {when} — {amount} {currency}. Reply PAID when done.'

    // Payment details (non-sensitive). Credentials are NEVER referenced in
    // templates — they live behind the creds-get edge function only.
    const portalName = (payment.portal_name as string | null) ?? ''
    const bankName = (payment.bank_name as string | null) ?? ''
    const notes = (payment.notes as string | null) ?? ''

    const vars: Record<string, string> = {
      name: person.name || 'there',
      payment: payment.name,
      item: itemName,
      country: countryName,
      // Keep {category} for backwards-compat with existing templates
      category: itemType ? `${itemName} (${itemType})` : itemName,
      amount: formatAmount(Number(payment.amount), payment.currency),
      currency: payment.currency,
      direction: payment.direction ?? '',
      when: relativeDueLabel(payment.due_date),
      due_date: formatLongDate(payment.due_date),
      portal_name: portalName,
      bank_name: bankName,
      notes,
    }
    const renderedBody = renderTemplate(template, vars)

    // Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM')

    if (!accountSid || !authToken || !fromNumber) {
      return jsonError(
        'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in Supabase secrets.',
        500,
      )
    }

    const toNumber = normalizeWhatsAppTo(person.whatsapp)
    const contentSid = Deno.env.get('TWILIO_CONTENT_SID')

    const form = new URLSearchParams()
    form.append('From', fromNumber)
    form.append('To', toNumber)

    if (contentSid && contentSid.startsWith('HX')) {
      // Content API path — send the approved template with buttons.
      // The template body is locked to what Twilio approved; we pass the
      // dynamic values via ContentVariables in the same order as {{1}}..{{6}}.
      form.append('ContentSid', contentSid)
      form.append(
        'ContentVariables',
        JSON.stringify({
          '1': vars.name,
          '2': vars.payment,
          '3': vars.amount,
          '4': vars.currency,
          '5': vars.when,
          '6': vars.due_date,
        }),
      )
    } else {
      // Plain text path — send the freeform body. No buttons, no approval.
      form.append('Body', renderedBody)
    }

    const twilioRes = await fetch(
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

    const twilioData = await twilioRes.json()

    if (!twilioRes.ok) {
      console.error('Twilio API rejected message', {
        status: twilioRes.status,
        to: toNumber,
        twilio: twilioData,
      })
    }

    // Audit log via service-role client (bypasses RLS so we log even on errors)
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const sid: string | null =
      twilioRes.ok && twilioData?.sid ? twilioData.sid : null
    const errorMessage = twilioRes.ok
      ? null
      : twilioData?.message ||
        twilioData?.error_message ||
        `Twilio responded ${twilioRes.status}`

    await serviceClient.from('reminders').insert({
      household_id: profile.household_id,
      payment_id: payment.id,
      person_id: person.id,
      channel: 'whatsapp',
      kind: body.kind ?? 'reminder',
      body: renderedBody,
      twilio_sid: sid,
      error: errorMessage,
    })

    if (!twilioRes.ok) {
      return jsonError(errorMessage ?? 'Twilio send failed', 502)
    }

    if ((body.kind ?? 'reminder') === 'reminder') {
      await serviceClient
        .from('payments')
        .update({ last_reminder_sent: new Date().toISOString() })
        .eq('id', payment.id)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sid,
        body: renderedBody,
        to: toNumber,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500)
  }
})

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
