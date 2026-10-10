// "Improve the app": a chat with Claude about changes to DJ HQ.
// Each idea is a GitHub issue labelled "app-idea" on the app's repository.
// Your messages are posted as comments; GitHub Actions runs Claude to reply,
// build, publish or undo (see .github/workflows/app-ideas.yml).
//
// Needs a Cloudflare secret GITHUB_TOKEN: a fine-grained GitHub token for this
// repository only, with "Issues: read and write" and "Pull requests: read".
import { Hono } from 'hono';
import { logActivity } from '../db.js';

const app = new Hono();
const MARKER = '<!-- ctrinn-claude -->';
const LABEL = 'app-idea';
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const STATUSES = ['building', 'ready', 'live', 'failed', 'undone'];
const COMMANDS = { '/build': 'build', '/ship': 'ship', '/undo': 'undo' };

class GitHubError extends Error {}

function gh(env) {
  const repo = env.GITHUB_REPO || 'oobinks/bink';
  return async (path, { method = 'GET', body } = {}) => {
    const base = env.GITHUB_API || 'https://api.github.com'; // overridable for tests only
    const res = await fetch(`${base}/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ctrinn-dj-hq',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new GitHubError('The GitHub connection is not working. Check the GITHUB_TOKEN secret in Cloudflare.');
      }
      throw new GitHubError(`GitHub said: ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  };
}

app.use('*', async (c, next) => {
  if (!c.env.GITHUB_TOKEN) return c.json({ error: 'not-connected' }, 503);
  await next();
});

app.onError((err, c) => {
  if (err instanceof GitHubError) return c.json({ error: err.message }, 502);
  throw err;
});

const statusOf = (issue) => STATUSES.find((s) => issue.labels.some((l) => l.name === s)) || 'chatting';

function toMessage(comment) {
  const body = comment.body.trim();
  if (body.includes(MARKER)) return { from: 'claude', text: body.replace(MARKER, '').trim(), at: comment.created_at };
  if (!TRUSTED.has(comment.author_association)) return null; // ignore anyone else
  if (COMMANDS[body]) return { from: 'you', action: COMMANDS[body], at: comment.created_at };
  return { from: 'you', text: body, at: comment.created_at };
}

app.get('/', async (c) => {
  const issues = await gh(c.env)(`/issues?labels=${LABEL}&state=all&sort=updated&per_page=50`);
  return c.json(issues.filter((i) => !i.pull_request).map((i) => ({
    number: i.number, title: i.title, status: statusOf(i), updatedAt: i.updated_at, comments: i.comments,
  })));
});

app.post('/', async (c) => {
  const { text } = await c.req.json().catch(() => ({}));
  const body = String(text || '').trim();
  if (!body) return c.json({ error: 'Write your idea first' }, 400);
  const api = gh(c.env);
  await api('/labels', { method: 'POST', body: { name: LABEL, color: 'f4c25b' } }).catch(() => {}); // already exists
  const title = body.split('\n')[0].slice(0, 70) + (body.length > 70 ? '…' : '');
  const issue = await api('/issues', { method: 'POST', body: { title, body, labels: [LABEL] } });
  await logActivity(c.env.DB, 'New app idea', title);
  return c.json({ number: issue.number });
});

app.get('/:n{[0-9]+}', async (c) => {
  const api = gh(c.env);
  const n = c.req.param('n');
  const [issue, comments] = await Promise.all([api(`/issues/${n}`), api(`/issues/${n}/comments?per_page=100`)]);
  if (!issue.labels.some((l) => l.name === LABEL)) return c.json({ error: 'Not found' }, 404);

  const messages = [{ from: 'you', text: issue.body || '', at: issue.created_at }, ...comments.map(toMessage).filter(Boolean)];
  const status = statusOf(issue);
  const last = messages[messages.length - 1];
  // Claude replies to every message and button tap, so if yours is the latest, a reply is on its way.
  const waiting = status === 'building' || last.from === 'you';

  // The preview link is posted on the change's pull request by Cloudflare.
  let previewUrl = null;
  if (status === 'ready') {
    const owner = (c.env.GITHUB_REPO || 'oobinks/bink').split('/')[0];
    const prs = await api(`/pulls?head=${owner}:idea-${n}&state=open`);
    if (prs[0]) {
      const prComments = await api(`/issues/${prs[0].number}/comments?per_page=100`);
      for (const pc of prComments.reverse()) {
        const m = pc.body.match(/https:\/\/[a-z0-9.-]+\.workers\.dev[^\s)"'<]*/i);
        if (m) { previewUrl = m[0]; break; }
      }
    }
  }
  return c.json({ number: issue.number, title: issue.title, status, waiting, previewUrl, messages });
});

app.post('/:n{[0-9]+}/messages', async (c) => {
  const { text } = await c.req.json().catch(() => ({}));
  const body = String(text || '').trim();
  if (!body) return c.json({ error: 'Write a message first' }, 400);
  if (COMMANDS[body]) return c.json({ error: 'Use the buttons for that' }, 400);
  await gh(c.env)(`/issues/${c.req.param('n')}/comments`, { method: 'POST', body: { body } });
  return c.json({ ok: true });
});

app.post('/:n{[0-9]+}/action', async (c) => {
  const { action } = await c.req.json().catch(() => ({}));
  const command = Object.keys(COMMANDS).find((k) => COMMANDS[k] === action);
  if (!command) return c.json({ error: 'Unknown action' }, 400);
  const n = c.req.param('n');
  await gh(c.env)(`/issues/${n}/comments`, { method: 'POST', body: { body: command } });
  const labels = { build: 'Build requested', ship: 'Made live', undo: 'Undo requested' };
  await logActivity(c.env.DB, `App idea #${n}: ${labels[action]}`);
  return c.json({ ok: true });
});

export default app;
