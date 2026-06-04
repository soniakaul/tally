# tally

A household payment tracker with WhatsApp reminders and encrypted credential storage. Built for one specific real user (my mom) and iterated with her in short rounds.

## Features

- Payments organized by **country × item** (property, company, anything she tracks). Per-country views stay in local currency; only the global roll-up converts.
- **Incoming and outgoing** payments — money owed and money owing, same loop.
- **WhatsApp reminders** with three-step reply resolution: native quote-reply → single candidate → numbered menu disambiguation.
- **AES-256-GCM encrypted credentials** per payment (portal + bank). Edge function proxy, per-user rate limits, audit log. Credentials never appear in reminders.
- **Recurring inheritance** — details and credentials carry forward to auto-created next instances.
- **Scoped edits and deletes** — this only, this and future, or all instances.
- **Soft delete + 30-day Trash** with manual restore, delete-forever, and nightly auto-purge via `pg_cron`.

## Stack

React 19 · TypeScript · Vite · Tailwind · Supabase (Postgres + Auth + RLS + Edge Functions + pg_cron) · Twilio Sandbox for WhatsApp · AES-256-GCM column encryption.

## The interesting docs

If you're here to understand *how* this got built, not what it does:

- **[Case study](./docs/case-study.md)** — narrative of building Tally with my mom across iterative rounds. The credential encryption decision (A/B/C trade-off), what I learned about reading her, the role AI played and didn't.
- **[User research log](./docs/user-research.md)** — every round of her feedback, raw quotes alongside my interpretation, dated. The artifact behind the case study.
- **[Manual test plan](./docs/manual-test-full.md)** — the end-to-end script I run before letting mom touch a new build.

## Run it locally

```bash
npm install
cp .env.example .env.local           # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

For the encrypted-credentials feature, also:

1. Apply `supabase/schema.sql` in Supabase
2. `openssl rand -base64 32` → set as `TALLY_CREDS_KEY` in Supabase Edge Function secrets
3. `supabase functions deploy creds-get creds-set send-reminder whatsapp-webhook`

Full step-by-step in the test plan.

## Scripts

- `npm run dev` — vite dev server
- `npm run build` — type-check + production build
- `npm run lint` — eslint
- `npm run preview` — preview the production build
