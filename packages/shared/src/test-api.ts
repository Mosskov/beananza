/**
 * Contract between the client and tools/shot (and any future scripted playthrough).
 * The client installs these on `window`; the tool reads them through Playwright.
 */

/** `window.__ready` becomes true after the requested scene has rendered its first frame. */
export const READY_FLAG = '__ready';
/** `window.__game` holds a {@link GameTestApi}. */
export const TEST_API_KEY = '__game';

/** URL parameters the client understands. */
export const URL_PARAM_SCENE = 'scene';
/** `?paused=1` starts the scene's sim paused at t = 0 so a tool can step it exactly. */
export const URL_PARAM_PAUSED = 'paused';

export interface GameTestApi {
  /** Name of the running scene (the `?scene=` value it was registered under). */
  readonly sceneName: string;
  /** Every registered scene name. */
  readonly sceneNames: readonly string[];
  /** Sim time in seconds, or null for scenes without a sim. */
  simTime(): number | null;
  pause(): void;
  resume(): void;
  /**
   * Pause, step the sim in fixed steps up to `seconds` (rounded down to a whole step), and
   * resolve with the reached sim time once that state has been rendered.
   */
  advanceTo(seconds: number): Promise<number>;
  /** Scene-specific state as plain JSON, for logs and assertions. */
  debugState(): unknown;
  /** Phaser's own measured frame rate. */
  actualFps(): number;
}
