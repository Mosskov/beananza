import {
  COLOUR_IDS,
  FACE_IDS,
  HEADWEAR_IDS,
  PATTERN_IDS,
  URL_PARAM_LAYOUT,
  URL_PARAM_PAUSED,
  URL_PARAM_SCENE,
  type BeanLook,
} from '@beananza/shared';
import { HUB_LAYOUT_NAMES } from '@beananza/sim';
import { LAYOUT_SCENES, panelQuery } from './dev-panel-query';
import { CLIP_NAMES, REACTION_CLIP_NAMES } from './rig/clips';
import { ANIM_SPEEDS, DIRECTION_NAMES, isReactionClip, type AnimOptions } from './scenes/anim-params';
import { whenAnimViewer, type AnimViewerControl } from './scenes/AnimViewerScene';
import { DEFAULT_SCENE, SCENE_NAMES } from './scenes/registry';

const OPEN_KEY = 'beananza.devPanel.open';

const STYLE = `
#dev-panel { position: fixed; top: 8px; left: 8px; z-index: 10; font: 13px system-ui, sans-serif; color: #3b3026; }
#dev-panel > button { font: inherit; padding: 4px 10px; border: 1px solid #b9a888; border-radius: 6px; background: #fffaf0; cursor: pointer; }
#dev-panel form { margin-top: 6px; padding: 10px; display: grid; grid-template-columns: auto auto; gap: 6px 10px; align-items: center;
  background: #fffaf0; border: 1px solid #b9a888; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
#dev-panel form[hidden] { display: none; }
#dev-panel select { font: inherit; }
#dev-panel select:disabled { opacity: .5; }
#dev-panel .note { grid-column: 1 / -1; margin: 0; color: #6b5a4c; }
#dev-panel .row { display: flex; gap: 6px; align-items: center; }
#dev-panel .row button { font: inherit; padding: 1px 8px; }
#dev-panel input[type=range] { width: 160px; }
`;

/** What each scene is, one line under the scene picker. */
const SCENE_NOTES: Readonly<Record<string, string>> = {
  hub: 'The plaza, playable.',
  empty: 'An empty scene.',
  drop: 'Two balls dropped (sim check).',
  bean: 'Every view of the bean, still.',
  looks: 'Every colour and cosmetic, still.',
  clip: 'One clip in phases, still.',
  reactions: 'Each reaction in each act, still.',
  anim: 'One clip, live. The part below changes it at once.',
};

/** The anim viewer's reduced-motion choice: follow the system, or force it. */
const MOTION_CHOICES: Readonly<Record<string, boolean | null>> = { system: null, on: true, off: false };

/**
 * A dev-server-only panel that rewrites the URL options (scene, layout, look, paused) and
 * reloads, since the boot reads them once; on `anim` a second part drives the viewer live.
 * Never in a production build, and never in a Playwright run (tools/shot), so screenshots and
 * golden states are unchanged.
 */
