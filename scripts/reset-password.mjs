// If you forget your password: run `npm run reset-password` in Terminal.
import readline from 'node:readline/promises';
import { setPassword } from '../server/auth.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pw = await rl.question('New password (at least 8 characters): ');
rl.close();
if (pw.length < 8) {
  console.log('Too short — nothing changed.');
  process.exit(1);
}
setPassword(pw);
console.log('Password changed. Log in again on your phone and laptop.');
