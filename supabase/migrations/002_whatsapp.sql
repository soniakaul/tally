-- ============================================================================
-- WhatsApp wiring: template column on households + reminders audit log
-- Paste into Supabase SQL Editor and run. Safe to re-run.
-- ============================================================================

-- Add a customizable reminder template per household.
-- Placeholders: {name}, {payment}, {amount}, {currency}, {when}, {category}
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS reminder_template TEXT NOT NULL DEFAULT
    E'Hi {name}!\n\n{payment} ({category}) is due {when} — {amount} {currency}.\n\nReply PAID when done, or SNOOZE 2 to push by 2 days.\n\n— Tally';

-- Audit log: every reminder we attempt to send, success or failure.
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  person_id TEXT, -- references people.id within the household, or 'both'
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  kind TEXT NOT NULL DEFAULT 'reminder' CHECK (kind IN ('reminder', 'test', 'followup')),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  twilio_sid TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_reminders_household_sent
  ON reminders(household_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_payment
  ON reminders(payment_id);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select_own" ON reminders;
CREATE POLICY "reminders_select_own" ON reminders FOR SELECT
  USING (household_id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()));

-- Inserts come from the Edge Function using the service_role key (bypasses RLS),
-- so no INSERT policy needed for the user-facing client.
