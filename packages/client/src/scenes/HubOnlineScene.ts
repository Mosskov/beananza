import Phaser from 'phaser';
import { DEFAULT_LOOK, parseLook, type BeanLook } from '@beananza/shared';
import { EARTH_GRAVITY, HUB_LAYOUTS, SIM_HZ, hubStateFromSnapshot, type HubState, type PlazaLayout } from '@beananza/sim';
import { PALETTE, UI_FONT, cssColor } from '../config';
import { hubConnection, type HubConnection } from '../net/connection';
import { showDisconnected } from '../net/join-overlay';
import { sharpText } from '../screen-scale';
import { HubWorldView, UI_DEPTH } from './HubWorldView';
import { HubControls } from './hub-controls';
import { HUB_HINT, LEAVE_DELAY_MS } from './HubScene';
import { regionUrl } from './regions';
import type { TestableScene } from './TestableScene';

/** Other players' name tags show within this distance of your bean (m, DESIGN.md §10). */
export const NAME_TAG_RANGE_M = 3;
/** Gap between a bean's head and its name tag (art units). */
const TAG_GAP_UNITS = 10;
/** A name tag (D17's text exception, extended to names: D27). PLACEHOLDER style. */
const TAG_STYLE = {
  fontFamily: UI_FONT,
  fontSize: '15px',
  color: cssColor(PALETTE.ink),
  backgroundColor: 'rgba(255, 248, 236, 0.85)',
  padding: { x: 6, y: 2 },
};

/**
 * The hub online (M2): the class's room on the server runs the sim; this scene sends the
 * player's commands and draws the server's snapshots, interpolated (`SnapshotBuffer`), through
 * the same `HubWorldView` as the offline hub. Other beans get a name tag when near. Going through
 * a portal leaves the room for the region's scene; coming back joins again in front of it.
 */
export class HubOnlineScene extends Phaser.Scene implements TestableScene {
  private net!: HubConnection;
  private layout!: PlazaLayout;
  private view!: HubWorldView;
  private controls!: HubControls;
  private looks = new Map<string, BeanLook>();
  private tags = new Map<string, Phaser.GameObjects.Text>();
  private state: HubState | null = null;
  private drawnTick: number | null = null;
  private leaving = false;
  private lost = false;

  constructor() {
    super({ key: 'hub-online' });
  }

  create(): void {
    this.net = hubConnection();
    const layout = HUB_LAYOUTS[this.net.welcome.layout];
    if (!layout) throw new Error(`The server's hub layout "${this.net.welcome.layout}" is not in this client.`);
    this.layout = layout;
    this.updateLooks();
    this.net.onRoster(() => this.updateLooks());
    const first = this.net.buffer.latest;
    const state = hubStateFromSnapshot(layout, EARTH_GRAVITY, first ?? { tick: 0, beans: [], carts: [] });
    this.view = new HubWorldView(this, this.net.welcome.layout, state, (id) => this.looks.get(id) ?? DEFAULT_LOOK, HUB_HINT);
    this.controls = new HubControls(this, (command) => this.net.send(command), (x, y) => this.view.tapCommand(x, y));
    this.draw();
  }

  private updateLooks(): void {
    for (const p of this.net.roster) this.looks.set(p.id, parseLook(p.look).look);
  }

  override update(): void {
    this.controls.syncHeldInput();
    this.draw();
    if (this.net.closed && !this.leaving && !this.lost) {
      this.lost = true;
      showDisconnected();
    }
  }

  private draw(): void {
    const frame = this.net.buffer.frame(performance.now());
    if (!frame) return;
    const state = hubStateFromSnapshot(this.layout, EARTH_GRAVITY, frame.snapshot);
    this.state = state;
    this.drawnTick = frame.tick;
    const time = frame.tick / SIM_HZ;
    this.view.draw({ state, time, beanAt: frame.beanAt, cartAt: frame.cartAt, focus: this.net.you });
    this.drawTags(state, frame.beanAt);

    // Through a portal: leave the room and go to the region (coming back joins again, `from`).
    const me = state.beans.find((b) => b.id === this.net.you);
    if (me?.act.kind === 'gone' && !this.leaving) {
      this.leaving = true;
      const region = me.act.region;
      this.time.delayedCall(LEAVE_DELAY_MS, () => {
        void this.net.leave().then(() => window.location.assign(regionUrl(window.location.href, region)));
      });
    }
  }

  /** Name tags above other beans near yours; none on your own. */
  private drawTags(state: HubState, beanAt: (b: { id: string; x: number; y: number; z: number }) => { x: number; y: number; z: number }): void {
    const me = state.beans.find((b) => b.id === this.net.you);
    const mine = me ? beanAt(me) : null;
    const seen = new Set<string>();
    for (const bean of state.beans) {
      if (bean.id === this.net.you || !mine) continue;
      const at = beanAt(bean);
      const rig = this.view.rigOf(bean.id);
      const near = Math.hypot(at.x - mine.x, at.y - mine.y) <= NAME_TAG_RANGE_M;
      const name = this.net.roster.find((p) => p.id === bean.id)?.name;
      let tag = this.tags.get(bean.id);
      if (!near || !rig || !name || !rig.root.visible) {
        tag?.setVisible(false);
        continue;
      }
      if (!tag) {
        tag = sharpText(this.add.text(0, 0, name, TAG_STYLE).setOrigin(0.5, 1).setDepth(UI_DEPTH - 3));
        this.tags.set(bean.id, tag);
      }
      seen.add(bean.id);
      const scale = rig.root.scaleX;
      tag.setText(name).setPosition(rig.root.x, rig.root.y + (rig.drawnTop() - TAG_GAP_UNITS) * scale).setVisible(true);
    }
    for (const [id, tag] of this.tags) {
      if (seen.has(id)) continue;
      if (!state.beans.some((b) => b.id === id)) {
        tag.destroy();
        this.tags.delete(id);
      } else {
        tag.setVisible(false);
      }
    }
  }

  simTime(): number | null {
    return this.drawnTick === null ? null : this.drawnTick / SIM_HZ;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('The online hub runs on the server: it cannot be stepped.');
  }

  stepBy(): number {
    throw new Error('The online hub runs on the server: it cannot be stepped.');
  }

  debugState(): unknown {
    const r = (n: number) => Math.round(n * 1e4) / 1e4;
    return {
      online: true,
      you: this.net.you,
      layout: this.net.welcome.layout,
      tick: this.drawnTick,
      roster: this.net.roster,
      beans: (this.state?.beans ?? []).map((b) => ({ id: b.id, x: r(b.x), y: r(b.y), act: b.act.kind })),
      tags: [...this.tags].filter(([, t]) => t.visible).map(([id, t]) => ({ id, text: t.text })),
      view: this.state ? this.view.debugView(this.state, this.net.you) : null,
    };
  }
}
