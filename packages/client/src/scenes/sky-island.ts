import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import { hexagon, polygonBounds, type ConvexPolygon } from '@beananza/sim';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '../config';
import { toScreen, type CameraMargin } from './hub-view';

/**
 * The hub as a floating island (D2): a blue sky fixed to the camera, clouds drifting behind the
 * island, and the island itself drawn from the walkable polygon, which is its grass top. The
 * edges that face the camera (south) get a rock cliff and the island a rocky underside, so it
 * reads as floating. PLACEHOLDER shapes until the island is drawn as art (docs/ART_PIPELINE.md).
 */

/** Layouts drawn as a sky island (the rest are plaza ground: the M1 plaza and its test yards). */
export const SKY_LAYOUTS: ReadonlySet<string> = new Set(['island']);

/**
 * The cliff under the south edges and the underside below it (m, drawn straight down the screen).
 * Together they stay under half the view's height, so a bean at the south edge sees the tip of
 * the underside and sky below it.
 */
const CLIFF_M = 1;
const UNDERSIDE_M = 2.4;
/** Sky around the island when the camera follows: to the south, room for the cliff and underside. */
export const SKY_MARGIN: CameraMargin = { north: 1.5, south: CLIFF_M + UNDERSIDE_M + 0.6, east: 1.5, west: 1.5 };
/** Hanging rocks along the underside, west to east: depth as a share of UNDERSIDE_M. */
const UNDERSIDE_PROFILE = [0.25, 0.5, 0.35, 0.75, 0.55, 1, 0.7, 0.9, 0.5, 0.65, 0.3, 0.4, 0.2];
/** The stone arrival pad at the centre (m, circumradius of a hexagon like the island). */
const PAD_M = 3;
const RIM_PX = 6;
const PAD_EDGE_PX = 4;
/** Width of the stone paths from the pad to the portals (m). */
const PATH_M = 1.1;

/** Clouds (m, world position), drawn with parallax behind the island. */
const CLOUDS: readonly { x: number; y: number; size: number; speed: number }[] = [
  { x: -16, y: 9, size: 1.3, speed: 0.12 },
  { x: 10, y: 12, size: 1, speed: 0.08 },
  { x: 22, y: 2, size: 1.5, speed: 0.1 },
  { x: -24, y: -4, size: 1.1, speed: 0.14 },
  { x: 4, y: -16, size: 1.6, speed: 0.09 },
  { x: -8, y: -20, size: 1.2, speed: 0.11 },
  { x: 26, y: -14, size: 0.9, speed: 0.13 },
];
/** Clouds move this share of the camera's movement (further away than the island). */
const CLOUD_PARALLAX = 0.35;
/** A drifting cloud wraps around in this band of world x (m). */
const CLOUD_WRAP_M = 64;

const m = (meters: number) => meters * PIXELS_PER_METER;
const screenPoints = (poly: ConvexPolygon, dz = 0) => poly.points.map((p) => new Phaser.Math.Vector2(toScreen(p.x, p.y).x, toScreen(p.x, p.y).y + m(dz)));

export class SkyIsland {
  private readonly clouds: { image: Phaser.GameObjects.Graphics; x: number; speed: number }[] = [];

