// pnpm shot:multi: the multiplayer hub end to end (M2). Starts the hub server and the game's dev
// server, then:
//   1. three browsers join one class: each sees the other two beans, with name tags;
//   2. one walks east and one taps to walk: afterwards every page agrees where every bean is;
//   3. the third runs into the Waves portal, travels to the region scene and comes back: the
//      others see it vanish and then reappear in front of that portal.
// Screenshots and logs go to artifacts/shots/multi/. With --bots <n> it then runs a load check:
// n headless players (the Colyseus SDK in Node) walk at random for --seconds (default 60), and it
// reports the server's step time and the snapshot size per player.
//   pnpm shot:multi [--bots 30] [--seconds 60] [--headed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from 'playwright';
import { Client, type Room } from '@colyseus/sdk';
import { HUB_ROOM, MSG_COMMAND, MSG_SNAPSHOT, PRESET_NAMES, READY_FLAG, TEST_API_KEY } from '@beananza/shared';
import { ISLAND, portalExit, type HubSnapshot } from '@beananza/sim';
import { hubRoomStats, startHubServer } from '@beananza/server';
import { REPO, openSession, type Session } from './session';

const OUT = join(REPO, 'artifacts/shots/multi');
const CLASS = 'MULTI1';
const PLAYERS = [
  { name: 'Brave Otter', look: 'blue,bow' },
  { name: 'Calm Owl', look: 'green,spots,sprout' },
  { name: 'Jolly Puffin', look: 'yellow,glasses' },
] as const;
/** Pages agree on a bean's position within this (m): they draw ~100 ms behind, and it has stopped. */
const AGREE_M = 0.02;

interface OnlineDebug {
  online: true;
  you: string;
  beans: { id: string; x: number; y: number; act: string }[];
  tags: { id: string; text: string }[];
  roster: { id: string; name: string }[];
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.listen(0, () => {
      const a = probe.address();
      probe.close(() => (typeof a === 'object' && a ? resolve(a.port) : reject(new Error('no port'))));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const debug = (page: Page) => page.evaluate(`window[${JSON.stringify(TEST_API_KEY)}].debugState()`) as Promise<OnlineDebug>;

async function waitReady(page: Page, scene: string): Promise<void> {
  await page.waitForFunction(`window[${JSON.stringify(READY_FLAG)}] === true && window[${JSON.stringify(TEST_API_KEY)}]?.sceneName === ${JSON.stringify(scene)}`, undefined, { timeout: 30000 });
}

/** Wait until `check` passes on the page's debug state (polling), or fail with `what`. */
async function until(page: Page, what: string, check: (d: OnlineDebug) => boolean, timeoutMs = 10000): Promise<OnlineDebug> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const d = await debug(page);
    if (check(d)) return d;
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await sleep(100);
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(await debug(page).catch(() => null), null, 2));
}

async function endToEnd(session: Session): Promise<string[]> {
  const lines: string[] = [];
  const pages: Page[] = [];
  for (const p of PLAYERS) {
    const context = await session.browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => lines.push(`FAIL page error (${p.name}): ${e.message}`));
    const url = new URL(session.baseUrl);
    url.searchParams.set('class', CLASS);
    url.searchParams.set('name', p.name);
    url.searchParams.set('look', p.look);
    await page.goto(url.toString());
    await waitReady(page, 'hub-online');
    pages.push(page);
  }
  const [a, b, c] = pages as [Page, Page, Page];

  // 1. Everyone sees everyone, and the others' name tags (all start on the arrival pad, close by).
  for (const [i, page] of pages.entries()) {
    const d = await until(page, `${PLAYERS[i]!.name} sees 3 beans and 2 name tags`, (s) => s.beans.length === 3 && s.tags.length === 2);
    lines.push(`ok   ${PLAYERS[i]!.name}: sees ${d.beans.length} beans, tags ${d.tags.map((t) => t.text).join(', ')}`);
    await shot(page, `1-together-${i + 1}`);
  }
  const ids = await Promise.all(pages.map(async (p) => (await debug(p)).you));

