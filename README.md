# ctrinn DJ HQ

Your personal DJ admin app: bookings, quotes, invoices, content and press pack, all in one place.
It's hosted free on Cloudflare, works on any device, and only you can log in.

**Status:** Phase 1 (foundations and dashboard) is done. Bookings, invoices, press pack and the content hub come next.

---

## How it works (plain English)

- **The app lives on Cloudflare**, a large web company with a generous free plan. Nothing runs on your laptop.
- **Your data** is stored in a Cloudflare database. Cloudflare can rewind it to any minute in the last 7 days, and
  the app also saves a full backup every night (it keeps the last 30).
- **Only you can get in.** The app has its own password, which you choose and store in your Cloudflare account.
  After 5 wrong guesses, logins are blocked for 15 minutes.
- **Updates are automatic.** Whenever a new version is saved to GitHub, Cloudflare rebuilds and updates the app within
  a couple of minutes. Your data is never touched by updates.
- **Cost: £0.** No card is needed for anything in Phase 1.

---

## One-time setup (about 10 minutes, all in your web browser)

Cloudflare sometimes renames buttons. If something is worded slightly differently, look for the closest match.

### 1. Create a free Cloudflare account
Go to <https://dash.cloudflare.com/sign-up>, sign up, and confirm your email address.

### 2. Put the app online
1. In the Cloudflare dashboard, open **Workers & Pages** (in the left menu, sometimes under **Compute**).
2. Click **Create** (or **Create application**), then **Import a repository**.
3. Click **Connect GitHub**, sign in to GitHub and allow Cloudflare access to the **oobinks/bink** repository.
4. Choose **oobinks/bink**. On the settings screen:
   - **Project name:** `ctrinn-hq` (it must be exactly this)
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy` (usually filled in already)
   - Leave everything else as it is.
5. Click **Deploy**. It takes 1 to 2 minutes. Cloudflare creates the database and backup storage automatically.
6. When it finishes, it shows your app's address, something like `https://ctrinn-hq.yourname.workers.dev`.
   If you open it now, it will say **"Almost there"**. That's expected: it stays locked until you choose a password.

### 3. Choose your password
1. Still in **Workers & Pages**, click **ctrinn-hq**, then **Settings**, then **Variables and Secrets**.
2. Click **Add**. Set **Type** to **Secret**, **Variable name** to `APP_PASSWORD`, and **Value** to your password.
   Use at least 10 characters. A few random words works well, for example `disco-mirror-sunset-42`.
3. Click **Deploy** (or **Save**).

### 4. Open it on your phone and add it to your home screen
1. On your phone, open your app's address and log in. You'll stay logged in for 6 months.
2. Add it to your home screen:
   - **iPhone:** in **Safari**, tap **Share**, then **Add to Home Screen**.
   - **Android:** in **Chrome**, tap **⋮**, then **Install app** (or **Add to Home screen**).
3. On your laptop, bookmark it. In Chrome you can also click the install icon in the address bar.

### 5. Fill in your details
- **More → Settings → Bank details**: enter your details. They only appear on invoices.
- When you've finished exploring: **Settings → Backups & export → Remove sample data**. This only removes the pretend records.

---

## Everyday questions

**How do I change my password?**
Cloudflare dashboard → Workers & Pages → ctrinn-hq → Settings → Variables and Secrets → `APP_PASSWORD` → Edit.

**I've lost my phone.**
In the app on another device: **Settings → Security → Log out every device**. Then change your password as above.

**How do I get a copy of all my data?**
**Settings → Backups & export → Download export** gives you a zip containing spreadsheets of everything and a
complete data file. The last 30 nightly backups can be downloaded from the same screen.

**How do I restore an older version of my data?**
Ask me, and I'll walk you through it. Cloudflare can rewind the database to any minute in the last 7 days
(their "Time Travel" feature), and the nightly backups go back 30 days.

**How do I see what's changed?**
**More → Change history** lists every change with the date and time.

**Can I use a nicer web address?**
Yes, if you buy a domain (about £10 a year), for example `hq.ctrinn.co.uk`. That's optional; ask and I'll set it up.

**Optional extra lock (Cloudflare Access).**
If you'd like a second lock as well as your password (Cloudflare emails you a one-time code), it can be turned
on later. Cloudflare may ask for a card to activate it, even though it's free for one person, so it's off by default.

---

## For developers

- **Server:** Cloudflare Worker (Hono) in `worker/`, with D1 (SQLite) for data and KV for nightly backups. Tables are created and
  migrated automatically on first request. Migrations are an append-only list in `worker/db.js`.
- **Screens:** React + Vite PWA in `web/`, built to `dist/` and served as Workers static assets.
- **Login:** `APP_PASSWORD` secret plus a session cookie (hashed token in D1), with per-IP lockout. Optionally,
  Cloudflare Access JWT verification as well, via `ACCESS_TEAM_DOMAIN`, `OWNER_EMAILS` and optionally `ACCESS_AUD`.
- **Scheduled job:** cron at `0 2 * * *` UTC (the nightly backup; invoice chasing and clip reminders come later).
- **Free-plan CPU limit (10ms per request):** heavy work such as zips and PDFs is done in the browser, not the Worker.
- **Data conventions:** money is stored in pence. Dates are `YYYY-MM-DD`, worked out in Europe/London time.
- **Commands:**
  - `npm run dev` runs it locally at <http://localhost:8787>. Copy `.dev.vars.example` to `.dev.vars` to skip login locally.
  - `npm run dev:screens` gives live-reloading screens on top of that.
  - `npm test` runs the end-to-end tests on Cloudflare's local simulator, plus the login-security tests.
  - `npm run deploy` deploys by hand. It's normally not needed, because pushing to GitHub deploys automatically.
