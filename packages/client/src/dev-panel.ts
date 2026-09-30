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
`;

/**
 * A dev-server-only panel that rewrites the URL options (scene, layout, look, paused) and
 * reloads, since the boot reads them once. Never in a production build, and never in a
 * Playwright run (tools/shot), so screenshots and golden states are unchanged.
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
  // Stays open across the reloads it causes (per tab; a convenience only).
  const show = (open: boolean) => {
    form.hidden = !open;
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

  const field = (label: string, control: HTMLElement) => {
    const id = `dev-${label.toLowerCase()}`;
    control.id = id;
    const text = document.createElement('label');
    text.htmlFor = id;
    text.textContent = label;
    form.append(text, control);
  };
  const select = (label: string, options: readonly string[], value: string, names?: Record<string, string>) => {
    const el = document.createElement('select');
    for (const option of options) el.add(new Option(names?.[option] ?? option, option, false, option === value));
    field(label, el);
    return el;
  };

  const scene = select('Scene', SCENE_NAMES, params.get(URL_PARAM_SCENE) ?? DEFAULT_SCENE);
  const layout = select('Layout', ['', ...HUB_LAYOUT_NAMES], params.get(URL_PARAM_LAYOUT) ?? '', { '': '(plaza)' });
  const colour = select('Colour', COLOUR_IDS, look.colour);
  const pattern = select('Pattern', PATTERN_IDS, look.pattern);
  const headwear = select('Headwear', HEADWEAR_IDS, look.headwear);
  const face = select('Face', FACE_IDS, look.face);
  const paused = document.createElement('input');
  paused.type = 'checkbox';
  paused.checked = params.get(URL_PARAM_PAUSED) === '1';
  field('Paused', paused);
  layout.disabled = !LAYOUT_SCENES.has(scene.value);

  form.addEventListener('change', () => {
    const picked: BeanLook = {
      colour: colour.value as BeanLook['colour'],
      pattern: pattern.value as BeanLook['pattern'],
      headwear: headwear.value as BeanLook['headwear'],
      face: face.value as BeanLook['face'],
    };
    window.location.search = panelQuery(params, { scene: scene.value, layout: layout.value, look: picked, paused: paused.checked }, DEFAULT_SCENE);
  });

  root.append(toggle, form);
  document.body.append(root);
}