  // 2. A walks east for 1.5 s; B taps a spot to its south-west. Then every page agrees.
  await a.keyboard.down('ArrowRight');
  await b.mouse.click(420, 560);
  await sleep(1500);
  await a.keyboard.up('ArrowRight');
  await sleep(2500);
  const views = await Promise.all(pages.map(debug));
  let worst = 0;
  for (const id of ids) {
    const xs = views.map((v) => v.beans.find((q) => q.id === id));
    for (const q of xs) {
      if (!q) throw new Error(`a page does not see bean ${id}`);
      worst = Math.max(worst, Math.hypot(q.x - xs[0]!.x, q.y - xs[0]!.y));
    }
  }
  const walked = views[0]!.beans.find((q) => q.id === ids[0])!;
  const tapped = views[0]!.beans.find((q) => q.id === ids[1])!;
  lines.push(`${worst <= AGREE_M ? 'ok  ' : 'FAIL'} all pages agree on every bean within ${worst.toFixed(4)} m (limit ${AGREE_M})`);
  lines.push(`${walked.x - ISLAND.start.x > 2.5 ? 'ok  ' : 'FAIL'} ${PLAYERS[0].name} walked east ${(walked.x - ISLAND.start.x).toFixed(2)} m`);
  lines.push(`${Math.hypot(tapped.x - ISLAND.start.x, tapped.y - ISLAND.start.y) > 1 ? 'ok  ' : 'FAIL'} ${PLAYERS[1].name} walked to the tap (${tapped.x.toFixed(2)}, ${tapped.y.toFixed(2)})`);
  for (const [i, page] of pages.entries()) await shot(page, `2-moved-${i + 1}`);

  // 3. C runs north until the Waves portal is on screen, taps it (walks in), reaches the region,
  // and comes back.
  const wavesOnScreen = async () =>
    ((await debug(c)) as unknown as { view: { props: { id: string; screen: { x: number; y: number } }[] } }).view.props.find((p) => p.id === 'portal-waves');
  await c.keyboard.down('Shift');
  await c.keyboard.down('ArrowUp');
  const runUntil = Date.now() + 5000;
  while (Date.now() < runUntil && ((await wavesOnScreen())?.screen.y ?? -1) < 200) await sleep(50);
  await c.keyboard.up('ArrowUp');
  await c.keyboard.up('Shift');
  await sleep(400);
  const portal = await wavesOnScreen();
  if (!portal || portal.screen.y < 100) throw new Error(`page 3 never had the Waves portal on screen (${JSON.stringify(portal?.screen)})`);
  // The swirl is 0.86 m above the portal's ground point.
  await c.mouse.click(portal.screen.x, portal.screen.y - 86);
  try {
    await c.waitForURL(/scene=region/, { timeout: 15000 });
  } catch (err) {
    const d = await debug(c);
    await shot(c, '3-stuck');
    throw new Error(`${(err as Error).message.split('\n')[0]}; portal drawn at ${JSON.stringify(portal.screen)}, beans ${JSON.stringify(d.beans)}`, { cause: err });
  }
  await waitReady(c, 'region');
  await shot(c, '3-in-the-region');
  const gone = await until(a, `${PLAYERS[2].name} has left the hub`, (s) => s.beans.length === 2);
  lines.push(`ok   ${PLAYERS[2].name} went through the Waves portal; the others now see ${gone.beans.length} beans`);
  await shot(a, '3-while-away');
  await c.keyboard.press('KeyE');
  await c.waitForURL(/scene=hub/, { timeout: 15000 });
  await waitReady(c, 'hub-online');
  const exit = portalExit(ISLAND.portals.find((p) => p.region === 'waves')!);
  const back = await until(a, `${PLAYERS[2].name} is back in front of the Waves portal`, (s) =>
    s.beans.some((q) => s.roster.find((r) => r.id === q.id)?.name === PLAYERS[2].name && Math.hypot(q.x - exit.x, q.y - exit.y) < 0.05),
  );
  lines.push(`ok   ${PLAYERS[2].name} came back in front of the Waves portal; the others see ${back.beans.length} beans`);
  await shot(c, '3-back-3');
  await shot(a, '3-back-1');
  for (const p of pages) await p.context().close();
  return lines;
}

