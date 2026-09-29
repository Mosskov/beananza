/**
 * Comments on decisions: `GET /api/comments` lists them all, `POST /api/comments` adds one.
 * Stored in Cloudflare D1 (`migrations/`). Runs only after the password check in index.ts, so
 * only people with the password can read or post. Plain text only; the page renders it with
 * textContent.
 */

export interface Comment {
  id: number;
  decision: string;
  name: string;
  body: string;
  createdAt: string;
}

export interface NewComment {
  decision: string;
  name: string;
  body: string;
}

export interface CommentStore {
  list(): Promise<Comment[]>;
  add(comment: NewComment, createdAt: string): Promise<Comment>;
}

/** The parts of Cloudflare's D1 binding this file uses. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): { first<T>(): Promise<T | null> };
    all<T>(): Promise<{ results: T[] }>;
  };
}

interface Row {
  id: number;
  decision: string;
  name: string;
  body: string;
  created_at: string;
}

const fromRow = (r: Row): Comment => ({ id: r.id, decision: r.decision, name: r.name, body: r.body, createdAt: r.created_at });

export function d1Store(db: D1Like): CommentStore {
  return {
    async list() {
      const { results } = await db.prepare('SELECT id, decision, name, body, created_at FROM comments ORDER BY id').all<Row>();
      return results.map(fromRow);
    },
    async add(c, createdAt) {
      const row = await db
        .prepare('INSERT INTO comments (decision, name, body, created_at) VALUES (?, ?, ?, ?) RETURNING id, decision, name, body, created_at')
        .bind(c.decision, c.name, c.body, createdAt)
        .first<Row>();
      if (!row) throw new Error('insert returned no row');
      return fromRow(row);
    },
  };
}

export const NAME_MAX = 60;
export const BODY_MAX = 2000;

/** Trim, drop control characters (keeping line breaks in the body) and collapse blank runs. */
function clean(text: string, multiline: boolean): string {
  // Matching control characters is the point here.
  const noControl = multiline
    ? // eslint-disable-next-line no-control-regex
      text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : // eslint-disable-next-line no-control-regex
      text.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return (multiline ? noControl.replace(/\n{3,}/g, '\n\n') : noControl.replace(/\s+/g, ' ')).trim();
}

/** A valid new comment, or the message to show the person posting it. */
export function validate(input: unknown): NewComment | string {
  if (typeof input !== 'object' || input === null) return 'Send the comment as JSON.';
  const { decision, name, body } = input as Record<string, unknown>;
  if (typeof decision !== 'string' || !/^D\d{1,3}$/.test(decision)) return 'Pick a decision to comment on.';
  if (typeof name !== 'string' || typeof body !== 'string') return 'Add your name and a comment.';
  const n = clean(name, false);
  const b = clean(body, true);
  if (!n) return 'Add your name, so others know who wrote the comment.';
  if (n.length > NAME_MAX) return `Keep your name to ${NAME_MAX} characters.`;
  if (!b) return 'Write a comment before posting.';
  if (b.length > BODY_MAX) return `Keep the comment to ${BODY_MAX} characters.`;
  return { decision, name: n, body: b };
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

/**
 * Handle /api/comments. A post must be JSON from this site's own pages: a cross-site form
 * cannot send JSON without a CORS preflight, and the Origin check refuses other sites, so a
 * visitor's remembered password cannot be used to post from elsewhere.
 */
export async function handleComments(request: Request, store: CommentStore | null, now: () => Date = () => new Date()): Promise<Response> {
  if (!store) return json(503, { error: 'Comments are not set up on this server.' });
  if (request.method === 'GET') return json(200, { comments: await store.list() });
  if (request.method !== 'POST') return json(405, { error: 'Use GET or POST.' });

  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== new URL(request.url).origin) return json(403, { error: 'Post comments from the preview site itself.' });
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'Send the comment as JSON.' });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'Send the comment as JSON.' });
  }
  const valid = validate(input);
  if (typeof valid === 'string') return json(400, { error: valid });
  return json(201, { comment: await store.add(valid, now().toISOString()) });
}
