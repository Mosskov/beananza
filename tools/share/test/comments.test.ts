import { describe, expect, it } from 'vitest';
import { BODY_MAX, NAME_MAX, d1Store, handleComments, validate, type Comment, type CommentStore, type D1Like } from '../worker/comments';
import worker from '../worker/index';

const SITE = 'https://beananza.example.workers.dev';

function memoryStore(): CommentStore & { rows: Comment[] } {
  const rows: Comment[] = [];
  return {
    rows,
    list: async () => [...rows],
    add: async (c, createdAt) => {
      const comment = { id: rows.length + 1, ...c, createdAt };
      rows.push(comment);
      return comment;
    },
  };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${SITE}/api/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const now = () => new Date('2026-09-29T20:00:00Z');

describe('comment validation', () => {
  it('trims and keeps line breaks in the body, not the name', () => {
    expect(validate({ decision: 'D2', name: '  Ms\n Berg ', body: ' First line\r\n\r\n\r\n\r\nSecond\u0007 ' })).toEqual({
      decision: 'D2',
      name: 'Ms Berg',
      body: 'First line\n\nSecond',
    });
  });

  it('explains what is missing or too long', () => {
    expect(validate(null)).toBe('Send the comment as JSON.');
    expect(validate({ decision: 'X1', name: 'a', body: 'b' })).toBe('Pick a decision to comment on.');
    expect(validate({ decision: 'D2', name: '  ', body: 'b' })).toMatch(/Add your name/);
    expect(validate({ decision: 'D2', name: 'a', body: ' \n ' })).toBe('Write a comment before posting.');
    expect(validate({ decision: 'D2', name: 'a'.repeat(NAME_MAX + 1), body: 'b' })).toMatch(/60 characters/);
    expect(validate({ decision: 'D2', name: 'a', body: 'b'.repeat(BODY_MAX + 1) })).toMatch(/2000 characters/);
    expect(validate({ decision: 'D2', name: 'a', body: 5 })).toBe('Add your name and a comment.');
  });
});

describe('comments API', () => {
  it('adds a comment and lists it', async () => {
    const store = memoryStore();
    const res = await handleComments(post({ decision: 'D9', name: 'Ana', body: 'Mark a landing spot.' }), store, now);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ comment: { id: 1, decision: 'D9', name: 'Ana', body: 'Mark a landing spot.', createdAt: '2026-09-29T20:00:00.000Z' } });
    const list = await handleComments(new Request(`${SITE}/api/comments`), store, now);
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    expect(((await list.json()) as { comments: Comment[] }).comments).toHaveLength(1);
  });

  it('refuses posts from other sites and non-JSON posts', async () => {
    const store = memoryStore();
    const comment = { decision: 'D2', name: 'a', body: 'b' };
    expect((await handleComments(post(comment, { Origin: 'https://evil.example' }), store)).status).toBe(403);
    expect((await handleComments(post(comment, { 'Content-Type': 'text/plain' }), store)).status).toBe(415);
    expect((await handleComments(post('{not json'), store)).status).toBe(400);
    expect((await handleComments(new Request(`${SITE}/api/comments`, { method: 'DELETE' }), store)).status).toBe(405);
    expect(store.rows).toEqual([]);
  });

  it('returns the validation message as the error', async () => {
    const res = await handleComments(post({ decision: 'D2', name: 'a', body: '' }), memoryStore());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Write a comment before posting.' });
  });

  it('says so when no store is configured', async () => {
    expect((await handleComments(new Request(`${SITE}/api/comments`), null)).status).toBe(503);
  });
});

describe('comments behind the password', () => {
  const basic = (password: string) => `Basic ${btoa(`x:${password}`)}`;
  const env = (store: CommentStore) => ({
    SITE_PASSWORD: 'pw',
    COMMENTS: store,
    ASSETS: { fetch: async () => new Response('asset') },
  });

  it('needs the password to read or post', async () => {
    const store = memoryStore();
    expect((await worker.fetch(new Request(`${SITE}/api/comments`), env(store))).status).toBe(401);
    expect((await worker.fetch(post({ decision: 'D2', name: 'a', body: 'b' }), env(store))).status).toBe(401);
    expect(store.rows).toEqual([]);
  });

  it('routes /api/comments to the store and everything else to the files', async () => {
    const store = memoryStore();
    const res = await worker.fetch(post({ decision: 'D2', name: 'a', body: 'b' }, { Authorization: basic('pw') }), env(store));
    expect(res.status).toBe(201);
    const page = await worker.fetch(new Request(`${SITE}/`, { headers: { Authorization: basic('pw') } }), env(store));
    expect(await page.text()).toBe('asset');
  });
});

describe('D1 store', () => {
  it('uses bound parameters and maps rows', async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const row = { id: 3, decision: 'D2', name: 'a', body: 'b', created_at: 't' };
    const db: D1Like = {
      prepare: (sql) => ({
        bind: (...values) => {
          calls.push({ sql, values });
          return { first: async <T,>() => row as T };
        },
        all: async <T,>() => {
          calls.push({ sql, values: [] });
          return { results: [row] as T[] };
        },
      }),
    };
    const store = d1Store(db);
    expect(await store.add({ decision: 'D2', name: 'a', body: "b'); DROP TABLE comments;--" }, 't')).toEqual({ id: 3, decision: 'D2', name: 'a', body: 'b', createdAt: 't' });
    expect(calls[0]!.values).toEqual(['D2', 'a', "b'); DROP TABLE comments;--", 't']);
    expect(calls[0]!.sql).not.toContain('DROP');
    expect(await store.list()).toEqual([{ id: 3, decision: 'D2', name: 'a', body: 'b', createdAt: 't' }]);
  });
});
