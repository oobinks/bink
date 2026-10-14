// Ask screen: questions in, plain-English answers (and confirm-first action buttons) out.
import { Hono } from 'hono';
import { buildContext, SYSTEM, parseReply, checkActions, runModel } from '../ask.js';

const app = new Hono();

app.post('/', async (c) => {
  const db = c.env.DB;
  const { question, history } = (await c.req.json().catch(() => null)) || {};
  const q = String(question || '').trim().slice(0, 600);
  if (!q) return c.json({ error: 'Type a question first' }, 400);
  // The last few messages, so follow-ups like "re-open it" make sense.
  const past = (Array.isArray(history) ? history : []).slice(-8)
    .filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  const messages = [{ role: 'system', content: `${SYSTEM}\n\n${await buildContext(db)}` }, ...past, { role: 'user', content: q }];
  let raw;
  try {
    raw = await runModel(c.env, messages);
  } catch (err) {
    console.error('Ask failed', err);
    return c.json({ error: "I can't answer right now. If you've asked a lot today, the free allowance resets overnight. Try again later." }, 503);
  }
  const reply = parseReply(raw);
  return c.json({ answer: reply.answer, actions: await checkActions(db, reply.actions) });
});

export default app;
