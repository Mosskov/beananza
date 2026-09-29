import type { Scenario, SimStateBase } from '../sim';
import { FIXED_DT, ticksToSeconds } from '../time';

/** Standard gravity, rounded the way textbooks do (m/s²). */
export const EARTH_GRAVITY = 9.81;

/**
 * The Heavy Baron's claim, tested: a 1 kg and a 10 kg ball released together from 10 m.
 * Without air resistance, mass does not appear in the equations, so both land at
 * t = sqrt(2h / g) ≈ 1.428 s.
 */
export const DROP_HEIGHT_M = 10;
export const DROP_BALLS = [
  { id: 'light', massKg: 1, x: -1.5 },
  { id: 'heavy', massKg: 10, x: 1.5 },
] as const;

/**
 * A ball as a point mass. `y` is the height of its lowest point above the ground
 * (metres, +Y up), so the fall distance is exactly the release height whatever size the
 * client draws it.
 */
export interface DropBall {
  id: string;
  massKg: number;
  x: number;
  y: number;
  vy: number;
  /** Exact time of ground contact (seconds since release), or null while falling. */
  landedAt: number | null;
}

export interface DropState extends SimStateBase {
  gravity: number;
  releaseHeight: number;
  balls: DropBall[];
}

/** Put both balls back at the release height; the drop starts again from t = 0. */
export type DropCommand = { type: 'reset' };

export interface DropOptions {
  heightM?: number;
  gravity?: number;
}

function initialBalls(height: number): DropBall[] {
  return DROP_BALLS.map((b) => ({ id: b.id, massKg: b.massKg, x: b.x, y: height, vy: 0, landedAt: null }));
}

/**
 * Exact integration for constant acceleration: y += v·dt − ½g·dt², v −= g·dt has no
 * integration error, so the numbers students see are textbook values (docs/IMPLEMENTATION.md §3).
 * Ground contact is solved analytically inside the step, so `landedAt` is exact too.
 */
function stepBall(ball: DropBall, g: number, tick: number): void {
  if (ball.landedAt !== null) return;
  const dt = FIXED_DT;
  const y = ball.y + ball.vy * dt - 0.5 * g * dt * dt;
  if (y > 0) {
    ball.y = y;
    ball.vy -= g * dt;
    return;
  }
  // Solve y0 + v0·τ − ½g·τ² = 0 for the contact time τ within this step.
  const tau = (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * g * ball.y)) / g;
  ball.landedAt = ticksToSeconds(tick) + tau;
  ball.y = 0;
  ball.vy = 0; // No bounce: M0 only checks when they land.
}

export function createDropScenario(options: DropOptions = {}): Scenario<DropState, DropCommand> {
  const height = options.heightM ?? DROP_HEIGHT_M;
  const gravity = options.gravity ?? EARTH_GRAVITY;
  return {
    name: 'drop',
    init: () => ({ gravity, releaseHeight: height, balls: initialBalls(height) }),
    step(state, commands) {
      for (const command of commands) {
        if (command.type === 'reset') {
          state.tick = 0;
          state.balls = initialBalls(state.releaseHeight);
        }
      }
      for (const ball of state.balls) stepBall(ball, state.gravity, state.tick);
    },
  };
}
