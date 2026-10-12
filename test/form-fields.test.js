// The editable booking form: layouts are checked, and answers are split and validated correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FIELDS, cleanFields, readSubmission, describe } from '../worker/form-fields.js';

const base = {
  client_name: 'Zara Ahmed', event_type: 'Engagement', event_date: '2026-12-12', start_time: '19:00', end_time: '23:30',
  venue_name: 'The Barn', venue_address: 'Harlow', equipment: 'no', guests: '60', contact_method: 'email',
  client_phone: '07700 900333', client_email: 'zara@example.com',
};
const custom = (q) => ({ id: 'q_abc12345', label: 'Genres?', type: 'checkboxes', options: ['Disco', 'House'], required: true, ...q });

test('the default form matches the original Google Form', () => {
  const ids = cleanFields(DEFAULT_FIELDS).map((f) => f.id);
  assert.deepEqual(ids.slice(0, 3), ['client_name', 'event_type', 'event_date']);
  assert.equal(describe(DEFAULT_FIELDS).find((f) => f.id === 'equipment').options.length, 3);
});

test("name, email and date can't be removed; everything else can", () => {
  for (const id of ['client_name', 'client_email', 'event_date']) {
    assert.throws(() => cleanFields(DEFAULT_FIELDS.filter((f) => f.id !== id)), /can't be removed/);
  }
  assert.equal(cleanFields(DEFAULT_FIELDS.filter((f) => f.id !== 'guests')).length, DEFAULT_FIELDS.length - 1);
  // Essential questions stay required even if switched off.
  assert.equal(cleanFields(DEFAULT_FIELDS.map((f) => ({ ...f, required: false })))[0].required, true);
});

test('your own questions need wording, a type and (for choices) options', () => {
  assert.throws(() => cleanFields([...DEFAULT_FIELDS, custom({ label: '' })]), /wording/);
  assert.throws(() => cleanFields([...DEFAULT_FIELDS, custom({ type: 'nonsense' })]), /type/);
  assert.throws(() => cleanFields([...DEFAULT_FIELDS, custom({ options: [' ', ''] })]), /option/);
  assert.throws(() => cleanFields([...DEFAULT_FIELDS, custom({ id: 'drop table' })]), /invalid ID/);
  assert.throws(() => cleanFields([...DEFAULT_FIELDS, custom(), custom()]), /same ID/);
  const ok = cleanFields([...DEFAULT_FIELDS, custom({ options: ['Disco', 'Disco', ' House '] })]);
  assert.deepEqual(ok.at(-1).options, ['Disco', 'House'], 'duplicates and spaces tidied');
});

test('core questions keep their type whatever is sent', () => {
  const tampered = DEFAULT_FIELDS.map((f) => (f.id === 'event_date' ? { ...f, type: 'short' } : f));
  assert.equal(describe(cleanFields(tampered)).find((f) => f.id === 'event_date').type, 'date');
});

test('a submission is split into booking details and extra answers', () => {
  const fields = cleanFields([...DEFAULT_FIELDS, custom()]);
  const { booking, answers } = readSubmission(fields, { ...base, q_abc12345: ['House'] });
  assert.equal(booking.client_name, 'Zara Ahmed');
  assert.deepEqual(answers, [{ id: 'q_abc12345', question: 'Genres?', answer: ['House'] }]);
});

test('required questions and invalid answers are rejected', () => {
  const fields = cleanFields([...DEFAULT_FIELDS, custom()]);
  assert.throws(() => readSubmission(fields, base), /required/);
  assert.throws(() => readSubmission(fields, { ...base, q_abc12345: ['Rock'] }), /Check your answer/);
  assert.throws(() => readSubmission(fields, { ...base, client_phone: '' }), /required/);
});

test('Instagram is only needed when they choose Instagram', () => {
  const fields = cleanFields(DEFAULT_FIELDS);
  assert.doesNotThrow(() => readSubmission(fields, base));
  assert.throws(() => readSubmission(fields, { ...base, contact_method: 'instagram' }), /required/);
  assert.doesNotThrow(() => readSubmission(fields, { ...base, contact_method: 'instagram', instagram: '@zara' }));
});

test('removed questions are simply not asked', () => {
  const fields = cleanFields(DEFAULT_FIELDS.filter((f) => !['guests', 'client_phone'].includes(f.id)));
  const { guests, client_phone, ...rest } = base;
  assert.doesNotThrow(() => readSubmission(fields, rest));
});

test('every answer type is checked', () => {
  const types = {
    q_number01: ['number', '12', '12'], q_money001: ['money', '£1,250', '£1250.00'], q_date0001: ['date', '2026-01-02', '2026-01-02'],
    q_time0001: ['time', '09:30', '09:30'], q_email001: ['email', 'a@b.co', 'a@b.co'], q_long0001: ['long', 'Hi', 'Hi'],
  };
  const fields = cleanFields([...DEFAULT_FIELDS, ...Object.entries(types).map(([id, [type]]) => ({ id, label: id, type, required: false }))]);
  const { answers } = readSubmission(fields, { ...base, ...Object.fromEntries(Object.entries(types).map(([id, [, v]]) => [id, v])) });
  assert.deepEqual(answers.map((a) => a.answer), Object.values(types).map(([, , out]) => out));
  assert.throws(() => readSubmission(fields, { ...base, q_number01: 'lots' }), /number/);
  assert.throws(() => readSubmission(fields, { ...base, q_email001: 'nope' }), /email/);
});
