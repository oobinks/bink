# ctrinn DJ HQ

Your personal DJ admin app: bookings, quotes, invoices, content and press pack, all in one place.
It's hosted free on Cloudflare, works on any device, and only you can log in.

**Status:** done so far:
- Phase 1: dashboard, settings, backups
- Phase 2: booking form, enquiries, quotes, calendar
- Phase 3: invoices, payment reminders, money and tax-year reports
- the "Improve the app" chat
- Phase 4: the after-gig screen
- Phase 5: clips (the content hub)
- Phase 6: the press pack

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

### 5. Turn on notifications and add gigs to your phone calendar
In the app, go to **More → Settings → Phone & calendar**:
- Tap **Turn on notifications**. You'll get a ping for every new enquiry and every accepted quote.
  On iPhone, open the app from your Home Screen first, or the button won't work.
- Tap **Add to iPhone / Mac calendar** (or **Google Calendar**). Confirmed gigs will then appear in your normal calendar.

### 6. Let the app email invoices and reminders from your Gmail (optional, 2 minutes)
Without this, you send invoices from your own email app in one tap, and on reminder days the app pings your phone.
With it, invoices and polite reminders go out by themselves from ctrinn.music@gmail.com and show in your Sent folder.
1. On <https://myaccount.google.com/security>, make sure **2-Step Verification** is on.
2. Go to <https://myaccount.google.com/apppasswords>, type **DJ HQ** as the name, then tap **Create**. Copy the
   16-letter password it shows. This is a separate password just for the app; your normal one stays private.
3. In Cloudflare: **Workers & Pages → ctrinn-hq → Settings → Variables and Secrets → Add**. Set **Type** to **Secret**,
   **name** to `GMAIL_APP_PASSWORD`, and paste the password as the value. Click **Deploy**.
4. To send from a **different Gmail** than the one in your details: do steps 1 and 2 on *that* account, and in
   Cloudflare also add a **Text** variable called `GMAIL_ADDRESS` containing that Gmail address. Replies go to it too.
5. In the app: **Settings → Emails & reminders → Send me a test email**.

### 7. Fill in your details
- **More → Settings → Bank details**: enter your details. They only appear on invoices.
- When you've finished exploring: **Settings → Backups & export → Remove sample data**. This only removes the pretend records.

---

## "Improve the app" setup (about 15 minutes, one time)

This connects the in-app chat (**More → Improve the app**) to Claude. It uses your Claude Pro or Max plan, so
there's no extra cost. You need a computer for step 1 only.

### 1. Get your Claude key (on your Mac)
1. If you haven't already, install Node.js from <https://nodejs.org> (the **LTS** button).
2. Open **Terminal** (press ⌘ + Space, type *Terminal*, press Enter), paste this and press Enter:
   ```
   npx @anthropic-ai/claude-code setup-token
   ```
3. A browser window opens. Log in to Claude and approve it.
4. Terminal shows a long key starting `sk-ant-oat`. Copy it.

### 2. Give the key to GitHub
1. Go to <https://github.com/oobinks/bink/settings/secrets/actions> and click **New repository secret**.
2. **Name:** `CLAUDE_CODE_OAUTH_TOKEN`. **Secret:** paste the key. Click **Add secret**.

### 3. Let GitHub's automation make changes
1. Go to <https://github.com/oobinks/bink/settings/actions>.
2. Under **Workflow permissions**, choose **Read and write permissions**, and tick
   **Allow GitHub Actions to create and approve pull requests**. Click **Save**.

### 4. Let the app talk to GitHub
1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. **Token name:** `DJ HQ`. **Expiration:** 1 year (GitHub will email you before it runs out).
3. **Repository access:** **Only select repositories**, then choose **oobinks/bink**.
4. **Permissions → Repository permissions:** set **Issues** to **Read and write**, and **Pull requests** to **Read-only**.
5. Click **Generate token** and copy it.
6. In Cloudflare: **Workers & Pages → ctrinn-hq → Settings → Variables and Secrets → Add**. Set **Type** to **Secret**,
   **name** to `GITHUB_TOKEN`, and paste the token as the value. Click **Deploy**.

### 5. Turn on previews
In Cloudflare: **Workers & Pages → ctrinn-hq → Settings → Build**. Make sure **non-production branch builds**
are switched on. This is what creates the preview link for each change.

### How it works
- **Chat:** you describe an idea and Claude replies in 1 to 3 minutes. It reads the app's code but changes nothing.
- **Build it:** Claude makes the change on a separate copy and runs the safety checks. You get a **preview link**
  to try it. The preview uses your real data, so be careful what you delete there.
- **Make it live:** the change goes live in about 2 minutes.
- **Undo:** puts things back how they were.
- Claude follows the rules in `CLAUDE.md`. For example, it can add to your data but never delete it.

