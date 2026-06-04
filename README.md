# tally

A household payment tracker with WhatsApp reminders and encrypted credential storage. Built for one specific real user (my mom) and iterated with her in short rounds.

## Features

- Payments organized by **country × item** (property, company, anything she tracks). Per-country views stay in local currency; only the global roll-up converts.
- **Incoming and outgoing** payments — money owed and money owing, same loop.
- **WhatsApp reminders** with three-step reply resolution: native quote-reply → single candidate → numbered menu disambiguation.
- **AES-256-GCM encrypted credentials** per payment (portal + bank). Edge-function proxy, per-user rate limits, audit log. Credentials never appear in reminders.
- **Recurring inheritance** — details and credentials carry forward to auto-created next instances.
- **Scoped edits and deletes** — this only, this and future, or all instances.
- **Soft delete + 30-day Trash** with manual restore, delete-forever, and nightly auto-purge via `pg_cron`.
- **Installable as a Mac app** — PWA with standalone window, dock icon, auto-update.

## Stack

React 19 · TypeScript · Vite · Tailwind · Supabase (Postgres + Auth + RLS + Edge Functions + pg_cron) · Twilio Sandbox for WhatsApp · AES-256-GCM column encryption · Vercel for hosting · `vite-plugin-pwa` for the Mac install.

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

For a working backend you also need:

<<<<<<< HEAD
1. Apply `supabase/schema.sql` in Supabase
2. `openssl rand -base64 32` → set as `TALLY_CREDS_KEY` in Supabase Edge Function secrets
3. `supabase functions deploy creds-get creds-set send-reminder whatsapp-webhook`
=======
1. **Paste `supabase/schema.sql` into the Supabase SQL editor** and run it once. The file is fully self-sufficient — every table, index, RLS policy, function, and the nightly auto-purge cron schedule, all in one paste.
2. `openssl rand -base64 32` → save as `TALLY_CREDS_KEY` in **Supabase Edge Function secrets** (the AES key for credential encryption).
3. Deploy the edge functions:
   ```bash
   supabase functions deploy whatsapp-webhook send-reminder creds-get creds-set
   ```
   Ensure `creds-get` / `creds-set` have **Verify JWT** on; ensure `whatsapp-webhook` has it off.
4. (Optional) Configure Twilio Sandbox: point the inbound webhook at the `whatsapp-webhook` function URL.
>>>>>>> fd2950d (updating docs)

Full step-by-step lives in the [deploy guide](./docs/deploy.md) and [test plan](./docs/manual-test-full.md).

## Deploy

The app is configured for Vercel out of the box (see `vercel.json`). Connect the repo, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as env vars, and deploy. Don't forget to add the production origin to Supabase → Authentication → URL Configuration, otherwise login redirects break.

Once it's live, install it as a Mac app:
- **Chrome / Edge / Arc**: address bar → install icon → done
- **Safari 17+**: File → Add to Dock

The PWA window will show up in Applications, Cmd-Tab, and the Dock — just like a native app.

## Scripts

- `npm run dev` — vite dev server
- `npm run build` — type-check + production build
- `npm run lint` — eslint
- `npm run preview` — preview the production build locally
- `npm run generate-pwa-assets` — regenerate PNG icon fallbacks from `public/pwa-source.svg` (needs Node 20+)

## Status

In use by mom as v1. The app currently supports her single household; widening past her is contingent on a few v2 items called out in the [research log](./docs/user-research.md) — most notably nightly off-platform backup and a co-admin role for recovery.
