# Tally — full manual test plan

Run this top-to-bottom before handing the app over to mom. Each section is
self-contained; you can re-run any single one.

Keep three tabs open while testing:
- The Tally portal (this app)
- Supabase Dashboard → SQL Editor
- Supabase Dashboard → Edge Functions → Logs

---

## 0. Prerequisites

### 0.1 Schema is applied

Schema lives in one place now: `supabase/schema.sql`. For a fresh Supabase
project, paste the whole file into the SQL Editor and run it once. For an
existing project, it's safe to re-run (everything is idempotent).

Verify by listing tables:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Expect: countries, creds_access_log, households, items, payments,
--         people, profiles, reminders, reminder_rules,
--         whatsapp_pending_choice
```

### 0.2 Generate + register the credentials key

```bash
openssl rand -base64 32
# copy the output
```

Supabase Dashboard → Project Settings → Edge Functions → Secrets → add:
- Name: `TALLY_CREDS_KEY`
- Value: paste the base64 from above

### 0.3 Deploy edge functions

```bash
supabase functions deploy whatsapp-webhook
supabase functions deploy send-reminder
supabase functions deploy creds-get
supabase functions deploy creds-set
```

For `creds-get` and `creds-set` ensure "Verify JWT" is **on** in their
function settings — they must be called with a logged-in user token.
For `whatsapp-webhook`, ensure it is **off** — Twilio doesn't send a JWT.

### 0.4 Cron job sanity

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'tally-auto-purge';
-- Expect: tally-auto-purge | 0 3 * * * | t
```

### 0.5 Auth redirect URL (production only)

If you're testing the live Vercel deploy, make sure Supabase →
Authentication → URL Configuration has:
- Site URL = your production origin (e.g. `https://tally.your-domain.com`)
- Redirect URLs include `<that-origin>/**` and `http://localhost:5173/**`

Otherwise the login redirect breaks silently in production.

---

## A. Countries + Items + inline create

### A.1 First country, first item, first payment (the cold-start path)

Fresh-start as if mom just signed up. If you already have countries, run
`UPDATE countries SET deleted_at = now();` in SQL and refresh.

1. Click **Add payment** in the header.
2. PaymentDialog opens. The amber hint reads
   *"No countries yet — tap + New next to Country below."*
3. Click **+ New** above the Country dropdown.
4. CountryDialog opens. Type `India`. Currency auto-suggests `INR`.
   Click **Create country**. Dialog closes; Country dropdown now shows
   `India (INR)` selected and Currency field reads `INR`.
5. Click **+ New** above Item.
6. ItemDialog opens with India pre-filled. Type `Bandra flat`, type
   `Property`. Click **Create item**.
7. Item dropdown now reads `Bandra flat · Property`.
8. Fill the rest: amount `25000`, direction `Outgoing`, recurrence
   `monthly`, due date today.
9. Save. New row appears in the Payments table.

### A.2 Items page mirrors the inline-created rows

Navigate to **Items** in the sidebar. India shows up with its currency
badge, Bandra flat listed under it with payment count `1`.

### A.3 Duplicate country guard

1. Click `+ Country` on the Items page. Type `India`. Click Create.
2. Expected: the button is disabled and reads
   *"You already have a country with this name."*

### A.4 Random-ID guard (the regression fix)

1. Hard-delete any soft-deleted countries from prior sessions:
   `DELETE FROM countries WHERE deleted_at IS NOT NULL;`
2. Add a new country. It saves the first time — no `c1 already exists`
   error. This validates that ID collisions with trashed rows are
   prevented.

### A.5 Item's + New disabled state

1. Open a fresh Payment dialog (no country selected yet).
2. Hover the **+ New** button next to Item. It is faded out.
3. Tooltip on hover reads *"Pick a country first"*.

---

## B. Payments — CRUD, recurrence, dedup, scoped delete + edit

### B.1 Recurring auto-create

1. Add a monthly payment due today. Mark it paid by clicking the checkbox.
2. Expected: the row fades (paid), and a new instance for next month
   appears in the table.

### B.2 Dedup on toggle (the original duplicate bug)

1. Mark the paid row unpaid.
2. Mark it paid again.
3. Expected: **no duplicate** next-month row appears. The table still
   shows exactly one paid (this month) and one upcoming (next month).

### B.3 Recurrence inheritance carries credentials + details

