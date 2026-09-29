import Phaser from 'phaser';
import { URL_PARAM_PAUSED, URL_PARAM_SCENE } from '@beananza/shared';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from './config';
import { DEFAULT_SCENE, SCENE_NAMES, SCENES } from './scenes/registry';
import type { SceneStartData } from './scenes/TestableScene';
import { installTestHooks } from './test-hooks';

const params = new URLSearchParams(window.location.search);
const sceneName = params.get(URL_PARAM_SCENE) ?? DEFAULT_SCENE;
const SceneClass = SCENES[sceneName];

if (!SceneClass) {
  // Logged as an error and flagged so tools/shot fails at once instead of timing out.
  const message = `Unknown scene "${sceneName}". Registered scenes: ${SCENE_NAMES.join(', ')}.`;
  window.__bootError = message;
  console.error(message);
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
  const data: SceneStartData = { paused: params.get(URL_PARAM_PAUSED) === '1' };
  installTestHooks(game, sceneName, scene);
  game.scene.add(sceneName, scene, true, data);
}