async function loadCheck(url: string, bots: number, seconds: number): Promise<string[]> {
  const rooms: Room[] = [];
  let bytes = 0;
  let snaps = 0;
  for (let i = 0; i < bots; i++) {
    const room = await new Client(url).joinOrCreate(HUB_ROOM, { classCode: 'LOAD01', name: PRESET_NAMES[i % PRESET_NAMES.length], look: 'teal' });
    // Only the first bot counts what arrives: every player gets the same snapshots.
    if (i === 0) {
      room.onMessage(MSG_SNAPSHOT, (s: HubSnapshot) => {
        bytes += JSON.stringify(s).length;
        snaps += 1;
      });
    } else room.onMessage(MSG_SNAPSHOT, () => undefined);
    rooms.push(room);
  }
  const s = hubRoomStats.get('LOAD01');
  if (!s) throw new Error('no stats for the load room');
  Object.assign(s, { ticks: 0, steps: 0, tickMsTotal: 0, tickMsMax: 0 });
  bytes = 0;
  snaps = 0;
  const started = Date.now();
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (Date.now() - started < seconds * 1000) {
    for (const room of rooms) {
      if (random() < 0.25) room.send(MSG_COMMAND, { type: 'move', x: Math.round(random() * 2 - 1), y: Math.round(random() * 2 - 1), run: random() < 0.3 });
      else if (random() < 0.05) room.send(MSG_COMMAND, { type: 'jump' });
    }
    await sleep(500);
  }
  const elapsed = (Date.now() - started) / 1000;
  for (const r of rooms) await r.leave().catch(() => undefined);
  const perTick = s.tickMsTotal / Math.max(1, s.ticks);
  return [
    `load: ${bots} players for ${elapsed.toFixed(0)} s in one class`,
    `  server: ${s.steps} sim steps (${(s.steps / elapsed).toFixed(1)} per s), ${perTick.toFixed(3)} ms per tick on average, ${s.tickMsMax.toFixed(2)} ms worst (budget 16.7 ms)`,
    `  snapshots: ${(snaps / elapsed).toFixed(1)} per s to each player, ${(bytes / Math.max(1, snaps) / 1024).toFixed(1)} KB each as JSON (msgpack on the wire is smaller), about ${((bytes / elapsed) / 1024).toFixed(0)} KB/s per player`,
  ];
}

const { values } = parseArgs({
  options: {
    bots: { type: 'string', default: '0' },
    seconds: { type: 'string', default: '60' },
    headed: { type: 'boolean', default: false },
  },
});
mkdirSync(OUT, { recursive: true });
const port = await freePort();
const hub = await startHubServer(port);
const hubUrl = `http://localhost:${port}`;
// The game's dev server hands this to the client (import.meta.env.VITE_HUB_URL).
process.env.VITE_HUB_URL = hubUrl;
const session = await openSession({ headed: values.headed });
let failed = false;
try {
  console.log(`multi: game ${session.baseUrl}, hub server ${hubUrl}`);
  for (const line of await endToEnd(session)) {
    console.log(line);
    if (line.startsWith('FAIL')) failed = true;
  }
  const bots = Number(values.bots);
  if (bots > 0) for (const line of await loadCheck(hubUrl, bots, Number(values.seconds))) console.log(line);
  console.log(`multi: shots and logs in ${OUT}`);
} catch (err) {
  failed = true;
  console.error(`FAIL ${(err as Error).message}`);
} finally {
  await session.close();
  await hub.gracefullyShutdown(false);
}
process.exit(failed ? 1 : 0);
