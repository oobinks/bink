// Sends email from your Gmail account, so it comes from you and appears in your Sent folder.
// Needs a Cloudflare secret GMAIL_APP_PASSWORD (a Google "app password", not your normal one).
import { getSetting } from './settings.js';

export const emailReady = (env) => Boolean(env.GMAIL_APP_PASSWORD);

export async function sendMail(env, { to, toName, subject, text, attachments = [] }) {
  if (!emailReady(env)) throw new Error('Email is not connected yet');
  const business = await getSetting(env.DB, 'business');
  const { WorkerMailer } = await import('worker-mailer');
  await WorkerMailer.send(
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      credentials: { username: env.GMAIL_ADDRESS || business.email, password: env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
      authType: 'plain',
    },
    {
      from: { name: business.djName, email: env.GMAIL_ADDRESS || business.email },
      to: toName ? { name: toName, email: to } : to,
      reply: business.email,
      subject,
      text,
      attachments,
    },
  );
}