export function installDevPanel(params: URLSearchParams, look: BeanLook): void {
  if (!import.meta.env.DEV || navigator.webdriver) return;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const root = document.createElement('div');
  root.id = 'dev-panel';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Options';
  toggle.setAttribute('aria-expanded', 'false');
  const form = document.createElement('form');
  const animForm = document.createElement('form');
  // Stays open across the reloads it causes (per tab; a convenience only).
  const show = (open: boolean) => {
    form.hidden = !open;
    animForm.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  try {
    show(sessionStorage.getItem(OPEN_KEY) === '1');
  } catch {
    show(false);
  }
  toggle.addEventListener('click', () => {
    show(form.hidden !== false);
    try {
      sessionStorage.setItem(OPEN_KEY, form.hidden ? '0' : '1');
    } catch {
      // Storage blocked: the panel just starts closed next time.
    }
  });

  const scene = select(form, 'Scene', SCENE_NAMES, params.get(URL_PARAM_SCENE) ?? DEFAULT_SCENE);
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = SCENE_NOTES[scene.value] ?? '';
  form.append(note);
  const layout = select(form, 'Layout', ['', ...HUB_LAYOUT_NAMES], params.get(URL_PARAM_LAYOUT) ?? '', { '': '(plaza)' });
  const colour = select(form, 'Colour', COLOUR_IDS, look.colour);
  const pattern = select(form, 'Pattern', PATTERN_IDS, look.pattern);
  const headwear = select(form, 'Headwear', HEADWEAR_IDS, look.headwear);
  const face = select(form, 'Face', FACE_IDS, look.face);
  // The anim viewer has its own play and pause, in its part.
  const isAnim = scene.value === 'anim';
  const paused = isAnim ? null : checkbox(form, 'Paused', params.get(URL_PARAM_PAUSED) === '1');
  layout.disabled = !LAYOUT_SCENES.has(scene.value);

  form.addEventListener('change', () => {
    const picked: BeanLook = {
      colour: colour.value as BeanLook['colour'],
      pattern: pattern.value as BeanLook['pattern'],
      headwear: headwear.value as BeanLook['headwear'],
      face: face.value as BeanLook['face'],
    };
    // The address now, not at boot: the anim viewer keeps its state there.
    const current = new URLSearchParams(window.location.search);
    window.location.search = panelQuery(current, { scene: scene.value, layout: layout.value, look: picked, paused: paused?.checked ?? false }, DEFAULT_SCENE);
  });

  root.append(toggle, form);
  if (isAnim) {
    root.append(animForm);
    whenAnimViewer((viewer) => installAnimControls(animForm, viewer));
  }
  document.body.append(root);
}

/** A labelled control; `cell` is what goes in the grid when the control sits in a row with more. */
function field(into: HTMLFormElement, label: string, control: HTMLElement, cell: HTMLElement = control): void {
  const id = `dev-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
  control.id = id;
  const text = document.createElement('label');
  text.htmlFor = id;
  text.textContent = label;
  into.append(text, cell);
}

function select(into: HTMLFormElement, label: string, options: readonly string[], value: string, names?: Record<string, string>): HTMLSelectElement {
  const el = document.createElement('select');
  for (const option of options) el.add(new Option(names?.[option] ?? option, option, false, option === value));
  field(into, label, el);
  return el;
}

function checkbox(into: HTMLFormElement, label: string, checked: boolean): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.checked = checked;
  field(into, label, el);
  return el;
}

/**
 * The anim viewer's part: it changes the running scene (no reload), and follows the scene every
 * frame, so what the viewer's keys change shows here too.
 */
function installAnimControls(into: HTMLFormElement, viewer: AnimViewerControl): void {
  const o = viewer.options;
  const motionKey = (value: boolean | null) => Object.keys(MOTION_CHOICES).find((k) => MOTION_CHOICES[k] === value) ?? 'system';
  const clip = select(into, 'Clip', CLIP_NAMES, o.clip);
  const reaction = select(into, 'Reaction', ['', ...REACTION_CLIP_NAMES], o.reaction ?? '', { '': '(none)' });
  const dir = select(into, 'Direction', DIRECTION_NAMES, o.dir);
  const ring = checkbox(into, 'All 8 (ring)', o.ring);
  const speed = select(into, 'Speed', ANIM_SPEEDS.map(String), String(o.speed), Object.fromEntries(ANIM_SPEEDS.map((s) => [String(s), `${s}×`])));
  const loop = checkbox(into, 'Loop', o.loop);
  const motion = select(into, 'Reduced motion', Object.keys(MOTION_CHOICES), motionKey(o.reducedMotion), { system: 'as the system', on: 'on', off: 'off' });

  const time = document.createElement('input');
  time.type = 'range';
  time.min = '0';
  time.step = 'any';
  const seconds = document.createElement('span');
  const timeRow = document.createElement('div');
  timeRow.className = 'row';
  timeRow.append(time, seconds);
  field(into, 'Time', time, timeRow);

  const button = (text: string, label: string, onClick: () => void) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.setAttribute('aria-label', label);
    el.addEventListener('click', onClick);
    return el;
  };
  const play = button('Pause', 'Play or pause', () => viewer.setPlaying(!viewer.playing));
  const frames = document.createElement('div');
  frames.className = 'row';
  frames.append(button('‹', 'One frame back', () => viewer.step(-1)), play, button('›', 'One frame on', () => viewer.step(1)));
  const framesLabel = document.createElement('span');
  framesLabel.textContent = 'Play';
  into.append(framesLabel, frames);

  into.addEventListener('submit', (e) => e.preventDefault());
  into.addEventListener('change', (e) => {
    if (e.target === time) return;
    viewer.set({
      clip: clip.value as AnimOptions['clip'],
      reaction: (reaction.value || null) as AnimOptions['reaction'],
      dir: dir.value,
      ring: ring.checked,
      speed: Number(speed.value) as AnimOptions['speed'],
      loop: loop.checked,
      reducedMotion: MOTION_CHOICES[motion.value] ?? null,
    });
  });
  time.addEventListener('input', () => viewer.seek(Number(time.value)));

  const setValue = (el: HTMLSelectElement | HTMLInputElement, value: string) => {
    if (el.value !== value) el.value = value;
  };
  const setChecked = (el: HTMLInputElement, checked: boolean) => {
    if (el.checked !== checked) el.checked = checked;
  };
  const follow = () => {
    const v = viewer.options;
    setValue(clip, v.clip);
    setValue(reaction, v.reaction ?? '');
    reaction.disabled = isReactionClip(v.clip);
    setValue(dir, v.dir);
    dir.disabled = v.ring;
    setChecked(ring, v.ring);
    setValue(speed, String(v.speed));
    setChecked(loop, v.loop);
    setValue(motion, motionKey(v.reducedMotion));
    time.max = String(viewer.cycle);
    setValue(time, String(viewer.position));
    seconds.textContent = `${viewer.position.toFixed(2)} / ${viewer.span.toFixed(2)} s`;
    play.textContent = viewer.playing ? 'Pause' : 'Play';
    requestAnimationFrame(follow);
  };
  follow();
}
