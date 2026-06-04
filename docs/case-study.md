# Tally: when your mom is your most critical customer

When I started working with developers, I was sure no one could be a more demanding customer. Brilliant, exacting, allergic to waiting — they know precisely what they want, down to the edge case, and they want it before the sentence is finished. No pleasantries. No patience for your time. The whole relationship collapses into one line: "We need this feature, yesterday."

What nobody warned me about is that there's a needier customer than a developer.

A mom.

I thought she needed a reminder. She needed a system — something to run her entire payment operation: every due date, every portal, every login, across several countries. The brief was a notification. The product turned out to be infrastructure for her financial life. Four rounds of feedback, three near-rewrites, and one trust contract later, this is the story of how I got from one to the other.

---

## The brief

My mom manages payments around twenty real estate properties, a company, and the usual stack of household bills across several countries. Her current system is a few notebooks, a random notes app on her phone with passwords in her own encryption style (e.g. some numbers written in Swedish in case a hacker finds this note) and several payment portals. The bills that get missed don't get missed because she doesn't know what to do about them. They get missed because she didn't see them coming and doesn't have the needed information at the right time. 

One Sunday afternoon, while pouring tea, she said:

> *"I need something that reminds me on WhatsApp when bills are due."*

That's it. That's the whole spec.

If a developer customer says "we need this," the next sentence is a deadline. When my mom said this, she pivoted into asking if I'd eaten lunch.

My first thought was that this was a weekend project. Recurrence, WhatsApp, a list of due dates. Maybe a dashboard if I was feeling fancy. Ship it Friday. Be a good daughter. Easy.

It turned out to not be as I had planned. Almost everything I learned about product over the next two weeks, I learned because I was wrong about that opening sentence. Let me show you how.

---

## What I built first, and why it was wrong

Four days later, I had v1. It was a clean, perfectly competent bills app. Categories: utilities, insurance, taxes, real estate. Recurrence rules: one-off, monthly, quarterly, yearly. A dashboard with stat cards — due this week, paid this month, monthly outflow, overdue. WhatsApp reminders firing at T-3, T-1, T-0, T+1. Reply PAID to mark done. Reply SNOOZE 7 to push by a week.

I was proud of it. It looked like a thing.

Then she opened it. The first thing she said was:

> *"Hmmm, but I want to see monthly details for each country as well. Categories? What are categories? Make that countries and under each country there are items because it isn't necessarily a property... Sonu, make these changes, na?"*

I had to replay that sentence three times. I replayed it a fourth time after I determined what she meant by "items."

What I had built: a one-dimensional taxonomy. *Utilities. Insurance. Real estate.* The way every SaaS bills app organizes itself.

What she actually thinks in: a two-dimensional matrix. Every payment lives at the intersection of a **country** (which decides the currency) and an **item** (a property she owns, or a company she handles the bills for). She doesn't have categories. She has a grid. The categories I had built her were a SaaS-shaped abstraction that had nothing to do with how she actually operates.

Once I saw it, the implications were ugly. Per-country views had to stay in *local* currency — USD totals in USD, INR totals in INR — because the moment I converted her US assets to INR, I was hiding the truth she was trying to see. Filters by country and item had to be a primary surface, not metadata buried as tags. The whole schema had to be rebuilt.

I spent the next day migrating it. It also meant wiping her in-progress data — a clean break I could afford because she had only added a few rows. If she'd had her full dataset in there, this would have been a much bigger mess.

The lesson I keep coming back to: I had built someone else's mental model and slapped her name on it. The categories abstraction wasn't wrong because of a UX flaw or a missing feature. It was wrong because it was *somebody else's product*, ported into her file. The job of round one was to find that out.

That was the surface ask. Here is what was underneath it.

---

## The bigger thing she actually needed

A few days later, in the middle of a list of small things, she said this — casually:

> *"Oh and Sonu - I always forget which portal I need to use for each payment and the logins for that portal. So: each payment needs a payment portal — website or app name. Login details for that. Bank name. Login details for the bank. And maybe a notes field for important info that should surface when I'm making the payment."*

If I'm being honest, my first instinct was to add a `portal_name` text field, a `bank_name` text field, and a `notes` textarea, and move on. That is the entire feature request, technically. It would have taken me forty minutes. I almost did it.

Catching myself in that specific micro-moment is probably the single most important product decision I made on this project.

Here's what was actually going on. My mom manages twenty properties. That means roughly twenty portal logins, twenty bank relationships, twenty sets of fiddly little details she has to dig up every single time a payment is due. *The reminders only solve half her problem.* The other half — the bigger half — is that when the reminder fires, she still has to figure out where to go, how to log in, what her username is on this particular portal, which bank account this one debits from.

