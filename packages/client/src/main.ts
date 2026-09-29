import Phaser from 'phaser';
import { URL_PARAM_LAYOUT, URL_PARAM_LOOK, URL_PARAM_PAUSED, URL_PARAM_SCENE, parseLook } from '@beananza/shared';
import { HUB_LAYOUT_NAMES } from '@beananza/sim';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from './config';
import { loadPropArt } from './art/props';
import { loadBeanArt } from './rig/bean-art';
import { DEFAULT_SCENE, SCENE_NAMES, SCENES, coloursFor } from './scenes/registry';
import type { SceneStartData } from './scenes/TestableScene';
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

/** Logged as an error and flagged so tools/shot fails at once instead of timing out. */
function bootError(message: string): void {
  window.__bootError = message;
  console.error(message);
}

// The bean's and props' parts are checked against the art contract and rasterized before any
// scene starts, in the bean colours the scene needs.
const artError = await Promise.all([loadBeanArt(coloursFor(sceneName, look)), loadPropArt()]).then(
  () => null,
  (err: unknown) => (err instanceof Error ? err.message : String(err)),
);

if (!SceneClass) {
  bootError(`Unknown scene "${sceneName}". Registered scenes: ${SCENE_NAMES.join(', ')}.`);
} else if (layout !== undefined && !HUB_LAYOUT_NAMES.includes(layout)) {
  bootError(`Unknown layout "${layout}". Layouts: ${HUB_LAYOUT_NAMES.join(', ')}.`);
} else if (artError) {
  bootError(`Could not load the art: ${artError}`);
} else {
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

  const scene = new SceneClass();
  const data: SceneStartData = { paused: params.get(URL_PARAM_PAUSED) === '1', look, layout };
  installTestHooks(game, sceneName, scene);
  game.scene.add(sceneName, scene, true, data);
}
