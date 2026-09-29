import { describe, expect, it } from 'vitest';
import worker, { basicPassword, samePassword, type Env } from '../worker/index';

const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

function env(password?: string): Env & { served: string[] } {
  const served: string[] = [];
  return {
    served,
    SITE_PASSWORD: password,
    ASSETS: {
      fetch: async (request) => {
        served.push(new URL(request.url).pathname);
        return new Response('asset');
      },
    },
  };
}

const get = (path: string, authorization?: string) =>
  new Request(`https://beananza.example.workers.dev${path}`, authorization ? { headers: { Authorization: authorization } } : {});

describe('share site password', () => {
  it('asks for a password when none is given, and serves nothing', async () => {
    const e = env('bean pass');
    const res = await worker.fetch(get('/'), e);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="Beananza preview", charset="UTF-8"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(e.served).toEqual([]);
  });

  it('refuses a wrong password', async () => {
    const e = env('bean pass');
    expect((await worker.fetch(get('/', basic('x', 'bean pas')), e)).status).toBe(401);
    expect((await worker.fetch(get('/', basic('x', 'bean pass ')), e)).status).toBe(401);
    expect(e.served).toEqual([]);
  });

  it('serves the files with the right password and any username, including the game', async () => {
    const e = env('bean pass');
    expect((await worker.fetch(get('/', basic('', 'bean pass')), e)).status).toBe(200);
    expect((await worker.fetch(get('/play/?scene=hub', basic('teacher', 'bean pass')), e)).status).toBe(200);
    expect(e.served).toEqual(['/', '/play/']);
  });

  it('accepts a password containing a colon and non-ASCII letters', async () => {
    const e = env('ø:æ');
    const utf8 = `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode('u:ø:æ')))}`;
    expect((await worker.fetch(get('/', utf8), e)).status).toBe(200);
  });

  it('fails closed when no password has been set', async () => {
    for (const password of [undefined, '']) {
      const e = env(password);
      const res = await worker.fetch(get('/', basic('x', '')), e);
      expect(res.status).toBe(503);
      expect(e.served).toEqual([]);
    }
  });

  it('ignores malformed headers', () => {
    expect(basicPassword(null)).toBeNull();
    expect(basicPassword('Bearer abc')).toBeNull();
    expect(basicPassword('Basic !!!')).toBeNull();
    expect(basicPassword(`Basic ${btoa('no colon')}`)).toBeNull();
    expect(basicPassword(basic('a', 'b:c'))).toBe('b:c');
  });

  it('compares passwords exactly', async () => {
    expect(await samePassword('abc', 'abc')).toBe(true);
    expect(await samePassword('abc', 'abd')).toBe(false);
    expect(await samePassword('', 'abc')).toBe(false);
  });
});
