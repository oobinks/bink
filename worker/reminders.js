// Daily payment reminders (runs each morning). For each unpaid invoice, works out
// whether a reminder is due today. With Gmail connected it emails the client;
// otherwise it sends you a phone notification so you can chase in one tap.
import { todayUK, now, logActivity, all } from './db.js';
import { getSetting } from './settings.js';
import { reminderDue, templateVars, fill, pounds } from './invoice-logic.js';
import { emailReady, sendMail } from './mail.js';
import { notify } from './push.js';

export async function runReminders(env, origin) {
  const db = env.DB;
  const emails = await getSetting(db, 'emails');
  if (!emails.chaseOn) return { sent: 0 };
  const today = todayUK();
  const business = await getSetting(db, 'business');
  const invoices = await all(db.prepare(`SELECT i.*, b.event_type FROM invoices i LEFT JOIN bookings b ON b.id = i.booking_id
    WHERE i.status = 'sent' AND i.chasing_paused = 0 AND i.is_sample = 0`));
  let sent = 0;
  for (const inv of invoices) {
    const done = new Set((await all(db.prepare('SELECT step FROM invoice_reminders WHERE invoice_id = ?').bind(inv.id))).map((r) => r.step));
    const due = reminderDue(inv, emails.steps, today, done);
    if (!due) continue;
    const mark = (step, method) => db.prepare(`INSERT OR IGNORE INTO invoice_reminders (invoice_id, step, method, at) VALUES (?, ?, ?, ?)`)
      .bind(inv.id, step, method, now());
    const writes = due.skip.map((i) => mark(i, 'skipped'));
    if (due.send !== null) {
      const step = emails.steps[due.send];
      const link = `${origin}/i/${inv.token}`;
      let method = 'notified';
      if (emailReady(env) && origin && inv.client_email && inv.token) {
        const vars = templateVars(inv, { djName: business.djName, link, eventLabel: inv.event_type && `your ${inv.event_type.toLowerCase()}` });
        try {
          await sendMail(env, { to: inv.client_email, toName: inv.client_name, subject: fill(step.subject, vars), text: fill(step.body, vars) });
          method = 'email';
          sent++;
          await logActivity(db, `Reminder emailed for ${inv.number}`, `${inv.client_name}: ${fill(step.subject, vars)}`);
        } catch (err) {
          await logActivity(db, `Reminder for ${inv.number} could not be emailed`, err.message);
        }
      }
      if (method === 'notified') {
        const when = step.days < 0 ? `due in ${-step.days} days` : step.days === 0 ? 'due today' : `${step.days} days overdue`;
        await notify(env, { title: `💷 Chase ${inv.client_name}`, body: `${inv.number} (${pounds(inv.total_pence)}) is ${when}. Tap to send a reminder.`, url: `/invoices/${inv.id}` });
      }
      writes.push(mark(due.send, method));
    }
    if (writes.length) await db.batch(writes);
  }
  return { sent };
}
