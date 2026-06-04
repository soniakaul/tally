-- ============================================================================
-- Tally schema — the single source of truth for the database.
--
-- To set up a fresh Supabase project: paste this whole file into the SQL
-- Editor and run it once. That's it. Everything is here:
--   • All tables (households, profiles, people, countries, items, payments,
--     reminder_rules, reminders, whatsapp_pending_choice, creds_access_log)
--   • All indexes, including soft-delete partial indexes
--   • All RLS policies
--   • All functions (get_email_by_username, setup_new_household,
--     touch_updated_at, clone_payment_next_recurrence, tally_purge_trash)
--   • The nightly auto-purge cron schedule (pg_cron)
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE everywhere, and
-- the cron schedule is unscheduled-then-rescheduled to stay idempotent.
-- ============================================================================

-- --------------------------------------------------------------------------
-- TABLES
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  home_currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  -- WhatsApp reminder template. Placeholders: {name} {payment} {amount}
  -- {currency} {when} {portal_name} {bank_name} {notes} {item} {country}.
  -- Credentials are deliberately NOT available as placeholders.
  reminder_template TEXT NOT NULL DEFAULT
    E'Hi {name}!\n\n{payment} ({item}) is due {when} — {amount} {currency}.\n\nReply PAID when done, or SNOOZE 2 to push by 2 days.\n\n— Tally',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive: if the table already existed without reminder_template, add it.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS reminder_template TEXT NOT NULL DEFAULT
    E'Hi {name}!\n\n{payment} ({item}) is due {when} — {amount} {currency}.\n\nReply PAID when done, or SNOOZE 2 to push by 2 days.\n\n— Tally';

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'sage',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS countries (
  id TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  country_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Property',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, country_id) REFERENCES countries(household_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_household_country
  ON items(household_id, country_id);
CREATE INDEX IF NOT EXISTS idx_items_household_live
  ON items(household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_items_household_deleted
  ON items(household_id, deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_countries_household_live
  ON countries(household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_countries_household_deleted
  ON countries(household_id, deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_household_live
  ON people(household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_people_household_deleted
  ON people(household_id, deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item_id TEXT,
  person TEXT NOT NULL DEFAULT 'both', -- references people.id within household, or 'both'
  name TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  due_date DATE NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'monthly'
    CHECK (recurrence IN ('one-off', 'monthly', 'quarterly', 'yearly')),
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'overdue', 'paid')),
  paid_at TIMESTAMPTZ,
  paid_via TEXT CHECK (paid_via IN ('portal', 'whatsapp')),
  last_reminder_sent TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  -- Payment details (non-sensitive)
  portal_name TEXT,
  bank_name TEXT,
  notes TEXT,
  -- Encrypted credentials (12-byte IV || AES-256-GCM ciphertext+tag)
  portal_username_ct BYTEA,
  portal_password_ct BYTEA,
  bank_username_ct BYTEA,
  bank_password_ct BYTEA,
  has_credentials BOOLEAN GENERATED ALWAYS AS (
    portal_username_ct IS NOT NULL OR
    portal_password_ct IS NOT NULL OR
    bank_username_ct   IS NOT NULL OR
    bank_password_ct   IS NOT NULL
  ) STORED,
  -- composite FK so item must belong to the same household
  FOREIGN KEY (household_id, item_id) REFERENCES items(household_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS creds_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  payment_id UUID,
  action TEXT NOT NULL CHECK (action IN ('read', 'write')),
  succeeded BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creds_log_user_action_time
  ON creds_access_log(user_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_household_due
  ON payments(household_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_household_status
  ON payments(household_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_household_item
  ON payments(household_id, item_id);
CREATE INDEX IF NOT EXISTS idx_payments_household_live
  ON payments(household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_household_deleted
  ON payments(household_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- Audit log: every reminder we attempt to send, success or failure.
-- Inserts come from the send-reminder edge function via service role.
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  person_id TEXT, -- references people.id within the household, or 'both'
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  kind TEXT NOT NULL DEFAULT 'reminder'
    CHECK (kind IN ('reminder', 'test', 'followup')),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  twilio_sid TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_reminders_household_sent
  ON reminders(household_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_payment
  ON reminders(payment_id);
CREATE INDEX IF NOT EXISTS idx_reminders_twilio_sid
  ON reminders(twilio_sid) WHERE twilio_sid IS NOT NULL;

CREATE TABLE IF NOT EXISTS reminder_rules (
  id TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  offset_days INTEGER, -- nullable: NULL = unconfigured, cron skips
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, id)
);

-- WhatsApp reply resolution: pending disambiguation menu per phone number.
CREATE TABLE IF NOT EXISTS whatsapp_pending_choice (
  phone TEXT PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL,
  payment_ids UUID[] NOT NULL,
  action TEXT NOT NULL DEFAULT 'PAID'
    CHECK (action IN ('PAID', 'SNOOZE')),
  snooze_days INTEGER,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- ROW LEVEL SECURITY — every table scoped to the user's household
-- --------------------------------------------------------------------------

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_pending_choice ENABLE ROW LEVEL SECURITY;
ALTER TABLE creds_access_log ENABLE ROW LEVEL SECURITY;

-- Reminders are read-only for the user (writes go via service-role edge fn).
DROP POLICY IF EXISTS "reminders_select_own" ON reminders;
CREATE POLICY "reminders_select_own" ON reminders FOR SELECT
  USING (household_id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()));

-- Helper inlined into every policy: this user's household_id
-- (using a SELECT subquery keeps RLS evaluable and uses the index on profiles)

-- HOUSEHOLDS
DROP POLICY IF EXISTS "household_select_own" ON households;
CREATE POLICY "household_select_own" ON households FOR SELECT
  USING (id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "household_update_own" ON households;
CREATE POLICY "household_update_own" ON households FOR UPDATE
  USING (id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "household_delete_own" ON households;
CREATE POLICY "household_delete_own" ON households FOR DELETE
  USING (id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()));

-- PROFILES (user reads/updates own row only)
DROP POLICY IF EXISTS "profile_select_own" ON profiles;
CREATE POLICY "profile_select_own" ON profiles FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "profile_update_own" ON profiles;
CREATE POLICY "profile_update_own" ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- PEOPLE / CATEGORIES / PAYMENTS / REMINDER_RULES — same scoped policy template
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['people', 'countries', 'items', 'payments', 'reminder_rules']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%I_all_own" ON %I', tbl, tbl);
    EXECUTE format($q$
      CREATE POLICY "%I_all_own" ON %I FOR ALL
        USING (household_id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()))
        WITH CHECK (household_id = (SELECT household_id FROM profiles WHERE user_id = auth.uid()))
    $q$, tbl, tbl);
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- FUNCTIONS
-- --------------------------------------------------------------------------

-- Username → email lookup. Called by the (unauthenticated) login form so we
-- can sign in via Supabase's email/password flow using just a username.
-- SECURITY DEFINER so anon can call it without seeing the profiles table.
-- Returns NULL if username doesn't exist (no enumeration risk worth mitigating
-- for a 2-user household app, but rate-limit on the client if you care).
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM profiles WHERE username = lower(p_username);
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO anon, authenticated;

-- After signUp, the client calls this to atomically create the household,
-- link the profile, and seed defaults. Must be authenticated (auth.uid()).
CREATE OR REPLACE FUNCTION public.setup_new_household(
  p_username TEXT,
  p_email TEXT,
  p_household_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_username_lower TEXT := lower(p_username);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account already has a household' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE username = v_username_lower) THEN
    RAISE EXCEPTION 'Username already taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO households (name)
    VALUES (p_household_name)
    RETURNING id INTO v_household_id;

  INSERT INTO profiles (user_id, household_id, username, email)
    VALUES (auth.uid(), v_household_id, v_username_lower, p_email);

  -- Default people
  INSERT INTO people (id, household_id, name, color, sort_order) VALUES
    ('mom', v_household_id, 'Mom', 'tan', 0),
    ('dad', v_household_id, 'Dad', 'moss', 1);

  -- Countries and items are user-defined; nothing to seed here.

  -- Default reminder rules
  INSERT INTO reminder_rules (id, household_id, offset_days, enabled, sort_order) VALUES
    ('r1', v_household_id, -3, true, 0),
    ('r2', v_household_id, -1, true, 1),
    ('r3', v_household_id, 0,  true, 2),
    ('r4', v_household_id, 1,  true, 3);

  RETURN v_household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_new_household(TEXT, TEXT, TEXT) TO authenticated;

-- Keep updated_at in sync on households + payments
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_households_updated_at ON households;
CREATE TRIGGER touch_households_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_payments_updated_at ON payments;
CREATE TRIGGER touch_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- --------------------------------------------------------------------------
-- RECURRENCE CLONE
-- --------------------------------------------------------------------------
-- When a recurring payment is marked paid, the app creates the "next
-- instance" by cloning the source row server-side. This includes the
-- encrypted credential ciphertext columns, which the JS client never sees
-- directly. SECURITY INVOKER → RLS applies, so the user can only clone a
-- payment they own.

CREATE OR REPLACE FUNCTION public.clone_payment_next_recurrence(
  source_payment_id UUID,
  next_due_date DATE,
  next_status TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF next_status NOT IN ('upcoming', 'overdue') THEN
    RAISE EXCEPTION 'next_status must be upcoming or overdue' USING ERRCODE = '22023';
  END IF;

  INSERT INTO payments (
    household_id, item_id, person, name, amount, currency, direction,
    due_date, recurrence, end_date, status,
    portal_name, bank_name, notes,
    portal_username_ct, portal_password_ct, bank_username_ct, bank_password_ct
  )
  SELECT
    household_id, item_id, person, name, amount, currency, direction,
    next_due_date, recurrence, end_date, next_status,
    portal_name, bank_name, notes,
    portal_username_ct, portal_password_ct, bank_username_ct, bank_password_ct
  FROM payments
  WHERE id = source_payment_id
    AND deleted_at IS NULL
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_payment_next_recurrence(UUID, DATE, TEXT)
  TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- AUTO-PURGE (Trash retention)
-- --------------------------------------------------------------------------
-- Hard-deletes soft-deleted rows older than 30 days. Order matters because
-- payments → items → countries form a FK chain:
--   1. Payments first (no children).
--   2. Items next. The payments→items FK is ON DELETE SET NULL — any live
--      payment pointing at this item just becomes "Unlinked".
--   3. Countries — BUT only if no items (live or trashed) reference them.
--      The items→countries CASCADE would otherwise silently hard-delete
--      live items.
--   4. People last (payments.person is plain text, no FK chain).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tally_purge_trash()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM payments
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '30 days';

  DELETE FROM items
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '30 days';

  DELETE FROM countries c
    WHERE c.deleted_at IS NOT NULL
      AND c.deleted_at < now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM items i
        WHERE i.household_id = c.household_id AND i.country_id = c.id
      );

  DELETE FROM people
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '30 days';
END;
$$;

-- (Re)schedule the nightly purge. Safe to re-run — unschedules first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tally-auto-purge') THEN
    PERFORM cron.unschedule('tally-auto-purge');
  END IF;
END $$;

SELECT cron.schedule(
  'tally-auto-purge',
  '0 3 * * *', -- daily at 03:00 UTC
  $$SELECT public.tally_purge_trash();$$
);
