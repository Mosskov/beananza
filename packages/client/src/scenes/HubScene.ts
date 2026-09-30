import {
  DEFAULT_LAYOUT,
  FIXED_DT,
  HUB_LAYOUTS,
  LOCAL_PLAYER,
  Sim,
  createHubScenario,
  portalExit,
  type HubBean,
  type HubCommand,
  type HubState,
} from '@beananza/sim';
import { SimScene } from './SimScene';
import { HubWorldView } from './HubWorldView';
import { HubControls } from './hub-controls';
import { regionUrl } from './regions';

/** After the bean has vanished into a portal, the page moves on to the region this much later (ms). */
export const LEAVE_DELAY_MS = 250;
/** The controls hint (allowed by the no-text rule). */
export const HUB_HINT = 'Move: arrows or WASD   Run: Shift   Jump: Space   Action: E';

/**
 * The hub offline (D1, D2): the local sim, one bean. Walk with arrows or WASD, run with Shift,
 * jump with Space, or tap a spot to walk there; E is the context action. The scene only turns
 * input into commands and draws sim state (`HubWorldView`); tools/shot pauses and steps it.
 */
export class HubScene extends SimScene<HubState, HubCommand> {
  private view!: HubWorldView;
  private controls!: HubControls;
  /** Where each bean and cart was before the last step, for drawing between steps. */
  private prev = new Map<string, { x: number; y: number; z: number }>();
  private prevCarts = new Map<string, number>();
  /** Set once the bean has gone through a portal and the page is on its way to the region. */
  private leaving = false;

  constructor() {
    super({ key: 'hub' });
  }

  /** The local player's bean: offline, the one bean in the hub. */
  private get me(): HubBean {
    const bean = this.sim.state.beans.find((b) => b.id === LOCAL_PLAYER);
    if (!bean) throw new Error('The hub has no local bean.');
    return bean;
  }

  /** The island, the M1 plaza, or a test yard (`?layout=`). */
  private get layoutName(): string {
    return this.layout ?? DEFAULT_LAYOUT;
  }

  protected createSim(): Sim<HubState, HubCommand> {
    const layout = HUB_LAYOUTS[this.layoutName];
    if (!layout) throw new Error(`No hub layout "${this.layoutName}".`);
    // Back from a region (`?from=`): in front of its portal. Unknown or absent: the layout's start.
    const portal = layout.portals.find((p) => p.region === this.from);
    return new Sim(createHubScenario({ layout, ...(portal ? { start: portalExit(portal) } : {}) }), 1);
  }

  protected createView(): void {
    this.view = new HubWorldView(this, this.layoutName, this.sim.state, () => this.look, HUB_HINT);
    this.controls = new HubControls(this, (command) => this.sim.enqueue(command), (x, y) => this.view.tapCommand(x, y));
    this.beforeStep();
  }

  override update(time: number, deltaMs: number): void {
    // Also catch keys Phaser released without an event (e.g. the window lost focus).
    this.controls.syncHeldInput();
    super.update(time, deltaMs);
  }

  protected override beforeStep(): void {
    for (const b of this.sim.state.beans) this.prev.set(b.id, { x: b.x, y: b.y, z: b.z });
    for (const c of this.sim.state.rail?.carts ?? []) this.prevCarts.set(c.id, c.x);
  }

  protected drawState(alpha: number): void {
    const lerp = (a: number, c: number) => a + (c - a) * alpha;
    // Animation runs on sim time (interpolated like the positions), never on wall-clock time,
    // so paused and scripted shots are deterministic. Idle keeps the last facing.
    const time = this.sim.time - (1 - alpha) * FIXED_DT;
    this.view.draw({
      state: this.sim.state,
      time,
      beanAt: (b) => {
        const p = this.prev.get(b.id) ?? b;
        return { x: lerp(p.x, b.x), y: lerp(p.y, b.y), z: lerp(p.z, b.z) };
      },
      cartAt: (c) => lerp(this.prevCarts.get(c.id) ?? c.x, c.x),
      focus: LOCAL_PLAYER,
    });
    // Through a portal in live play: on to the region's scene. Paused (tools/shot, stepping to
    // exact times) the scene stays, so scripted shots are deterministic.
    const act = this.me.act;
    if (act.kind === 'gone' && !this.isPaused && !this.leaving) {
      this.leaving = true;
      const region = act.region;
      this.time.delayedCall(LEAVE_DELAY_MS, () => window.location.assign(regionUrl(window.location.href, region)));
    }
  }

  override debugState(): unknown {
    const base = super.debugState() as Record<string, unknown>;
    return { ...base, layout: this.layoutName, view: this.view.debugView(this.sim.state, LOCAL_PLAYER) };
  }
}
