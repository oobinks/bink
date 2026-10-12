# DJ HQ — rules for Claude

This is ctrinn's personal DJ admin app. ctrinn is a DJ, not a developer, and is the only user.
Changes often come from the in-app "Improve the app" chat (`.github/workflows/app-ideas.yml`).

## Talking to ctrinn
- Plain English, short, friendly. No code, file names or jargon in replies.
- At most 2 simple questions at a time. Prefer multiple-choice style ("A or B?").
- If an idea is a bad idea or there's a simpler way, say so.

## Hard rules when changing the app
- **Never lose data.** Database changes go only as a new entry at the end of the `migrations` list in
  `worker/db.js`, and must only add (new tables, new columns with defaults). Never drop, rename or rewrite
  existing tables or columns, and never edit an existing migration.
- **Stay on Cloudflare's free plan.** The Worker gets about 10ms of CPU per request: no heavy work on the
  server (PDFs, zips and image processing happen in the browser). No new paid services.
- **Don't touch** `.github/`, `wrangler.jsonc` bindings, login/security code in `worker/auth.js`, or secrets,
  unless ctrinn explicitly asked for exactly that.
- **Keep it simple:** mobile first, every common action in 3 taps or fewer, and match the existing look
  (`web/src/styles.css` tokens: dark background, gold/pink accents).
- Money is stored in pence (whole numbers). Dates are `YYYY-MM-DD`, and "today" means UK time (`todayUK()`).
- Log meaningful edits with `logActivity()` so they show in Change history.
- New sample/demo rows must set `is_sample = 1`.
- `npm test` must pass. Add or update tests in `test/` for new server behaviour.

## Project map
- `worker/`: Cloudflare Worker (Hono). `index.js` routes and nightly job, `db.js` schema and migrations,
  `auth.js` login, `routes/*.js` API endpoints, `backup.js` nightly backups, `sample-data.js` demo data,
  `booking-fields.js` booking validation, `push.js` phone notifications, `invoice-logic.js` invoice rules,
  `reminders.js` morning payment reminders, `mail.js` Gmail sending, `clients.js` find-or-create client profiles
  (bookings and invoices carry a `client_id`; use `linkClient()` when creating them), `form-fields.js` the
  editable booking form (core questions map to booking columns; custom answers go in `bookings.answers`),
  `routes/after-gig.js` the morning-after wrap-up (`wrapped_at`, `gig_notes`, balance paid on the night).
- **Public (no login):** only `routes/public.js` (booking form, quote links with Accept, invoice links, calendar
  feed) and the `/book`, `/q/:token` and `/i/:token` screens. Never expose anything else publicly.
- `web/src/`: React screens (`pages/`), `api.js` fetch helper, `format.js` money and date helpers, `styles.css`.
- `web/src/pdf.js`: branded PDF quotes and invoices, made in the browser.
- `test/`: Node tests. `app.test.js`, `bookings.test.js`, `invoices.test.js`, `clients.test.js`, `after-gig.test.js` and `ideas.test.js` run the real Worker on the local simulator.