The brief she gave me was *"remind me on WhatsApp when bills are due."* The deeper problem, the one she had not articulated because she did not think of it as part of the same product, was *"managing twenty logins is harder than remembering twenty due dates."*

The real product isn't reminders. The real product is **reducing the gap between "I remembered the payment was due" and "the payment has been made."** Reminders shrink the gap by one step. Credentials shrink it by another. Notes catch the irregular pieces that don't fit anywhere else. Each one is a separate halving of friction. None of them is the whole story.

And then — this is the part I love — she gave me the security model. In plain English. Without using a single technical word.

> *"Portal and bank can show in the WhatsApp reminder, but login details should only show on the webpage when I'm logged in - who knows who is reading what in WhatsApp?"*

Read that sentence again. That is a complete access-control specification. Surface non-sensitive context (portal name, bank name, notes) in the reminder. Surface sensitive content (usernames, passwords) only inside an authenticated session. She didn't know the words but she had the model.

A developer would have asked for a `credentials` field with `is_sensitive: true`. My mom asked for what she actually wanted, in the words she actually uses. It took me a full draft of misunderstanding her to hear it. The needy customer is the one who isn't translating for me. *Doing the translation is the job.*

---

## How do we keep this encrypted?

"How do we keep this data hidden?" was her literal next question. Not "is it encrypted." Not "is it safe." *How.* She wanted to know the mechanism.

I'll show you how I thought about it, because this is the kind of decision where the answer matters less than knowing what was on the table.

There were three real options.

**Option A: server-side encryption via an edge function.** Store ciphertext in Postgres. A small server-side function holds the AES-256 key, kept in Supabase's secrets store. Reading or writing a credential goes through that function. Postgres itself never sees the plaintext.

**Option B: column-level encryption with Postgres-managed keys.** Use the database's own encryption tooling, with the key held in a managed vault. Slightly less code; more lock-in. Postgres sees plaintext briefly inside the encrypt/decrypt functions.

**Option C: end-to-end encryption from the client.** Mom sets a passphrase. The key is derived from her passphrase, lives only in her browser, never touches my servers. The strongest privacy story by a mile.

The question I had to actually answer was not "which one is most secure." It was three different questions hiding inside one.

Encrypted *against what?* A database leak? A platform-wide compromise of Supabase? A phished session? Different options defend against different threats.

At what *UX cost?* Does mom have to remember a passphrase? Re-enter it on every device? I cannot make her life harder - happy mom, happy life. 

With what *failure mode?* If something goes wrong — she forgets her password, the platform changes, I rotate the key badly — what does she lose?

Option C wins on privacy. It loses badly on the third question. If my mom forgets her passphrase, every credential she ever stored is permanently undecryptable. There is no recovery. None. It's the strongest design and it's the worst design *for her*, because her actual failure mode is "forgot the second password I made up six months ago and used twice." If I shipped C, I would be building a product that eventually deletes her data and tells her it's her fault.

Option B is fine. It's also coupled to one platform's tooling, and the key still lives inside the same vendor as the database. If Supabase gets compromised, B doesn't save me.

Option A is the right level of paranoia for a household of one. The database-leak case is covered — ciphertext is ciphertext, useless without the key. The passphrase-failure case doesn't exist because there is no passphrase. The trade-off I am accepting *out loud* is that Supabase still holds the key, so if their platform is compromised end to end, my mom's credentials are decryptable. That is an honest line, and it is the right line for now. If I ever widen this past her household, the right next step is C with a recovery-key mechanism that lets her dump the encrypted vault and re-enter the passphrase on a new device. Future problem. Logged.

The whole point of writing this section like this — not as a tutorial, not as "here's how I encrypted things" — is to show you that the answer to "is it secure" is never a yes or a no. It is *which compromise are you choosing, and is it the right one for this specific person.* The only way to know what is right for this specific person is to know this specific person.

That is the difference between security as a feature and security as a product decision. Security as a feature would encourage only the safest, most secure, most private route; security as a product decision considers the usability and safety of the approach. 

---

## The loop, not the app

If you take one thing from this post, it should be this: the artifact I'm proudest of isn't Tally. It is the loop.

The loop is: mom says something. I write down what she said *and separately* what I think it means. I ship the change. She uses it. She says something.

It is that simple. The trick — the entire trick — is the second column. Writing my interpretation next to her literal words is what catches every single time I'm jumping to a solution she didn't ask for. The first time I did this, I caught myself five times in one transcript. *She said X. I think it means Y. ...wait, does it actually?*

By round three I had stopped trying to finish her sentences in my head. That was the change.

Three things the loop has taught me about how to read my mom:

**She answers in the order things matter to her, but ranking is not importance.** In round two, the very last thing she said, almost as an afterthought, was: *"Backup data — recover data mechanism — once my mom is reliant on it, it cannot go."* It came last. It is the most load-bearing sentence she has spoken in any round. I keep having to remind myself that order of mention is not order of weight.

