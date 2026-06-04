# user research

tally is being built for one real person first — my mom — and then for households like hers. this doc tracks every round of feedback, what it meant for the product, and what changed in response.

## approach

- **n = 1, on purpose.** v1 is built from a single sentence my mom said. every round after is her using it (or looking at it) and reacting. once it's genuinely useful for her, i'll widen.
- **build before asking.** she doesn't have opinions about features in the abstract — she has opinions about screens she can point at. so each round starts with something concrete in front of her.
- **separate raw feedback from interpretation.** her words go in one column, what i think they mean goes in another. it forces me to notice when i'm jumping to a solution she didn't ask for.
- **decisions are dated.** product direction shifts; the log shouldn't pretend it didn't.

---

## v1 — the brief

**date:** 2026-05-24
**format:** one sentence, in conversation.

> "i need something that reminds me on whatsapp when bills are due."

**what i built from that:**

- whatsapp as the primary reminder surface (T-3 / T-1 / T-0 / T+1)
- a portal for setup and audit (categories, payments, mark-paid)
- recurrence built in (one-off / monthly / quarterly / yearly)
- multi-currency from day one, since some of her payments are abroad
- one shared household login, tag payments as mom / dad / both

scope decisions i made *for* her at this stage are flagged so i can revisit them when she actually uses the thing:

| decision | why i made it | revisit when |
| --- | --- | --- |
| categories (max 10) as the top-level grouping | seemed like a clean SaaS pattern | she sees the app |
| `PAID` / `SNOOZE` as the only whatsapp replies | smallest surface that handles the core loop | she tries replying |
| outgoing payments only | "bills are due" framed it that way | round 1 (see below) |

---

## round 1 — first walkthrough

**date:** 2026-05-27
**format:** showed her a description of the app, no live demo yet. she hadn't touched it.
**duration:** ~one conversation.

### what she said

| her words | what it actually means |
| --- | --- |
| "add payment details to each payment — app/link name, app login, bank name, bank login info" | a payment isn't just a due date and an amount. it's a *task with a destination.* she needs to know *where to go and how to log in* the moment a reminder fires. without that, the reminder just tells her she's late without helping her act. |
| "how do i decide which payment to reply to?" | the whatsapp reply model is broken when more than one payment is pending. `PAID` is ambiguous. needs a payment identifier or per-payment thread. |
| "add 20 properties" | she manages ~20 real-estate properties, each with its own set of payments. the data model has to scale past the toy household case. |
| "categories → properties" | the mental model isn't "utilities / insurance / taxes." it's "property A, property B, property C." properties *are* the categories for her. |
| "i have payments outgoing AND incoming. both have to be confirmed." | tally is not a bills app. it's an accounts-receivable + accounts-payable tracker for a household landlord. money she's owed (rent, etc.) needs the same reminder + confirmation loop as money she owes. |
| "everything due this month → `<month name>: payments`" | small but real: "this month" is abstract. "may: payments" is concrete and matches how she talks about it. |

### what this changes

1. **data model: payment gains a `direction` field (`outgoing` / `incoming`).** dashboard splits into two halves — money out, money in. status pills mean different things on each side ("paid" vs "received").
2. **categories → properties.** rename across UI and schema. cap moves from 10 to at least 25 to leave headroom past her current 20.
3. **payment gains structured metadata:** `payee_name`, `payee_url`, `login_hint`, `bank_name`, `bank_login_hint`. login *hints*, not stored credentials — the app should never hold passwords. revisit if she pushes back on that.
4. **whatsapp reply protocol needs disambiguation.** options to test: (a) numbered payments in each reminder, reply `PAID 2`; (b) one thread per payment via twilio sub-numbers (expensive); (c) reply to the specific reminder message and read the quoted text. leaning toward (a) for v1.5.
5. **copy pass.** "due this month" → live month name everywhere. audit all date labels for the same abstract-vs-concrete trap.

### what i'm *not* changing yet

- still one shared household login. she didn't ask for per-person.
- still no payment-via-whatsapp (`ADD` flow). she didn't mention it. v2.
- still no receipt attachments. she didn't mention it. v2.

