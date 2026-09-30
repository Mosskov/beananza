import Phaser from 'phaser';
import {
  COLOUR_IDS,
  URL_PARAM_CLASS,
  URL_PARAM_FROM,
  URL_PARAM_LAYOUT,
  URL_PARAM_LOOK,
  URL_PARAM_NAME,
  URL_PARAM_PAUSED,
  URL_PARAM_REGION,
  URL_PARAM_SCENE,
  isPresetName,
  lookToString,
  parseLook,
} from '@beananza/shared';
import { HUB_LAYOUT_NAMES, REGION_IDS } from '@beananza/sim';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from './config';
import { loadPropArt } from './art/props';
import { loadBeanArt } from './rig/bean-art';
import { HubConnection, hubServerUrl, setHubConnection } from './net/connection';
import { showJoinOverlay, type JoinChoice } from './net/join-overlay';
import { HubOnlineScene } from './scenes/HubOnlineScene';
import { DEFAULT_SCENE, SCENE_NAMES, SCENES, coloursFor } from './scenes/registry';
import type { SceneStartData, TestableScene } from './scenes/TestableScene';
import { installTestHooks } from './test-hooks';

const params = new URLSearchParams(window.location.search);
const sceneName = params.get(URL_PARAM_SCENE) ?? DEFAULT_SCENE;
const SceneClass = SCENES[sceneName];
// The player's look (D25): drawing only. Unknown ids are reported, and the rest still apply.
const { look, unknown: unknownLook } = parseLook(params.get(URL_PARAM_LOOK));
if (unknownLook.length) console.warn(`Unknown look ids in ?look=: ${unknownLook.join(', ')}.`);
// A hub layout (the plaza or a test yard). Unknown names stop the boot: a typo must not quietly
// show the plaza instead.
const layout = params.get(URL_PARAM_LAYOUT) ?? undefined;
// A region for the region scene (D2); a typo stops the boot like a layout's. `?from=` only picks
// where the hub starts the bean, so an unknown one just starts at the layout's start.
const region = params.get(URL_PARAM_REGION) ?? undefined;
const from = params.get(URL_PARAM_FROM) ?? undefined;
// `?class=<code>` plays the hub online, in that class's room on the server (M2).
const classCode = params.get(URL_PARAM_CLASS);
const online = sceneName === 'hub' && classCode !== null;

/** Logged as an error and flagged so tools/shot fails at once instead of timing out. */
function bootError(message: string): void {
  window.__bootError = message;
  console.error(message);
}

// The bean's and props' parts are checked against the art contract and rasterized before any
// scene starts, in the bean colours the scene needs (online: all of them, for the other players).
const artError = await Promise.all([loadBeanArt(online ? [...COLOUR_IDS] : coloursFor(sceneName, look)), loadPropArt()]).then(
  () => null,
  (err: unknown) => (err instanceof Error ? err.message : String(err)),
);

/**
 * Join the class's hub: straight away with `?name=` (a preset name), else through the join form.
 * Keeps the class code and the name in the URL, so a trip through a portal comes back to it.
 */
async function joinOnline(): Promise<boolean> {
  let connection: HubConnection | null = null;
  const attempt = async (choice: JoinChoice): Promise<string | null> => {
    try {
      connection = await HubConnection.join(hubServerUrl(), {
        classCode: choice.classCode,
        name: choice.name,
        look: lookToString(look),
        ...(from !== undefined ? { from } : {}),
      });
      return null;
    } catch (err) {
      console.warn('Could not join the hub:', err);
      return "Could not join. Check the class code, or try again in a moment.";
    }
  };
  const named = params.get(URL_PARAM_NAME);
  let choice: JoinChoice | null = null;
  if (classCode && isPresetName(named) && (await attempt({ classCode, name: named })) === null) choice = { classCode, name: named };
  choice ??= await showJoinOverlay(classCode ?? '', attempt);
  if (!connection) return false;
  setHubConnection(connection);
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM_CLASS, choice.classCode);
  url.searchParams.set(URL_PARAM_NAME, choice.name);
  url.searchParams.delete(URL_PARAM_FROM);
  window.history.replaceState(null, '', url);
  return true;
}

function startGame(key: string, scene: TestableScene, data: SceneStartData): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: PALETTE.cream,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    // No sound yet; this also keeps the browser autoplay warning out of the console.
    audio: { noAudio: true },
  });
  installTestHooks(game, key, scene);
  game.scene.add(key, scene, true, data);
}

if (!SceneClass) {
  bootError(`Unknown scene "${sceneName}". Registered scenes: ${SCENE_NAMES.join(', ')}.`);
} else if (layout !== undefined && !HUB_LAYOUT_NAMES.includes(layout)) {
  bootError(`Unknown layout "${layout}". Layouts: ${HUB_LAYOUT_NAMES.join(', ')}.`);
} else if (region !== undefined && !(REGION_IDS as readonly string[]).includes(region)) {
  bootError(`Unknown region "${region}". Regions: ${REGION_IDS.join(', ')}.`);
} else if (artError) {
  bootError(`Could not load the art: ${artError}`);
} else if (online) {
  if (await joinOnline()) startGame('hub-online', new HubOnlineScene(), { look });
} else {
  startGame(sceneName, new SceneClass(), { paused: params.get(URL_PARAM_PAUSED) === '1', look, layout, from, region });
}