  /**
   * `groundDepth` is where the ground draws; the sky and clouds go below it. `paths` are ground
   * points (m) a stone path leads to from the arrival pad: the portals' exit spots.
   */
  constructor(scene: Phaser.Scene, walkable: ConvexPolygon, groundDepth: number, paths: readonly { x: number; y: number }[] = []) {
    const sky = scene.add.graphics().setScrollFactor(0).setDepth(groundDepth - 2);
    sky.fillGradientStyle(PALETTE.skyTop, PALETTE.skyTop, PALETTE.skyBottom, PALETTE.skyBottom, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    for (const c of CLOUDS) {
      const g = scene.add.graphics().setScrollFactor(CLOUD_PARALLAX).setDepth(groundDepth - 1);
      const s = c.size * PIXELS_PER_METER;
      g.fillStyle(PALETTE.cloudShade, 1).fillEllipse(0.1 * s, 0.18 * s, 2.3 * s, 0.7 * s);
      g.fillStyle(PALETTE.cloud, 1).fillEllipse(0, 0, 2.2 * s, 0.6 * s).fillCircle(-0.45 * s, -0.2 * s, 0.42 * s).fillCircle(0.3 * s, -0.28 * s, 0.5 * s);
      const at = toScreen(c.x, c.y);
      g.setPosition(at.x, at.y);
      this.clouds.push({ image: g, x: c.x, speed: c.speed });
    }

    this.drawIsland(scene.add.graphics().setDepth(groundDepth), walkable, paths);
  }

  /** Drift the clouds to sim time `time` (s). Still under reduced motion. */
  update(time: number, reducedMotion: boolean): void {
    for (const c of this.clouds) {
      const drift = reducedMotion ? 0 : c.speed * time;
      const x = (((c.x + drift + CLOUD_WRAP_M / 2) % CLOUD_WRAP_M) + CLOUD_WRAP_M) % CLOUD_WRAP_M - CLOUD_WRAP_M / 2;
      c.image.x = m(x);
    }
  }

  private drawIsland(g: Phaser.GameObjects.Graphics, walkable: ConvexPolygon, paths: readonly { x: number; y: number }[]): void {
    const pts = walkable.points;
    const b = polygonBounds(walkable);
    const south = toScreen(0, b.minY).y + m(CLIFF_M);
    const west = toScreen(b.minX, 0).x;
    const east = toScreen(b.maxX, 0).x;
    // The underside: a rocky wedge below the south cliffs, tapering to a point.
    const corners = pts.map((p) => toScreen(p.x, p.y));
    const lowest = (side: number) => corners.filter((c) => Math.sign(c.x) === side).reduce((a, c) => (c.y > a.y ? c : a), { x: 0, y: -Infinity });
    const sw = lowest(-1);
    const se = lowest(1);
    const westBottom = { x: west, y: toScreen(b.minX, (b.minY + b.maxY) / 2).y + m(CLIFF_M) };
    const eastBottom = { x: east, y: westBottom.y };
    const cliffBottom = [westBottom, { x: sw.x, y: sw.y + m(CLIFF_M) }, { x: se.x, y: se.y + m(CLIFF_M) }, eastBottom];
    // Hanging rocks, deepest in the middle and shallow under the corners; listed east back to west.
    const n = UNDERSIDE_PROFILE.length;
    const rocks = UNDERSIDE_PROFILE.map((share, i) => {
      const u = i / (n - 1); // 0 at the west end … 1 at the east end
      const x = west + (east - west) * (0.06 + 0.88 * u);
      const taper = 1 - (2 * u - 1) * (2 * u - 1) * 0.6;
      return { x, y: south + m(UNDERSIDE_M * share * taper) };
    }).reverse();
    const toVec = (p: { x: number; y: number }) => new Phaser.Math.Vector2(p.x, p.y);
    g.fillStyle(PALETTE.rockUnder, 1).fillPoints([...cliffBottom, ...rocks].map(toVec), true);
    // A lighter band just under the cliff, for form.
    const band = rocks.map((p) => ({ x: p.x, y: south + (p.y - south) * 0.35 }));
    g.fillStyle(PALETTE.cliffDark, 1).fillPoints([...cliffBottom, ...band].map(toVec), true);

    // Cliff faces under the edges that face the camera (outward normal pointing south), lit from the west.
    pts.forEach((a, i) => {
      const next = pts[(i + 1) % pts.length]!;
      const dx = next.x - a.x;
      const dy = next.y - a.y;
      if (dx <= 0) return; // counter-clockwise: an edge running east faces south
      const facing = dy / Math.hypot(dx, dy); // −1 lit (south-west) … +1 shaded (south-east)
      const colour = facing < -0.1 ? PALETTE.cliffLight : facing > 0.1 ? PALETTE.cliffDark : PALETTE.cliffMid;
      const p = toScreen(a.x, a.y);
      const q = toScreen(next.x, next.y);
      g.fillStyle(colour, 1).fillPoints(
        [
          new Phaser.Math.Vector2(p.x, p.y),
          new Phaser.Math.Vector2(q.x, q.y),
          new Phaser.Math.Vector2(q.x, q.y + m(CLIFF_M)),
          new Phaser.Math.Vector2(p.x, p.y + m(CLIFF_M)),
        ],
        true,
      );
    });

    // The grass top, with a lighter rim, and the stone arrival pad at the centre.
    const top = screenPoints(walkable);
    g.fillStyle(PALETTE.grass, 1).fillPoints(top, true);
    g.lineStyle(RIM_PX, PALETTE.grassRim, 1).strokePoints(top, true, true);
    // Stone paths from the pad to each portal, with a soft edge, under the pad.
    const centre = toScreen(0, 0);
    for (const [colour, width] of [[PALETTE.cardShadow, PATH_M + 0.08], [PALETTE.stone, PATH_M]] as const) {
      g.lineStyle(m(width), colour, 1);
      for (const p of paths) {
        const end = toScreen(p.x, p.y);
        g.lineBetween(centre.x, centre.y, end.x, end.y);
        g.fillStyle(colour, 1).fillCircle(end.x, end.y, m(width) / 2);
      }
    }
    const pad = screenPoints(hexagon(PAD_M));
    g.fillStyle(PALETTE.stone, 1).fillPoints(pad, true);
    g.lineStyle(PAD_EDGE_PX, PALETTE.cardShadow, 1).strokePoints(pad, true, true);
  }
}