---

## Everyday questions

**How do invoices work?**
1. On a confirmed or completed booking, tap **Create invoice**. Everything is filled in from the quote, and it's due in 7 days.
2. Tap **Email invoice**, or share the link or PDF. The client gets a page with your bank details (tap to copy) and a PDF.
3. When they pay, tap **Mark as paid**.

You'll see **Viewed** once the client has opened it. Reminders go out each morning (2 days before the due date,
on the due date, then 7 and 14 days overdue). You can change the timing and wording in
**Settings → Emails & reminders**, or pause reminders for any single invoice.

**What happens after a gig?**
The morning after, your phone pings you ("How was Neon Rooms?") and the home screen shows a card. Tap it for one screen:
1. **Get paid:** tap **Balance paid on the night** (this makes the invoice, takes off the deposit and marks it paid
   that night), or **send the invoice** if they still owe you.
2. **Clips:** upload the night's videos and photos.
3. **Notes for next time:** private notes, kept on the booking and the client's profile.

Then tap **Done**.

**How do clips work?**
1. **Upload:** after a gig, tap **Content → Upload** (or **Upload clips** on the after-gig screen), pick the gig, then
   choose as many videos and photos as you like. Keep the screen open while they upload.
2. **Star or bin:** one clip at a time. Binned clips are deleted for good (you get 5 seconds to undo).
3. **Schedule:** **Schedule all, one a day** spreads your starred clips over the coming days at your post time
   (Settings → Clips & captions). Each clip gets a draft caption and hashtags, which you can edit, or tap **Another idea**.
