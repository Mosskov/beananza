import { DEFAULT_LOOK, URL_PARAM_LAYOUT, URL_PARAM_LOOK, URL_PARAM_PAUSED, URL_PARAM_SCENE, lookToString, type BeanLook } from '@beananza/shared';

/** Scenes that read `?layout=`. */
export const LAYOUT_SCENES: ReadonlySet<string> = new Set(['hub']);

/** The URL options the dev panel sets; every other one belongs to a scene (e.g. the clip sheet's). */
const PANEL_PARAMS: ReadonlySet<string> = new Set([URL_PARAM_SCENE, URL_PARAM_LAYOUT, URL_PARAM_LOOK, URL_PARAM_PAUSED]);

export interface PanelChoice {
  scene: string;
  /** '' for the plaza. */
  layout: string;
  look: BeanLook;
  paused: boolean;
}

/**
 * The query string for the panel's choice. A scene's own options (the clip sheet's clip, views
 * and phases) are kept while the scene stays the same, and dropped when it changes.
 */
export function panelQuery(current: URLSearchParams, choice: PanelChoice, defaultScene: string): string {
  const next = new URLSearchParams();
  if (choice.scene !== defaultScene) next.set(URL_PARAM_SCENE, choice.scene);
  if (choice.layout && LAYOUT_SCENES.has(choice.scene)) next.set(URL_PARAM_LAYOUT, choice.layout);
  const lookText = lookToString(choice.look);
  if (lookText !== lookToString(DEFAULT_LOOK)) next.set(URL_PARAM_LOOK, lookText);
  if (choice.paused) next.set(URL_PARAM_PAUSED, '1');
  if ((current.get(URL_PARAM_SCENE) ?? defaultScene) === choice.scene) {
    for (const [key, value] of current) if (!PANEL_PARAMS.has(key)) next.append(key, value);
  }
  const query = next.toString().replaceAll('%2C', ',');
  return query ? `?${query}` : '';
}
