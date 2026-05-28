# tally

a payment reminder app for households — built so mom and dad stop missing property taxes, utility bills, and EMIs.

tally tracks due dates, sends WhatsApp reminders on a schedule, and lets payments be marked paid either by replying on WhatsApp or through the portal.

> **building with a real user.** tally is being built iteratively with my mom as the first user — every round of her feedback shapes the next iteration of the design.

## how it works

- **portal** — set up categories, add payments, see what's due. primarily for the person who sets things up.
- **WhatsApp** — automatic reminders go to mom and dad at T-3, T-1, T-0, and T+1 days. reply `PAID` to mark done, `SNOOZE <n>` to push the due date.
- **recurrence** — one-off, monthly, quarterly, or yearly per payment. marking paid auto-creates the next instance.
- **multi-currency** — each payment has its own currency; totals roll up to a chosen home currency via daily FX rates.

## stack

- react 19 + typescript + vite + tailwind
- supabase (auth, postgres, edge functions)
- twilio sandbox for WhatsApp (v1)

## setup

```bash
npm install
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

supabase migrations live in `supabase/`.

## scripts

- `npm run dev` — start vite dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run eslint
- `npm run preview` — preview the production build

## v1 scope

- auth + first-login setup (home currency, household name, mom/dad numbers)
- categories CRUD (max 10, user-defined colors + icons)
- payments CRUD with recurrence
- dashboard — timeline ribbon, stats strip, category cards
- payments table with filters (mom / dad / both, status, category)
- mark-paid in the portal
- twilio reminder cron + webhook for `PAID` / `SNOOZE`

## v2 backlog

- add payment via WhatsApp (`ADD` reply starts a guided flow)
- notes / receipt attachments
- per-person logins
- mobile-optimized layout
- migrate off twilio sandbox to paid sender or meta cloud API

## a note on the schema

`get_email_by_username` in `supabase/schema.sql` is callable by anonymous users and returns the email associated with a username (NULL if not found). this is deliberate — the login form accepts usernames instead of emails — and it does mean usernames are mildly enumerable. fine for a two-user household app; the schema comment acknowledges the trade-off.