4. **Post:** at each time your phone buzzes. Tap it, tap **Share**, pick TikTok or Instagram, paste the caption
   (it's already copied) and post. Then tap **Posted**.

The app can't post to TikTok for you: TikTok only allows that for apps it has reviewed and approved.
Clips are stored in Cloudflare's storage, free up to 10GB. The **Storage** bar on the Clips screen shows how close you are.
The app stops uploads just before 10GB, so it never costs anything. To go past that, turn off **Stop uploads at the free 10GB**
in Settings → Clips & captions. Each extra GB costs about 1p a month, and the Clips screen shows the monthly cost.
Bin old clips to free up space.

**How does the press pack work?**
Open **More → Press pack**:
1. **Upload photos** (your press shots), or tap **From your clips** to add videos and photos from your gigs.
   Tap the star on any item to show it first. The first photo becomes the big picture at the top; use the arrows to reorder.
2. Fill in your **tagline, bio, venues you've played, links and tech rider**, then tap **Save**. Your name, genres,
   location and email come from **Settings → Your details**. Your phone number only shows if you switch it on.
3. Switch it **On** and tap **Share link**. Promoters get one page (your address + `/epk`) where they can watch the clips,
   tap any photo or clip to open it full screen and swipe through, filter by photos or videos, tap **Select** to pick
   just the ones they want, or **Download all** as a zip. Your Instagram, TikTok and SoundCloud links sit at the top.
   Switch it **Off** and the page shows nothing.

You can also add any clip from its own screen with **Add to press pack**. Binning a clip takes it off the press pack too.

**What do other people see at my web address?**
A simple landing page: your name, tagline and genres, your social links, and buttons for **Private Party Booking Enquiry**,
**Press Pack** (only while it's switched on) and **Contact** (emails you), then your next 3 **upcoming club nights**
(venue, date and set times only; never fees, promoters or private parties). Your phone number is never shown there. The tagline and social links come from
**More → Press pack**; if a press photo is starred, it's the background. You go straight into the app because you stay
logged in. On a new device, tap **DJ login** at the bottom.

**Where are my stats?**
**More → Analytics.** Pick **Last 12 months**, **Tax year** or **All time** to see income (paid invoices and deposits),
gigs played and booked ahead, your average fee, which gig types earn most, your busiest days, how many enquiries turn into
bookings, how far ahead people book, and your best clients. Tap a column for its number, or the table button to see them all.

**How do I add a club set?**
**Bookings → Add** (or **Add booking** on Home), then tap **Club set**. Choose the client who pays you (the promoter
or venue) from your clients, or tap **New client** to add them. Then enter the club, date, fee and set times. It goes straight into **Confirmed**, marked **Club**.
After the gig, tap **Create invoice** (or **Send the invoice** on the after-gig screen). It's due on your normal payment
terms, and the usual payment reminders chase it. The public enquiry form is unchanged and is only for private parties.

**How does Ask work?**
**More → Ask**: type a question like "Why was Jess's quote closed?" or "Who owes me money?". It answers from your own
bookings, invoices and change history using Cloudflare's free AI (a daily allowance; past it, it just stops until the next
day and never charges). If you ask for a change ("re-open it"), you get a button showing exactly what will change. Nothing
happens until you tap it. It can re-open, confirm, decline or complete bookings, mark invoices paid or unpaid, and pause or
restart reminders. It can't change how the app works.

**What are Trends?**
**More → Trends**: plain-English notes on what's changing, worked out from your own data each time you open it.
For example: income, gigs and enquiries against the previous 3 months, your average fee, how many enquiries book,
what earns you most, your busiest night, quiet months coming up, clients who booked this time last year, how quickly
clients pay, and when you've gone quiet on posting clips. A note only appears once there's enough data behind it.

**How do client profiles work?**
Everyone you quote, play for or invoice gets a profile automatically, matched by email or name. Open one from
**Invoices → Clients** (or **More → Clients**) to see their gigs, invoices, what they've paid and what they owe.
Tap **New invoice** on a profile to invoice a repeat client in one tap: their details and the lines from their last
invoice are filled in for you. **Invoices → New** starts by picking the client.

**Where are my totals for tax?**
**Invoices → Money & tax year** shows income by month and by UK tax year (6 April to 5 April), and who owes what.
**Download spreadsheet** gives you every invoice in a CSV file.

**What's my booking form link?**
Your app's address with `/book` on the end, for example `https://ctrinn-hq.yourname.workers.dev/book`. It never
changes. Share it from the home screen (**Share booking form**) or from **Bookings → Form**.

**How do I change the questions on my booking form?**
**Settings → Booking form → Questions.**
- Tap a question to change its wording, hint or whether it's required.
- Use the arrows to reorder questions.
- Tap **Remove** to take one off.
- Tap **Add a question** to add your own, choosing the type of answer: short text, long text, multiple choice,
  tick boxes, dropdown, number, date, time, email, phone or money.

Then tap **Save changes**. Your form link updates straight away.

The standard questions (name, date, venue and so on) fill in the booking. Name, Email and Date can't be removed
because quotes and invoices need them. Answers to your own questions show on the booking under **More answers**.

**How do quotes work?**
1. Open an enquiry, tap a price preset, add any extras, then tap **Send quote**.
2. The client gets a private link where they can see the quote, download it as a PDF and tap **Accept**.
3. Every quote shows a deposit to secure the date (£100 by default; change it in **Settings → Prices** or on any
   quote), plus the balance payable on the night.
4. When the client accepts, they're shown your bank details to pay the deposit, and you get a notification. The booking
   waits as **Deposit due** until you tap **Deposit received**. Then it's **Confirmed** and goes into your calendar.
5. The invoice for the gig takes the deposit off, and the balance is due on the night. Deposits count as income
   on the day you received them.


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
If it's ever turned on, the booking form, quote links and calendar link must be excluded from it, or clients
won't be able to reach them.

---

## For developers

- **Server:** Cloudflare Worker (Hono) in `worker/`, with D1 (SQLite) for data and KV for nightly backups. Tables are created and
  migrated automatically on first request. Migrations are an append-only list in `worker/db.js`.
- **Screens:** React + Vite PWA in `web/`, built to `dist/` and served as Workers static assets.
- **Login:** `APP_PASSWORD` secret plus a session cookie (hashed token in D1), with per-IP lockout. Optionally,
  Cloudflare Access JWT verification as well, via `ACCESS_TEAM_DOMAIN`, `OWNER_EMAILS` and optionally `ACCESS_AUD`.
- **Improve the app:** `worker/routes/ideas.js` talks to GitHub Issues (via the `GITHUB_TOKEN` secret);
  `.github/workflows/app-ideas.yml` runs Claude Code (via the `CLAUDE_CODE_OAUTH_TOKEN` repository secret) to reply,
  build on branch `idea-N`, merge, or revert. Rules for Claude are in `CLAUDE.md`.
- **Scheduled jobs:** `0 2 * * *` UTC runs the backup and marks past gigs completed. `0 9 * * *` UTC sends payment
  reminders (`worker/reminders.js`, with the rules in `worker/invoice-logic.js`).
- **Email:** Gmail SMTP via `worker-mailer` (`worker/mail.js`), enabled by the `GMAIL_APP_PASSWORD` secret.
- **Free-plan CPU limit (10ms per request):** heavy work such as zips and PDFs is done in the browser, not the Worker.
- **Data conventions:** money is stored in pence. Dates are `YYYY-MM-DD`, worked out in Europe/London time.
- **Commands:**
  - `npm run dev` runs it locally at <http://localhost:8787>. Copy `.dev.vars.example` to `.dev.vars` to skip login locally.
  - `npm run dev:screens` gives live-reloading screens on top of that.
  - `npm test` runs the end-to-end tests on Cloudflare's local simulator, plus the login-security tests.
  - `npm run deploy` deploys by hand. It's normally not needed, because pushing to GitHub deploys automatically.
