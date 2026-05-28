-- ============================================================================
-- Tally schema — paste this whole file into Supabase SQL Editor and run it.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE everywhere.
-- ============================================================================

-- --------------------------------------------------------------------------
-- TABLES
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  home_currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'sage',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id TEXT,
  person TEXT NOT NULL DEFAULT 'both', -- references people.id within household, or 'both'
  name TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
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
  -- composite FK so category must belong to the same household
  FOREIGN KEY (household_id, category_id) REFERENCES categories(household_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_household_due
  ON payments(household_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_household_status
  ON payments(household_id, status);

CREATE TABLE IF NOT EXISTS reminder_rules (
  id TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  offset_days INTEGER, -- nullable: NULL = unconfigured, cron skips
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, id)
);

-- --------------------------------------------------------------------------
-- ROW LEVEL SECURITY — every table scoped to the user's household
-- --------------------------------------------------------------------------

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;

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
  FOREACH tbl IN ARRAY ARRAY['people', 'categories', 'payments', 'reminder_rules']
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

  -- Default categories
  INSERT INTO categories (id, household_id, name, description, color, sort_order) VALUES
    ('india-real-estate', v_household_id, 'India real estate',
      'Property taxes, society charges, maintenance', 'tan', 0),
    ('us-real-estate', v_household_id, 'US real estate',
      'Mortgage, property tax, HOA fees', 'moss', 1),
    ('banking', v_household_id, 'Banking',
      'Loans, credit cards, EMI obligations', 'terracotta', 2),
    ('utilities', v_household_id, 'Utilities',
      'Electricity, water, gas, internet', 'olive', 3),
    ('insurance', v_household_id, 'Insurance',
      'Life, health, vehicle policies', 'amber', 4),
    ('subscriptions', v_household_id, 'Subscriptions',
      'Streaming, software, memberships', 'sage', 5);

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
