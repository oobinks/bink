// `npm run update`: fetches the latest version, rebuilds, and restarts.
// Your data (the data/ folder) is never touched by updates.
import { execSync } from 'node:child_process';
import { runBackup } from '../server/backup.js';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });

console.log('1/4 Backing up first, just in case…');
const b = await runBackup();
if (!b.ok) {
  console.log(`Backup failed (${b.error}). Update cancelled so nothing is at risk.`);
  process.exit(1);
}
console.log('2/4 Downloading the latest version…');
try {
  sh('git pull --ff-only');
} catch {
  // e.g. Terminal isn't signed in to GitHub. Pulling in GitHub Desktop works too.
  console.log('Could not download from Terminal. If you already clicked "Pull origin" in GitHub Desktop, that is fine — carrying on.');
}
console.log('3/4 Installing and building…');
sh('npm install');
sh('npm run build');
console.log('4/4 Restarting…');
try { sh('node scripts/service.mjs restart'); } catch { console.log('Start it again with: npm start'); }
console.log('Updated.');