1. Open an existing recurring payment. Add `Portal name` = `ICICI iMobile`,
   `Bank name` = `ICICI Bank`, `Notes` = `policy #ABC123`. Save.
2. Click **Add credentials** → fill `portal_username` = `mom@icici`,
   `portal_password` = `Mompass!23`. Save credentials.
3. Mark the payment paid.
4. Expected: the auto-created next-month instance also shows the 🔒 lock
   icon in the table, and its Payment details section shows portal name +
   bank name + notes pre-filled.
5. Open it → Edit credentials → Show portal password → `Mompass!23`.
   Credentials inherited.

### B.4 Scoped delete — Just this one

1. Click a paid row → **Remove payment**. Picker appears.
2. Click **Just this one**. The row disappears; next month's row remains.

### B.5 Scoped delete — This and all future

1. Mark the next-month row paid so the chain advances another step.
2. Click any row in that chain → Remove → **This and all future**.
3. Expected: that row + all later rows in the chain are gone. Earlier
   paid instances remain.

### B.6 Scoped delete — All instances (confirm-tap)

1. Add a fresh monthly payment, mark paid twice to create three
   instances.
2. Click any of them → Remove → **All instances (including paid)**.
   Button arms (turns terracotta). Wait > 4 seconds and tap once — it
   re-disarms without deleting.
3. Try again, tap **All instances**, then **immediately tap again**.
   All three instances land in Trash.

### B.7 Edit scope picker

1. Pick a recurring payment with multiple live instances (the chain from
   B.1–B.2).
2. Open the row → change Amount from `25000` to `27000` → click Save.
3. Expected: the **Apply changes to which instances?** picker appears
   above the footer with three buttons: **Just this one** /
   **This and all future** / **All N instances**.
4. Click **All N instances**. Dialog closes.
5. Refresh. Every live instance in the chain now shows `27,000`.
6. Repeat with a different change + pick **Just this one** — only the
   edited row updates.

### B.8 Per-instance fields don't propagate

1. In edit mode, change Due date *and* Amount on a chain row.
2. Pick **All instances**.
3. Expected: Amount propagates to every sibling. Due date *only* updates
   on the row you edited — siblings keep their own dates.

---

## C. Soft delete + Trash + Restore + Purge

### C.1 Per-row soft delete + restore

1. Add a one-off payment "Coffee". Remove it (one-off goes straight to
   trash, no scope picker).
2. Navigate to **Trash**. Expect 1 row labelled `deleted just now`,
   `purges in 30 days`.
3. Click **↺ Restore**. Trash empties. Payments table shows Coffee
   again.

### C.2 Item delete + cascade-up restore

1. Items page → click `Bandra flat` → Remove item. Goes to Trash.
2. Click India → Remove country. ItemsPage prevents this if items
   reference it; if so, delete its items first via the UI.
3. In Trash: India + Bandra flat listed.
4. Click **↺ Restore** on the **Item** (not the country).
5. Expected: BOTH country AND item come back live. The page detects the
   item's country is also in trash and restores it first to keep the FK
   valid.
6. Reverse: re-trash both, then click **↺ Restore** on the **country**
   alone. Country returns live; item stays in Trash. (Downward cascade
   is intentionally off.)

### C.3 Person soft delete

1. Open the household chip (top-right) → add a person `TestUser` with a
   WhatsApp number. Save.
2. Remove TestUser from the household dialog. Trash shows them under
   People.
3. Restore. Person back in the household.

### C.4 Delete forever (per row)

1. Soft-delete any payment (Remove → Just this one).
2. In Trash, click **Delete forever** on that row. Button arms
   (terracotta).
3. Wait > 4 seconds, click once — it re-disarms without deleting.
4. Click again, then **immediately tap again**. Row vanishes from Trash.
5. Verify in SQL: `SELECT * FROM payments WHERE name = '<the name>';`
   returns 0.

### C.5 Empty trash (bulk purge)

1. Soft-delete several payments, items, etc.
2. Trash → header button **Empty trash** → tap, wait < 4s, tap again.
3. All rows are hard-deleted.

### C.6 Country-purge safety guard

