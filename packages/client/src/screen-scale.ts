import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';

/**
 * A sharp picture at any screen size. Scenes keep their 1280×720 layout and coordinates (the
 * "layout space"), but the canvas has the screen's real pixels: `k` canvas pixels per layout
 * unit, k = fit scale × devicePixelRatio. Every camera zooms by k and every Text renders at
 * resolution k, so nothing is stretched by the browser. At a 1280×720 window with a device pixel
 * ratio of 1, k is 1 and nothing changes.
 */

/** Cap for weak Chromebooks: a 2560×1440 screen at a ratio of 1 needs 2, a 4K screen 3. */
export const MAX_RENDER_SCALE = 2.5;
/** Small phones need fewer pixels than the layout has; no need to draw the rest. */
export const MIN_RENDER_SCALE = 0.5;

/** k for a parent box of `width` × `height` CSS pixels at `pixelRatio` device pixels per CSS pixel. */
export function renderScaleFor(width: number, height: number, pixelRatio: number): number {
  const fit = Math.min(width / GAME_WIDTH, height / GAME_HEIGHT);
  const k = fit * pixelRatio;
  // A hidden or collapsed parent (0 × 0) or a bad ratio must not produce a 0 or NaN canvas.
  if (!Number.isFinite(k) || k <= 0) return 1;
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, k));
}

/** The canvas size in pixels for k: the layout size times k, whole pixels. */
export function canvasSizeFor(k: number): { width: number; height: number } {
  return { width: Math.round(GAME_WIDTH * k), height: Math.round(GAME_HEIGHT * k) };
}

type Listener = (k: number) => void;

const listeners = new Set<Listener>();
let current = 1;

/** The current canvas pixels per layout unit. */
export function renderScale(): number {
  return current;
}

/** Call `apply` with k now and whenever it changes. Returns the function that stops it. */
export function onRenderScale(apply: Listener): () => void {
  listeners.add(apply);
  apply(current);
  return () => {
    listeners.delete(apply);
  };
}

/** Like `onRenderScale`, but stops when the scene shuts down. */
export function useRenderScale(scene: Phaser.Scene, apply: Listener): void {
  const stop = onRenderScale(apply);
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);
}

/**
 * Aim a camera at `centre` (layout units) so it shows the layout's 1280×720 window, zoomed in by
 * `zoom` on top of that. Sets its size too, so the order in which Phaser resizes cameras and this
 * runs does not matter.
 */
export function frameCamera(camera: Phaser.Cameras.Scene2D.Camera, k: number, centre: { x: number; y: number }, zoom = 1): void {
  const size = canvasSizeFor(k);
  camera.setSize(size.width, size.height).setZoom(zoom * k).centerOn(centre.x, centre.y);
}

/** Frame the main camera on the plain 1280×720 layout, for scenes drawn straight in layout space. */
export function frameMainCamera(scene: Phaser.Scene): void {
  useRenderScale(scene, (k) => frameCamera(scene.cameras.main, k, { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }));
}

/** Make a Text render at the current k (and follow it), so zoomed text stays sharp. */
export function sharpText<T extends Phaser.GameObjects.Text>(text: T): T {
  const stop = onRenderScale((k) => {
    // Phaser re-renders the text's canvas on every call, so skip a no-op.
    if (text.style.resolution !== k) text.setResolution(k);
  });
  text.once('destroy', stop);
  return text;
}

/** The layout-space point at the middle of a camera framed with `frameCamera`. */
export function layoutCentre(camera: Phaser.Cameras.Scene2D.Camera): { x: number; y: number } {
  return { x: camera.midPoint.x, y: camera.midPoint.y };
}

/**
 * Keep the canvas at the screen's real pixels. Call once, right after creating the game with the
 * size from `canvasSizeFor(initial k)`. `parent` is the element the game fits into.
 */
export function installRenderScale(game: Phaser.Game, parent: HTMLElement): void {
  const update = () => {
    const k = renderScaleFor(parent.clientWidth, parent.clientHeight, window.devicePixelRatio || 1);
    const size = canvasSizeFor(k);
    if (size.width === game.scale.width && size.height === game.scale.height) return;
    current = k;
    // FIT then shows this canvas at the same on-screen size, now with k pixels per layout unit.
    game.scale.setGameSize(size.width, size.height);
    for (const apply of [...listeners]) apply(k);
  };
  // 'resize' is Phaser.Scale.Events.RESIZE. It also fires for our own setGameSize; `update`
  // returns at once then, because the size already matches.
  game.scale.on('resize', update);
  update();
}

/** Set k before the game exists, so the first scene is created at the right size. */
export function initialRenderScale(parent: HTMLElement): number {
  current = renderScaleFor(parent.clientWidth, parent.clientHeight, window.devicePixelRatio || 1);
  return current;
}
