/**
 * Contract between the client and tools/shot (and any future scripted playthrough).
 * The client installs these on `window`; the tool reads them through Playwright.
 */

/** `window.__ready` becomes true after the requested scene has rendered its first frame. */
export const READY_FLAG = '__ready';
/** `window.__bootError` holds a message if the game could not start the requested scene. */
export const BOOT_ERROR_KEY = '__bootError';
/** `window.__game` holds a {@link GameTestApi}. */
export const TEST_API_KEY = '__game';

/** URL parameters the client understands. */
export const URL_PARAM_SCENE = 'scene';
/** `?paused=1` starts the scene's sim paused at t = 0 so a tool can step it exactly. */
export const URL_PARAM_PAUSED = 'paused';
/** `?layout=<name>` opens the hub on a named layout: the plaza or a test yard. */
export const URL_PARAM_LAYOUT = 'layout';

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
  /**
   * Pause, step the sim forward by `seconds` rounded to the nearest whole number of fixed
   * steps, and resolve with the reached sim time once that state has been rendered.
   */
  advanceBy(seconds: number): Promise<number>;
  /**
   * Resolve after the game has run and rendered two more frames, so input events sent to the
   * page have been handled (and turned into sim commands) without the paused sim moving.
   */
  settle(): Promise<void>;
  /** Scene-specific state as plain JSON, for logs and assertions. */
  debugState(): unknown;
  /** Phaser's own measured frame rate. */
  actualFps(): number;
}
