# ctrinn DJ HQ

Your personal DJ admin app: bookings, quotes, invoices, content and press pack, all in one place.
It runs on your Mac, costs nothing, and only you can get in.

**Status:** Phase 1 (foundations and dashboard) is done. Bookings, invoices, press pack and the content hub come next.

---

## How it works (plain English)

- **The app lives on your Mac.** All your data is in a single file (`data/app.db`) inside the app's folder.
  Nothing is stored online unless you choose to.
- **Your phone reaches it through Tailscale**, a free private connection between your own devices that works
  anywhere, including on 4G/5G at a gig. Nobody else can see the app, not even people on the same Wi-Fi.
- **You install it on your phone's home screen** so it looks and feels like a normal app.
- **Backups** run every night at 3am. Point them at an iCloud Drive or Google Drive folder so there's a copy off the laptop.
- **The Mac must be on, plugged in and awake.** If it's asleep, your phone can't reach the app. Reminders and other
  scheduled jobs catch up as soon as it wakes.

---

## One-time setup on your Mac (about 20 minutes)

### 1. Install Node.js (the engine the app runs on)
1. Go to <https://nodejs.org> and click the big **LTS** download button.
2. Open the downloaded file and click through the installer.

### 2. Download the app
The easiest way is **GitHub Desktop**:
1. Download it from <https://desktop.github.com> and sign in with your GitHub account.
2. Choose **File → Clone repository**, pick `oobinks/bink`, and set the local path to your home folder
   (for example `/Users/yourname/bink`). Click **Clone**.

### 3. Build and start it
1. Open **Terminal** (press ⌘ + Space, type *Terminal*, press Enter).
2. Paste these lines one at a time, pressing Enter after each:
   ```
   cd ~/bink
   npm run setup
   npm run install-service
   ```
   `setup` downloads the parts the app needs and builds it, which takes a minute or two.
   `install-service` starts the app and makes it **start by itself whenever your Mac starts**. It also
   restarts the app if it ever crashes and stops the Mac sleeping while it's plugged in.
3. On the Mac, open <http://localhost:4321> in Safari or Chrome. You'll be asked to **choose your password**.
   That's your login from now on.

### 4. Keep the Mac awake
- **System Settings → Battery → Options →** turn on **"Prevent automatic sleeping on power adapter when the display is off"**.
- Keep it **plugged in** and **leave the lid open**. You can turn the brightness all the way down. Closing the lid
  sends a MacBook to sleep, whatever the settings say.
- If the Mac restarts, for example after a macOS update, it needs to be logged in before the app starts again.

### 5. Connect your phone with Tailscale (free)
1. On the Mac, install Tailscale from <https://tailscale.com/download> and sign up (signing in with Google is easiest).
2. On your phone, install the **Tailscale** app from the App Store / Play Store and log in with the **same account**.
3. In Mac Terminal, run:
   ```
   /Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 4321
   ```
   The first time, it may show a link asking you to **enable HTTPS**. Open the link, click **Enable**, then run the
   command again. It then prints your app's private address, something like `https://ctrinns-macbook.tail1234.ts.net`.
4. On your phone, make sure Tailscale is switched on, open that address, and log in.

### 6. Put it on your home screen
- **iPhone:** in **Safari**, tap the **Share** button, then **Add to Home Screen**.
- **Android:** in **Chrome**, tap **⋮**, then **Install app** (or **Add to Home screen**).

Do the same on your laptop's browser if you like (in Chrome: the install icon in the address bar).

### 7. Set up backups
In the app: **More → Settings → Backups & export**. Tap **iCloud Drive** or **Google Drive** if they're shown
(they appear if they're set up on the Mac), then **Save folder** and **Back up now**.

### 8. Add your bank details and remove the sample data
- **Settings → Bank details**: enter your details. They only appear on invoices.
- When you've finished exploring: **Settings → Backups & export → Remove sample data**. This only removes the pretend records.

---

## Everyday commands (in Terminal, inside the app folder: `cd ~/bink`)

| What | Command |
|---|---|
| Update to the latest version | `npm run update` |
| Restart the app | `npm run restart` |
| Forgot your password | `npm run reset-password` |
| Stop it starting automatically | `npm run uninstall-service` |
| Run it by hand instead (stops when you close Terminal) | `npm start` |

### Updating
When a new phase is ready:
1. In **GitHub Desktop**, click **Fetch origin**, then **Pull origin**.
2. In Terminal: `cd ~/bink` then `npm run update`.

The update backs up your data first, then rebuilds and restarts the app. Your data is never touched by updates.

### Restoring from a backup
1. `npm run uninstall-service` (stops the app).
2. In your backup folder, open `database/` and pick the copy you want (the date is in the file name).
3. Copy it to `~/bink/data/`, replacing `app.db`, and delete `app.db-wal` and `app.db-shm` if they're there.
4. `npm run install-service`.

### Exporting everything
**Settings → Backups & export → Download export** gives you a zip containing every record as spreadsheets (CSV),
one complete data file (JSON), and all your photos and videos.

---

## Troubleshooting
- **Phone says it can't reach the app:** check that the Mac is awake and plugged in, and that Tailscale is switched on in your phone's Tailscale app.
- **Something looks broken:** run `npm run restart`. If it's still broken, the log is in `~/bink/data/app.log`.
- **Locked out after wrong passwords:** wait 15 minutes, or run `npm run reset-password`.

---

## For developers

- Server: Node.js + Express, SQLite (better-sqlite3), in `server/`. Migrations are an append-only list in `server/db.js`.
- Screens: React + Vite PWA, in `web/`, built to `dist/` and served by Express.
- Money is stored in pence. Dates are `YYYY-MM-DD`, worked out in Europe/London time.
- `npm run dev` starts the server with auto-restart, plus live-reloading screens at <http://localhost:5173>.
- `npm test` runs the API tests against a throwaway database.
- `DATA_DIR`, `PORT` and `HOST` environment variables override the defaults (`./data`, `4321`, `127.0.0.1`).
