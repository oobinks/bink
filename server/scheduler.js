// Runs background jobs once a minute. Later phases add invoice chasing and
// clip posting reminders here. If the Mac was asleep, jobs catch up on wake.
import { runBackup } from './backup.js';
import { getSetting } from './settings.js';
import { cleanupSessions } from './auth.js';
import { todayUK } from './db.js';

const BACKUP_HOUR = 3; // 3am UK time

function ukHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
}

async function tick() {
  try {
    const last = getSetting('backups').lastBackupAt;
    const lastDay = last ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(last)) : null;
    // Back up once a day: at 3am, or as soon as possible if a day was missed.
    const missedADay = !last || Date.now() - new Date(last).getTime() > 26 * 3600000;
    if (lastDay !== todayUK() && (ukHour() >= BACKUP_HOUR || missedADay)) await runBackup();
    cleanupSessions();
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}

export function startScheduler() {
  setTimeout(tick, 10_000);
  setInterval(tick, 60_000);
}
