// Turns an idea's GitHub issue into a readable conversation for Claude.
// Usage: gh issue view N --json title,body,comments | node .github/scripts/thread.mjs
import fs from 'node:fs';

const issue = JSON.parse(fs.readFileSync(0, 'utf8'));
const MARKER = '<!-- ctrinn-claude -->';
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const lines = [`IDEA: ${issue.title}`, '', `ctrinn: ${issue.body}`];
for (const c of issue.comments) {
  const body = c.body.trim();
  if (body.includes(MARKER)) lines.push('', `Claude: ${body.replace(MARKER, '').trim()}`);
  else if (TRUSTED.has(c.authorAssociation)) {
    if (body === '/build') lines.push('', '[ctrinn tapped "Build it"]');
    else if (body === '/ship') lines.push('', '[ctrinn tapped "Make it live"]');
    else if (body === '/undo') lines.push('', '[ctrinn tapped "Undo"]');
    else lines.push('', `ctrinn: ${body}`);
  }
}
process.stdout.write(lines.join('\n'));
