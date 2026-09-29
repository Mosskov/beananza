import Phaser from 'phaser';
import type { GameTestApi } from '@beananza/shared';
import { SCENE_NAMES } from './scenes/registry';
import type { TestableScene } from './scenes/TestableScene';

// Names must match READY_FLAG, BOOT_ERROR_KEY and TEST_API_KEY in shared/src/test-api.ts.
declare global {
  interface Window {
    __ready?: boolean;
    __bootError?: string;
    __game?: GameTestApi;
  }
}

function afterRenders(game: Phaser.Game, count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const onRender = () => {
      left -= 1;
      if (left <= 0) {
        game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
        resolve();
      }
    };
    game.events.on(Phaser.Core.Events.POST_RENDER, onRender);
  });
}

/**
 * Expose the running scene to tools/shot and scripted playthroughs. `window.__ready` turns
 * true once the scene has been created and has rendered a frame.
 */
export function installTestHooks(game: Phaser.Game, sceneName: string, scene: TestableScene): void {
  window.__ready = false;
  // The scene's own event emitter only exists once Phaser boots it, so watch the game instead.
  const onRender = () => {
    if (scene.sys?.isActive()) {
      window.__ready = true;
      game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
    }
  };
  game.events.on(Phaser.Core.Events.POST_RENDER, onRender);

  window.__game = {
    sceneName,
    sceneNames: SCENE_NAMES,
    simTime: () => scene.simTime(),
    pause: () => scene.pauseSim(),
    resume: () => scene.resumeSim(),
    advanceTo: async (seconds: number) => {
      const reached = scene.stepTo(seconds);
      // Two frames: one draws the new state, the second makes sure it is on screen.
      await afterRenders(game, 2);
      return reached;
    },
    debugState: () => scene.debugState(),
    actualFps: () => game.loop.actualFps,
  };
}
