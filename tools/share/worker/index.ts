/**
 * The share site's Worker: one shared password (HTTP Basic Auth) in front of the static files.
 * Any username works; only the password is checked. The password is the Worker secret
 * SITE_PASSWORD (`pnpm share:password`), never in the repo. Without it, every request is
 * refused, so a missing secret can never leave the site open.
 * Behind the password, /api/comments serves comments on decisions (comments.ts).
 */
import { d1Store, handleComments, type CommentStore, type D1Like } from './comments';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SITE_PASSWORD?: string;
  /** Cloudflare D1 with the comments table (wrangler.jsonc). */
  DB?: D1Like;
  /** Tests pass an in-memory store instead of DB. */
  COMMENTS?: CommentStore;
}

const REALM = 'Beananza preview';

/** Headers on every response the Worker makes itself. */
const OWN_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Type': 'text/plain; charset=utf-8' };

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Compare via fixed-length digests without an early exit, so timing does not leak the password. */
export async function samePassword(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** The password from an `Authorization: Basic …` header, or null. */
export function basicPassword(header: string | null): string | null {
  const m = header && /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header);
  if (!m) return null;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  return colon < 0 ? null : decoded.slice(colon + 1);
}

function askForPassword(): Response {
  return new Response('This preview needs a password. Ask the person who shared the link.\n', {
    status: 401,
    headers: { ...OWN_HEADERS, 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SITE_PASSWORD) {
      return new Response('This preview is not open yet: no password has been set.\n', { status: 503, headers: OWN_HEADERS });
    }
    const given = basicPassword(request.headers.get('Authorization'));
    if (given === null || !(await samePassword(given, env.SITE_PASSWORD))) return askForPassword();
    if (new URL(request.url).pathname === '/api/comments') {
      return handleComments(request, env.COMMENTS ?? (env.DB ? d1Store(env.DB) : null));
    }
    return env.ASSETS.fetch(request);
  },
};