**She uses one word to mean several things.** "Categories" meant "the way I group payments" in one conversation, and "the country × item matrix" in the next, four hours apart. Same word, two referents. I now ask "group by what, sliced by what" instead of repeating her vocabulary back at her.

**She pushes back on disabled buttons within seconds.** "Add payment is greyed out" was one of her fastest pieces of feedback. She reads a disabled button as *broken*, not as "do the prerequisite first." Now every disabled action in Tally has an inline path to the unblock. The country dropdown grew a `+ New` button. The item dropdown got one too. The point isn't the buttons. The point is she shouldn't have to leave the screen she's on to get unstuck, especially being not as digitally savvy as we assume every user might be. 

The app is what falls out of the loop running cleanly. Every time I'm tempted to add a feature, the question I make myself answer is: which round of feedback is this answering? If I can't name the round, it shouldn't ship.

---

## About AI

Yes, I used AI to write most of the code in this project. Yes, it sped me up. No, it is not what made the product good.

Two specific moments where AI tried to make my decision for me — and I had to push back. These are exactly the moments that separate "I used AI to build something" from "I shipped something good."

**Moment one: the encryption question.** When I asked the AI how to store credentials securely, its first instinct was to pick Option A and start writing code. I had to stop it and say: lay out three options. Show me the trade-offs. Force me to choose. Because that decision — Supabase still holds the key, am I okay with that — is *my* decision, not its. The AI is happy to absolve me of choosing. The job is not to let it.

**Moment two: "Add payment is greyed out."** Earlier in the build, the AI shipped a feature where the prerequisite — you must add a country before adding a payment — had its own gate. The Add payment button stayed greyed until a country existed. The user literally could not get to the unblock action from the screen she was stuck on. The AI did not notice. I noticed, because my mom told me. The AI doesn't know that my mom reads a disabled button as broken. Only watching my mom does.

There's a thesis making the rounds that storytelling is the skill worth $200k — the thing that separates a great PM from a merely competent one. I think it's half right. Storytelling is just the most visible surface of a deeper skill: *narrative judgment about what matters.* The same judgment that picks which decision to defend in a PRD picks which beat to land in the case study you're reading. The same judgment that notices "wait, the disabled button is the bug, not the feature" notices when a customer is describing a symptom and not a disease.

What the AI does very well: schema migrations, edge function scaffolding, the boring 80%. What the AI cannot do, and possibly will never do, is sit next to my mom and notice that she just frowned for half a second when she clicked something. The work hasn't gotten cheaper. It has gotten faster. Those are not the same thing.

And on the developer-customer-versus-mom-customer thesis: the AI is the perfect developer customer. It says yes. It moves fast. It ships. My mom is the one who keeps me honest.

---

## What I haven't built yet

I want to be honest about the gaps in v1, because pretending they don't exist would defeat the point.

**Per-portal credential reuse.** Credentials are per-payment right now. My mom is going to have the same ICICI login across ten different payment rows and re-type it ten times. The model wants a `portals` lookup with credentials stored once. Noticed. Deferred. I'll build it when she hits the pain.

**Nightly off-platform backup.** She said this was the most important thing she said all day, and it is the layer I have most under-built. Right now I have Supabase's managed backups and that's it. The plan is a nightly JSON export to her own Gmail, so that if Supabase ever evaporates, her data still exists somewhere she controls. It is not done. I am saying it out loud because the alternative is pretending it is.

**A co-admin role.** If my mom loses access to her account, she loses access to everything in Tally. There should be a second login (me) with full recovery rights. There isn't yet.

A v1 that ships with an honest v2 list is more trustworthy than a v1 that pretends everything is covered.

---

## One paragraph that holds all of this

A household payment reminder app is too small a frame for what I built. The real product is a **trust contract** with my mom that says: if you put your life into this, you won't lose it. Reminders are one half of the contract. Credentials are the other half. Notes are the connective tissue. Backup is the load-bearing column I am still in the process of pouring. Every architecture decision has to answer to *that* test — would you trust this with the thing you cannot afford to re-create? That isn't a software question. That is a product question. And the only person whose answer mattered to me, throughout all of this, was my mom.

---

## What's next

I'm not widening past mom until the loop has run a few more times with her using the real product on real data. When she trusts it, we'll talk about whether the next user is her sister, her friend, or a stranger.

If you want to see the messy version — the round-by-round log of what she said, what I thought it meant, where I was wrong — it lives in the [user research doc](./user-research.md) in the Github repo. I keep it updated. The case study you're reading is the polished version of that log.

And the thing I'd do differently next time — already running this loop on myself — is to ask the trust question *first*, not last. Backup came up last. It should have come up first. I'll know for next time.

— Sonia
