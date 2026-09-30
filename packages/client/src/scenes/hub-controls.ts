import Phaser from 'phaser';
import type { HubBeanCommand, HubInput } from '@beananza/sim';

/**
 * The hub's controls (DESIGN.md §7), turned into commands: arrows or WASD and Shift as held
 * input (a `move` whenever it changes), Space to jump, E for the context action, and a tap to
 * use what is under it or walk there. Offline the commands go to the local sim; online to the
 * server.
 */
export class HubControls {
  private readonly keys: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift', Phaser.Input.Keyboard.Key>;
  private sent: HubInput = { x: 0, y: 0, run: false };

  constructor(
    scene: Phaser.Scene,
    private readonly send: (command: HubBeanCommand) => void,
    tap: (worldX: number, worldY: number) => HubBeanCommand,
  ) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available.');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys(
      { up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT },
      true,
    ) as typeof this.keys;
    kb.addCapture([K.SPACE]);
    kb.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (!event.repeat) send({ type: 'jump' });
    });
    kb.on('keydown-E', (event: KeyboardEvent) => {
      if (!event.repeat) send({ type: 'action' });
    });
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, () => this.syncHeldInput());
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_UP, () => this.syncHeldInput());
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return; // Primary button or touch only.
      // A tap on a usable prop's drawing uses it (the bench: walk over and sit); anywhere else walks there.
      send(tap(pointer.worldX, pointer.worldY));
    });
  }

  /** Send a `move` command whenever the held direction or Run changes. */
  syncHeldInput(): void {
    const k = this.keys;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
    const run = k.shift.isDown;
    const sent = this.sent;
    if (x === sent.x && y === sent.y && run === sent.run) return;
    this.sent = { x, y, run };
    this.send({ type: 'move', x, y, run });
  }
}
