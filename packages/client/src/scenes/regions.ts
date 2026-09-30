import { URL_PARAM_FROM, URL_PARAM_LAYOUT, URL_PARAM_PAUSED, URL_PARAM_REGION, URL_PARAM_SCENE } from '@beananza/shared';
import { REGION_IDS, type RegionId } from '@beananza/sim';

/**
 * How each region looks until it is built (D2): the tint of its portal's swirl and its
 * placeholder scene's sky, ground and landscape. PLACEHOLDER colours, in the art/README.md
 * palette table. Names are for code and logs only: game scenes show no text.
 */
export interface RegionStyle {
  name: string;
  /** The portal's swirl tint (the swirl is drawn in white and greys). */
  portal: number;
  skyTop: number;
  skyBottom: number;
  ground: number;
  /** The far landscape's silhouette. */
  far: number;
  /** What the far landscape is: rolling hills, waves, or storm clouds. */
  landscape: 'hills' | 'waves' | 'clouds' | 'crystals';
}

export const REGION_STYLES: Readonly<Record<RegionId, RegionStyle>> = {
  mechanics: { name: 'Mechanics Valley', portal: 0xf0a24a, skyTop: 0xf3c98f, skyBottom: 0xfbead0, ground: 0x9cbf6e, far: 0x7fa86a, landscape: 'hills' },
  waves: { name: 'Wave Canyon', portal: 0x4fa8d6, skyTop: 0x8fcce6, skyBottom: 0xdcf1f8, ground: 0xe6cf9a, far: 0x5aa9c9, landscape: 'waves' },
  storm: { name: 'Storm Highlands', portal: 0x9b7fd1, skyTop: 0x6f7394, skyBottom: 0xb9b4cf, ground: 0x7e8c73, far: 0x57597a, landscape: 'clouds' },
  crystal: { name: 'Crystal Caves', portal: 0x7fd6d0, skyTop: 0x3f4f66, skyBottom: 0x7f93a8, ground: 0x6b7a8c, far: 0x7fd6d0, landscape: 'crystals' },
};

/** A locked portal's swirl: greyed out. */
export const LOCKED_SWIRL = 0xb4bcc4;

export function isRegionId(value: string | null): value is RegionId {
  return value !== null && (REGION_IDS as readonly string[]).includes(value);
}

/**
 * The URL that opens `scene`, keeping the player's look and dropping the hub-only and tool-only
 * parameters. Travelling between the hub and a region reloads the page on this URL.
 */
function travelUrl(current: string, set: Record<string, string>): string {
  const url = new URL(current);
  for (const key of [URL_PARAM_LAYOUT, URL_PARAM_PAUSED, URL_PARAM_REGION, URL_PARAM_FROM]) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(set)) url.searchParams.set(key, value);
  return url.toString();
}

/** From the hub into a region's scene. */
export function regionUrl(current: string, region: RegionId): string {
  return travelUrl(current, { [URL_PARAM_SCENE]: 'region', [URL_PARAM_REGION]: region });
}

/** From a region back to the hub, in front of that region's portal. */
export function hubUrl(current: string, from: RegionId): string {
  return travelUrl(current, { [URL_PARAM_SCENE]: 'hub', [URL_PARAM_FROM]: from });
}