---

## round 1 — revisited

**date:** 2026-05-30 (few days later)
**format:** she added more detail after my first pass.
**why this is its own section:** my first interpretation was wrong in a way worth showing. i flattened a two-dimensional structure into one dimension ("rename categories to properties") and missed the operating model underneath. when she gave me more detail, the actual shape came into view. leaving both reads in the doc — instead of overwriting the first one — is the point of this log.

### what she added

| her words | what it actually means |
| --- | --- |
| "countries + items → categories for properties or companies" | i had it half-right. categories aren't just *properties.* every payment lives at the intersection of a **country** and an **item**, where an item is either a **property** (real estate) or a **company** (a business she has a stake in). she doesn't have categories; she has a 2D matrix. |
| "country-wise, property-wise, payment-wise — overall numbers per country in that country's currency, numbers per property to see outflow vs inflow of that property" | the per-country view should show **local currency, not home currency.** my round-1 read assumed everything rolls up to one home currency. that's true for the global view, but wrong for the per-country drill-down — there she wants USD totals in USD, INR totals in INR. converting hides the truth. |
| "filter by country for outflow and inflow, filter by property" | filters are first-class. country and item are not just tags, they're the primary slicers of the entire dataset. |
| "monthly outflow should only show all payments within that month" | the dashboard stat card needs to be a strict **calendar-month** total, not a rolling 30-day or year-to-date number. small clarification, easy to get wrong silently. |
| "backup data — recover data mechanism — important data, how to be safe? once my mom is reliant on it it cannot go. willing to pay for the twilio usage." | this is the most important thing she said all day, and it's not a feature — it's an operating principle. she's signaling **trust.** for her to actually rely on tally, the bar isn't "it works." it's "if it breaks i will not lose the years of payment history i put into it." willingness to pay is her telling me she values reliability over free. |

### what this changes — round 1 revised

revised decisions (supersede the earlier list above):

