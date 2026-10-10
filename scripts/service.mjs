// Makes the app start automatically when your Mac starts, restart itself if it
// ever crashes, and stop the Mac falling asleep while it's plugged in.
// Usage: npm run install-service | npm run uninstall-service | npm run restart
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LABEL = 'com.ctrinn.djhq';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLIST = path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOG = path.join(ROOT, 'data', 'app.log');
const action = process.argv[2];

if (process.platform !== 'darwin') {
  console.log('This command is for macOS. Elsewhere, just run: npm start');
  process.exit(1);
}

const uid = os.userInfo().uid;
const run = (cmd) => { try { execSync(cmd, { stdio: 'ignore' }); } catch { /* not loaded yet */ } };

if (action === 'install') {
  if (!fs.existsSync(path.join(ROOT, 'dist'))) {
    console.log('Run `npm run setup` first.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  // caffeinate -s keeps the Mac awake while on mains power, for as long as the app runs.
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-s</string>
    <string>${process.execPath}</string>
    <string>${path.join(ROOT, 'server/index.js')}</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
`;
  run(`launchctl bootout gui/${uid} "${PLIST}"`);
  fs.writeFileSync(PLIST, plist);
  execSync(`launchctl bootstrap gui/${uid} "${PLIST}"`);
  console.log('Done. The app is running and will start by itself whenever you log in to your Mac.');
  console.log('Open http://localhost:4321 to check.');
} else if (action === 'uninstall') {
  run(`launchctl bootout gui/${uid} "${PLIST}"`);
  if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  console.log('Removed. The app will no longer start by itself.');
} else if (action === 'restart') {
  if (!fs.existsSync(PLIST)) {
    console.log('Auto-start is not installed. Run: npm run install-service');
    process.exit(1);
  }
  execSync(`launchctl kickstart -k gui/${uid}/${LABEL}`);
  console.log('Restarted.');
} else {
  console.log('Use: install, uninstall or restart');
}