1. Add a country `Purge Test`. Add an item `Keeper` under it. Leave
   Keeper live (don't delete it).
2. In SQL, soft-delete the country:
   ```sql
   UPDATE countries SET deleted_at = now() WHERE name = 'Purge Test';
   ```
3. Refresh Trash. Click **Delete forever** on `Purge Test`, confirm-tap.
4. Expected: top-of-page red banner reads
   *"Can't delete this country — 1 item still reference it. Delete those
   items first."* The country stays in Trash; live item `Keeper` is
   untouched.

### C.7 Auto-purge countdown + manual fire

```sql
-- Pick a row in trash:
SELECT id, name, deleted_at FROM payments WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC LIMIT 5;

-- Back-date one row's deleted_at to 31 days ago:
UPDATE payments SET deleted_at = now() - interval '31 days' WHERE id = '<id>';
```

Reload Trash — the row's countdown reads `purges tonight`.

Trigger the purge manually instead of waiting:
```sql
SELECT public.tally_purge_trash();
```

Reload Trash — the row is gone. Confirm in SQL:
```sql
SELECT id FROM payments WHERE id = '<id>';
-- Expected: 0 rows
```

### C.8 Auto-purge — cron actually fires (optional smoke test)

```sql
-- Re-schedule to fire every 2 minutes (then restore!):
SELECT cron.unschedule('tally-auto-purge');
SELECT cron.schedule('tally-auto-purge', '*/2 * * * *', $$SELECT public.tally_purge_trash();$$);

-- After ~3 minutes:
SELECT jobid, runid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'tally-auto-purge')
ORDER BY start_time DESC LIMIT 5;
-- At least one row with status = 'succeeded'.

-- Restore the nightly schedule:
SELECT cron.unschedule('tally-auto-purge');
SELECT cron.schedule('tally-auto-purge', '0 3 * * *', $$SELECT public.tally_purge_trash();$$);
```

### C.9 Country safety in auto-purge (cascade protection)

1. Add a country `Cascade Test`. Add an item `Live Item` under it. Leave
   `Live Item` live.
2. Soft-delete the country with a back-dated timestamp:
   ```sql
   UPDATE countries SET deleted_at = now() - interval '31 days'
   WHERE name = 'Cascade Test';
   ```
3. Run `SELECT public.tally_purge_trash();`
4. Expected: the country is **still there** (the `NOT EXISTS items` guard
   kept it). Live Item is also still there. No cascade casualties.
5. Now also back-date the item:
   ```sql
   UPDATE items SET deleted_at = now() - interval '31 days' WHERE name = 'Live Item';
   ```
6. Run `SELECT public.tally_purge_trash();` again.
7. Expected: both rows are gone. The country can finally be purged once
   nothing references it.

---

## D. WhatsApp reply resolution

**Prereqs**:
- Twilio sandbox configured.
- Test phone has opted in via `join <sandbox-code>`.
- A person in Tally with that exact phone number on file.
- At least one reminder rule enabled in Settings.

### D.1 Single candidate, typed PAID

1. Settings → WhatsApp → Send test reminder for payment `A`.
2. From the test phone, reply `PAID`.
3. Expected: WhatsApp reply *"Got it — marked 'A' as paid. ✓"*. Portal
   shows A as paid.

### D.2 Single candidate, typed SNOOZE

Test reminder for `B`. Reply `SNOOZE 7`. Expected:
*"Pushed 'B' to <date 7 days from due>."* Portal shows new due date.

### D.3 Multiple candidates → numbered menu → digit reply

1. Test reminders for `A` and `B` (gap a few seconds between).
2. Reply `PAID` (no quote).
3. Expected reply:
   ```
   Which payment did you pay?
   1. A — ₹... (May 27)
   2. B — ₹... (May 28)

   Reply with 1–2.
   ```
4. Reply `1`. Confirmation for A. Portal: A paid, B still upcoming.

### D.4 Quote reply

1. Two test reminders out (A and B).
2. In WhatsApp, long-press the A reminder → Reply → send `PAID`.
3. Expected: *"Got it — marked 'A' as paid."* No menu shown — resolved
   by quote. B unchanged.

### D.5 Quote reply to already-paid

1. Mark a payment paid in the portal.
2. Quote-reply its old reminder with `PAID`.
3. Expected: *"'X' was already marked paid on <date>. ✓"*. No double-count.

### D.6 Digit with no pending menu

1. Make sure no menu is pending (or wait 16 minutes for expiry, or
   `DELETE FROM whatsapp_pending_choice;`).
2. Reply `2` out of the blue.
3. Expected: *"I don't have a pending question for you. Reply PAID to
   mark a payment done."*

### D.7 Stale pending menu (expired)

1. Trigger a menu (D.3 setup).
2. Wait > 15 min. Reply `1`. Expected: same as D.6.

### D.8 PAID with zero candidates

Clear all recent reminders for this person:
```sql
DELETE FROM reminders WHERE person_id = '<id>';
```
Reply `PAID`. Expected:
*"You don't have any pending payment reminders right now."*

### D.9 New PAID supersedes prior menu

Trigger a menu (D.3 setup), **don't** answer with a digit, reply `PAID`
again. Expected: a fresh menu replaces the old one (or resolves directly
if only 1 candidate remains).

### D.10 Unknown reply

Reply `hello`. Expected:
*"Sorry, didn't catch that. Reply PAID to mark a payment done, or
SNOOZE 7 to push it."*

---

## E. Payment details + encrypted credentials

### E.1 Non-sensitive details save with the payment

1. Open an existing payment.
2. In **Payment details**: fill `Portal name` = `ICICI iMobile`,
   `Bank name` = `ICICI Bank`, `Notes` = `policy #ABC123`.
3. Click Save.
4. Reopen the payment. All three fields are populated.
5. Verify in SQL:
   ```sql
   SELECT portal_name, bank_name, notes FROM payments WHERE name = '<the name>';
   ```

### E.2 Inline credentials on payment create

1. Click **+ Add payment**.
2. Fill the normal fields. In **Payment details** → **Login credentials**
   sub-section, fill all four: portal username `mom@icici`, portal
   password `Mompass!23`, bank username `9999000011`, bank password
   `Bankpass!23`.
3. Click **Create payment**.
4. Expected: payment is created, the dialog closes, the new row shows
   the 🔒 lock icon in the table. The credentials were encrypted and
   stored in one save flow.

### E.3 Round-trip read (Edit credentials)

1. Reopen a payment that has credentials. Click **Edit credentials**.
2. Expected: dialog opens in *Decrypting…* briefly, then shows the
   masked values. Username fields show plaintext (`mom@icici`); password
   fields show `••••••••`.
3. Click **Show** next to a password — it reveals the plaintext. Click
   **Hide** to mask again.

### E.4 Lock icon in the table

Close the dialog and look at the Payments table. The row's name has a
small 🔒 next to it. Hover → tooltip *"Credentials saved (encrypted)"*.

### E.5 Update one field

1. In the credentials dialog, change *just* the portal password. Save.
2. Reopen. Show portal password → new value. The other three are
   unchanged.

### E.6 Clear a field

1. Click **Clear** next to the bank password. The field empties; the
   dialog tracks this as "touched".
2. Save. Reopen → bank password blank. Portal password etc unchanged.

### E.7 Credential scope picker (series-wide change)

1. On a recurring payment with siblings, open Edit credentials.
2. Expected: a sage-tinted **Apply to which instances?** row appears at
   the bottom with three chips: **Just this one** / **This and all
   future** / **All N instances** (with N = sibling count).
3. Default scope is **All N instances**.
4. Change the portal password. Click Save credentials.
5. Open a sibling payment → Edit credentials → Show portal password →
   you see the new password. The change propagated.
6. Repeat: change again with scope = **Just this one**. The other
   siblings keep the previous value; only the edited row changes.

### E.8 Encryption at rest (the load-bearing assertion)

```sql
SELECT name,
       portal_username_ct IS NOT NULL AS has_portal_user,
       portal_password_ct IS NOT NULL AS has_portal_pw,
       encode(portal_username_ct, 'hex') AS portal_username_hex_preview
FROM payments WHERE name = '<the name>';
```

- `has_portal_user` / `has_portal_pw` → `true`
- `portal_username_hex_preview` → random hex starting with a 12-byte IV.
  It must **NOT** contain `mom@icici` or any other readable string.

### E.9 Access log captures every read/write

```sql
SELECT action, succeeded, created_at, payment_id
FROM creds_access_log
ORDER BY created_at DESC LIMIT 20;
```

You'll see `write` rows for the saves and `read` rows for each open of
the credentials dialog.

### E.10 Rate limit (read) — 30/hr per user

Open the credentials dialog ~30 times in quick succession. On the 31st
open within an hour, expected:
- Top error banner: *"Rate limit: max 30 credential reads per hour. Try
  again later."*
- The dialog still lets you type (in case you want to write new values).

To simulate fast:
```sql
INSERT INTO creds_access_log (user_id, payment_id, action, succeeded)
SELECT auth.uid(), '<some payment id>', 'read', true
FROM generate_series(1, 30);
```
Then refresh and click Edit credentials. The 31st read returns 429.

### E.11 Rate limit (write) — 60/hr per user

```sql
INSERT INTO creds_access_log (user_id, payment_id, action, succeeded)
SELECT auth.uid(), '<some payment id>', 'write', true
FROM generate_series(1, 60);
```
Save credentials → top error banner shows the write rate-limit message.

### E.12 Ownership check (negative test)

In an incognito window, log in as a different user (or sign up a second
account in a fresh household). With that user, try to fetch creds for a
payment owned by your test household:

```bash
curl 'https://<project>.supabase.co/functions/v1/creds-get?payment_id=<OTHER_USERS_PAYMENT_ID>' \
  -H "Authorization: Bearer <OTHER_USERS_JWT>"
```

Expected: `{"error":"not found"}` with status 404. RLS hid the row.

### E.13 Reminder template surfaces portal + bank + notes only

1. Settings → WhatsApp → template editor. Edit template to include:
   ```
   Hi {name}!
   {payment} is due {when} — {amount} {currency}.
   Pay on: {portal_name}
   Bank: {bank_name}
   Notes: {notes}
   Reply PAID when done.
   ```
2. Save. The auto-save indicator confirms "Saved".
3. The Preview pane renders with real values, including portal/bank/
   notes from the payment selected in the "About which payment" picker.
4. Send a test reminder. The WhatsApp message body matches the preview.
5. **Crucial assertion**: variables `{portal_username}`,
   `{portal_password}`, `{bank_username}`, `{bank_password}` are NOT in
   the variable list. If you type them into the template, they render
   as literal text (`{portal_username}`), never substituted.
6. SQL audit of the reminders table:
   ```sql
   SELECT body FROM reminders ORDER BY sent_at DESC LIMIT 3;
   ```
   The body contains portal_name / bank_name / notes if you used them,
   but never any credential.

---

## F. Filters, stat cards, currency

### F.1 Country filter switches stat currency

1. Add payments under two countries: India (INR) and US (USD).
2. With no filter: stat cards show in your home currency (INR by
   default).
3. Change Country filter to `US`. Stat cards switch to USD totals (no
   conversion artifact).

### F.2 Item filter inherits country currency

1. With country filter = All, pick an Item filter for a US property.
2. Stat cards switch to USD because the item's country is US.

### F.3 Per-month stat scope

The Inflow / Outflow cards count only payments with `due_date` in the
current calendar month. A monthly payment due July 27 doesn't appear in
May totals.

### F.4 Direction toggle in PaymentDialog

1. Add a new payment. Notice neither Incoming nor Outgoing is
   preselected.
2. Try to save without picking — the Create payment button stays
   disabled.
3. Pick Outgoing. Save works.

### F.5 Currency auto-fill

1. New payment, pick Country = India. Currency auto-fills `INR`.
2. Change Country to US. Currency switches to `USD`.
3. Type `EUR` in the Currency field. Save. Reopen — currency is `EUR`
   (the manual override). Now change Country again — currency
   overwrites to the new country's default. (Documented trade-off.)

### F.6 Hero title shows current calendar month

The hero on the Payments page reads `payments.` with the subtitle
`X payments due this month · Y overdue`. The page title bar
(installed PWA) reads simply `tally` — no double-up.

### F.7 Date display matches the date you entered

1. Add a payment with due date "today".
2. The row's Due column shows today's calendar date, not yesterday's.
   (Validates the timezone fix — `parseLocalDate` is in use everywhere.)

---

## Tear-down

Optionally clean up test data:
```sql
DELETE FROM payments WHERE name IN ('Coffee', 'A', 'B', '<your test names>');
DELETE FROM creds_access_log;
DELETE FROM whatsapp_pending_choice;
DELETE FROM reminders WHERE kind IN ('test', 'followup');
```

If any step fails, the most informative places to look:
- Browser DevTools → Network → the failed Supabase REST / edge-function
  response body has the actual error
- Supabase dashboard → Edge Functions → Logs for the function involved
- Supabase dashboard → Database → `cron.job_run_details` for cron
  failures

When all sections pass, the system is ready to hand to mom. Walk her
through a Loom of section A once and she can take it from there.