1. **data model: not "properties" — `country` × `item` (item type: property | company).** payment.country_id and payment.item_id, with item having an item_type. that's two new tables (or one items table with a type column + a countries table) and a real schema change from where v1 landed.
2. **multi-currency, restated:** home currency is for the **global** roll-up only. **per-country views render in that country's local currency, with no conversion.** the per-property card shows totals in the property's country currency. only the top-level "everything everywhere" stat converts.
3. **filters are a primary surface.** country filter + item filter + direction (in/out) filter must be available everywhere payments appear — not just the table page.
4. **monthly outflow card → strict calendar-month, bounded by `due_date BETWEEN month_start AND month_end`.** audit other "this month / this week" labels for the same precision issue.
5. **backup & recovery becomes a v1 line item, not a v2 nice-to-have.** specific tactics for v1:
   - turn on supabase point-in-time recovery (paid tier — she said she'll pay)
   - nightly export to email or google drive, CSV per table — runs even if the app is down
   - soft delete only — no hard-delete UI in v1; deleted rows keep a `deleted_at` and are recoverable from the portal
   - audit log of every mutation (we already have a `reminders` audit table; add a similar `mutations` log for payments + items)
   - a "download all my data" button in settings — she should be able to walk away with everything, anytime
6. **a smaller meta-decision:** i'm going to stop calling these "categories" anywhere in the codebase. there are countries, there are items (properties + companies), there is direction (in/out). "category" was a SaaS-shaped word that obscured the real model.

### what i learned about how i'm reading her

- **she answers in the order things matter to her.** payment metadata came first; backup came last. but backup is the load-bearing one — if the app loses her data once, none of the rest matters. ranking ≠ importance. ask the trust question directly next round.
- **she uses one word ("categories") to mean several things.** in round 1, "categories" meant "the way i group payments." in round 1 revisited, "categories" meant "the matrix of country × item." the word is overloaded — i should stop using it as if it has a single referent and instead ask "group by what, sliced by what?"
- **i made one assumption *for* her that turned out to be wrong: a single home currency.** noting it. next time i make an assumption-for-her, i'll flag it as such in the table at the top so it's easy to re-examine on contact with reality.

### open questions for round 2 (revised)

- once she sees the country × item matrix on screen, does the matrix shape actually match her head — or does she think property-first, country-second?
- the credential-hints idea (round 1, point 3): does she want them visible in the portal, or only surfaced inside the whatsapp reminder?
- backup: nightly email export vs. google drive vs. both? what would make her *feel* safe — the existence of the backup, or seeing the file land somewhere she controls?
- does she want incoming payments to nudge the *payer* (e.g. a tenant) on whatsapp, or just remind *her* to chase?

---

## round 2 — first real walkthrough

**date:** 2026-06-01
**format:** she opened the portal, tried to use it as if she were going to enter all her real data. i sat next to her and watched her get stuck. a stream of small asks, plus one big one at the end.
**duration:** ~45 minutes of her clicking, ~2 hours of me iterating in between her batches of feedback.

### what she said — small fixes (UX layer)

these felt minor in the moment but every one of them tells me something about how she reads the screen.

| her words | what it actually means |
| --- | --- |
| "the **inflow / outflow** words don't feel right" → switch to **incoming / outgoing** | "inflow / outflow" is finance jargon. she doesn't think in cash-flow statements; she thinks "money coming in" vs "money going out." use her words. |
| "rename **dashboard** to **payments**" and just say "payments." in the hero | she doesn't think of it as a dashboard. it's the list of payments. the abstraction was for me, not her. |
| "when i pick a country, the currency should fill in. always." | i had a `currencyTouched` guard that suppressed the auto-fill after any keystroke. she expected hard-coupling: country = currency. the override path (rare) can come after, not block the common path. |
| "filtering by country should show totals in that country's currency, not converted to INR" | the per-country drill-down expects local currency. only the global view converts. (already in the round 1 revisited notes — confirmed by use.) |
| "Add payment is greyed out" → button gated by `countries.length > 0` | i'd added inline `+ New` creation inside the payment dialog precisely to handle the empty case, then *also* gated the entry button. the gate fought against the inline path. she shouldn't have to leave the action she started. |
| "delete this only, all future, or all instances?" | apple-calendar-style scoped delete on recurring rows. she expects calendar-app semantics here because that's the closest thing she's used. |
| "when i mark paid, then unpaid, then paid — a duplicate next-month payment shows up" | the auto-create-next-instance logic on `togglePaid` wasn't checking for an existing live row in the same series. dedup by `(name, item_id, recurrence, due_date)`. |
| "let me delete from trash now — not wait 30 days" | restore-or-purge is the model she expects. trash without a "delete now" feels like a coward's compromise. added per-row "delete forever" + bulk "empty trash" with tap-again confirm. |
| "the timezone setting — i want to set it manually, not auto-detect" | i'd briefly removed the timezone picker thinking "system tz is fine"; she pushed back. she has tenants/payments in countries she doesn't live in. the manual control matters. reverted. |

### what she said — the big one

| her words | what it actually means |
| --- | --- |
| "each payment needs a **payment portal** (website or app name), **login details** for that, **bank name**, **login details** for the bank, and a **notes** field. not all need to be filled. and how do we keep this info encrypted? portal + bank can show in the whatsapp reminder, but login details should only show on the webpage when i'm logged in." | she's making the round-1 "login hints" much more concrete. she doesn't want hints — she wants **actual stored credentials**. and she's already thinking about the security model: encrypted at rest, visible only when authenticated, and the WhatsApp surface should leak only the non-sensitive parts (portal name, bank name) so a reminder doubles as a "where to go" cue without exposing the password. |

### what this changes

1. **payment schema gains seven fields:**
   - `portal_name` (text, not sensitive)
   - `portal_username` (sensitive, encrypted)
   - `portal_password` (sensitive, encrypted)
   - `bank_name` (text, not sensitive)
   - `bank_username` (sensitive, encrypted)
   - `bank_password` (sensitive, encrypted)
   - `notes` (text, not sensitive — but she said "important info that should surface when making the payment," so this gets prime UI placement on the reminder + portal)
   all fields optional. the UI surfaces them in a collapsed "details" section on each payment.
2. **encryption layer — the question that needs deciding before code:**
   - **Option A — Edge Function proxy + AES-256-GCM** (my recommendation): the four credential fields stored as `bytea` ciphertext. Two edge functions (`creds-set`, `creds-get`) own encryption/decryption using a key in Supabase secrets. The Postgres rows never hold plaintext. The client only sees plaintext over an authenticated HTTPS round-trip when she clicks "Show".
   - **Option B — `pgsodium` server-side column encryption**: transparent encrypt/decrypt at the Postgres layer using a key managed by Supabase Vault. Less round-trip overhead, but couples us to Supabase's encryption tooling and the key still lives inside their platform.
   - **Option C — Client-side encryption with a passphrase she sets**: strongest privacy (Supabase never holds the key), but if she forgets the passphrase the credentials are gone forever. for mom that's a hard no.
   recommendation lands on A. trade-off is two HTTPS calls each time she views credentials, which is fine because she views them rarely (right before paying a bill).
3. **WhatsApp reminder template gains two variables:** `{portal_name}`, `{bank_name}`, and `{notes}`. credentials are never included. the existing template editor in Settings already supports `{...}` variable substitution; just expanding the available list.
4. **PaymentDialog gets a "Details" section** below the existing fields:
   - Portal name + bank name shown as plain text inputs
   - Notes as a textarea
   - Username + password as masked fields with a "Show" toggle. The decrypted plaintext is fetched on-demand via the `creds-get` edge function and never persisted in browser storage.
5. **Reminders log includes the redacted body only.** the `reminders` table that stores sent message bodies must redact the credential variables (none should be in there, but defensive — the template can't be re-rendered with creds later from logs).

### what she didn't ask for, but i'm flagging

- a "passwords audit": which payments are missing credentials? could be a small page later. not v1.
- the credentials are per-payment, not per-portal. if she uses the same icicibank login for ten payments, she'll re-enter the same details ten times. **revisit:** a `portals` lookup table where credentials live once and payments reference them. for v1 the per-payment redundancy is acceptable to keep the data model simple.

### what i learned about how i'm reading her

- **she's making the security model explicit in plain english.** "show on whatsapp" / "don't show on whatsapp" / "only when i'm logged in" — that's a complete access-control spec. she doesn't have the vocabulary, but she has the model. translate, don't re-invent.
- **she rejected "system timezone".** my tendency is to remove options to reduce decisions; her tendency is to keep agency. for things that change rarely but matter when they change, manual control wins. note this for the *next* time i'm tempted to auto-detect something.
- **she pushes back fast on disabled buttons.** the "Add payment is greyed out" feedback came in seconds. she reads disabled buttons as broken, not as "do the prerequisite first." the prerequisite needs to be reachable from where the disabled button is.

### open questions for round 3

- once she's stored real credentials for a few payments, does she trust it enough to put her *bank* credentials in (vs. only portal logins)?
- the credential-on-WhatsApp model assumes she doesn't lose her phone. is there a "panic-wipe" / remote logout she'd want?
- the notes field is going to grow. when does it want richer formatting (lists, links)? not yet — let her use it raw and see.
- the per-portal redundancy: when does she notice she's typed the same login 5 times?

---

## changelog

| round | date | top change |
| --- | --- | --- |
| v1 brief | 2026-05-24 | initial build from one-sentence ask |
| round 1 | 2026-05-27 | properties (not categories), incoming + outgoing, payment metadata, disambiguated whatsapp replies |
| round 1 revisited | 2026-05-31 | country × item matrix (not just properties), per-country local currency, filters as primary surface, backup/recovery as v1 requirement |
| round 2 | 2026-06-01 | naming pass (incoming/outgoing, payments hero), unconditional country→currency sync, dedup of recurring auto-instances, soft delete + trash + scoped recurring delete + auto-purge + delete-forever, whatsapp 3-step reply resolution, inline-create country/item from payment dialog, **per-payment encrypted credentials** (portal + bank + notes) |
