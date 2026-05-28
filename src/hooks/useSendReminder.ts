import { useState } from 'react'
import { supabase } from '../lib/supabase'

export type SendReminderArgs = {
  payment_id: string
  person_id: string
  kind?: 'reminder' | 'test' | 'followup'
}

export type SendReminderResult = {
  ok: boolean
  error?: string
  body?: string
  to?: string
  sid?: string
}

export function useSendReminder() {
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState<SendReminderResult | null>(null)

  const send = async (args: SendReminderArgs): Promise<SendReminderResult> => {
    setSending(true)
    setLastResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('send-reminder', {
        body: args,
      })
      let result: SendReminderResult
      if (error) {
        // FunctionsHttpError wraps the actual HTTP Response in `context`.
        // We have to await context.json() to see the real error body.
        let errorMessage = error.message || 'Send failed'
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = (await ctx.json()) as { error?: string }
            if (body?.error) errorMessage = body.error
          } catch {
            try {
              const text = await ctx.text()
              if (text) errorMessage = text
            } catch {
              // give up — leave the generic message
            }
          }
        }
        result = { ok: false, error: errorMessage }
      } else {
        result = data as SendReminderResult
      }
      setLastResult(result)
      return result
    } catch (err) {
      const result: SendReminderResult = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
      setLastResult(result)
      return result
    } finally {
      setSending(false)
    }
  }

  return { send, sending, lastResult, reset: () => setLastResult(null) }
}
