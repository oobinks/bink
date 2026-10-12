// Invoice rules: overdue/viewed states, UK tax years, email wording, reminder timing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceState, taxYear, fill, templateVars, reminderDue, formatNumber } from '../worker/invoice-logic.js';

test('invoice states', () => {
  const base = { status: 'sent', due_date: '2026-10-20', viewed_at: null };
  assert.equal(invoiceState(base, '2026-10-20'), 'sent');
  assert.equal(invoiceState({ ...base, viewed_at: 'x' }, '2026-10-20'), 'viewed');
  assert.equal(invoiceState(base, '2026-10-21'), 'overdue');
  assert.equal(invoiceState({ ...base, status: 'paid' }, '2026-12-01'), 'paid');
  assert.equal(invoiceState({ ...base, status: 'draft' }, '2026-12-01'), 'draft');
});

test('UK tax year runs 6 April to 5 April', () => {
  assert.equal(taxYear('2026-04-05'), '2025-26');
  assert.equal(taxYear('2026-04-06'), '2026-27');
  assert.equal(taxYear('2027-01-31'), '2026-27');
  assert.equal(taxYear('2099-12-31'), '2099-00');
});

test('invoice numbers', () => {
  assert.equal(formatNumber('CT-', 1), 'CT-001');
  assert.equal(formatNumber('CT-', 1234), 'CT-1234');
});

test('email wording fills in the details and leaves unknown words alone', () => {
  const vars = templateVars({ client_name: 'Jess Carter', number: 'CT-004', total_pence: 45540, due_date: '2026-10-20', issue_date: '2026-10-13' },
    { djName: 'ctrinn', link: 'https://x/i/abc' });
  assert.equal(fill('Hi {first_name}, {number} for {amount} due {due_date}. {link} {oops}', vars),
    'Hi Jess, CT-004 for £455.40 due 20 October 2026. https://x/i/abc {oops}');
});

const steps = [{ days: -2, on: true }, { days: 0, on: true }, { days: 7, on: true }, { days: 14, on: true }];
const inv = { status: 'sent', due_date: '2026-10-20', sent_at: '2026-10-13T10:00:00Z', chasing_paused: 0 };

test('reminders go out on the right days', () => {
  assert.equal(reminderDue(inv, steps, '2026-10-17', new Set()), null);
  assert.deepEqual(reminderDue(inv, steps, '2026-10-18', new Set()), { send: 0, skip: [] });
  assert.deepEqual(reminderDue(inv, steps, '2026-10-20', new Set([0])), { send: 1, skip: [] });
  assert.equal(reminderDue(inv, steps, '2026-10-21', new Set([0, 1])), null, 'nothing between steps');
  assert.deepEqual(reminderDue(inv, steps, '2026-10-27', new Set([0, 1])), { send: 2, skip: [] });
});

test('missed reminders never pile up: only the latest goes, older ones are skipped', () => {
  assert.deepEqual(reminderDue(inv, steps, '2026-11-05', new Set()), { send: 3, skip: [0, 1, 2] });
});

test('no reminders when paid, paused, switched off, or before the invoice was even sent', () => {
  assert.equal(reminderDue({ ...inv, status: 'paid' }, steps, '2026-11-05', new Set()), null);
  assert.equal(reminderDue({ ...inv, chasing_paused: 1 }, steps, '2026-11-05', new Set()), null);
  assert.equal(reminderDue(inv, steps.map((s) => ({ ...s, on: false })), '2026-11-05', new Set()), null);
  assert.deepEqual(reminderDue({ ...inv, sent_at: '2026-10-19T09:00:00Z' }, steps, '2026-10-19', new Set()), { send: null, skip: [0] });
});
