import { describe, expect, it } from 'vitest';
import { Sim, createHubScenario, type HubAct, type HubCommand, type HubState } from '@beananza/sim';
import { CLASSMATES, GREETING_S, PRIYA_COLOUR, greetingAt } from '../src/scenes/classmates';

const withAct = (act: HubAct): HubState => {
  const state = new Sim<HubState, HubCommand>(createHubScenario(), 1).state;
  state.bean.act = act;
  return state;
};
const priya = CLASSMATES[0]!;

describe('Priya, the seated classmate', () => {
  it('is blue and sits on the seat the sim keeps for her', () => {
    expect(priya).toMatchObject({ name: 'Priya', bench: 'bench', seat: 'east', look: { colour: PRIYA_COLOUR } });
    const seat = withAct({ kind: 'free' }).layout.benches[0]!.seats.find((q) => q.id === priya.seat);
    expect(seat?.taken).toBe(true);
  });

  it('greets for 2.4 s after the bean sits down next to her, and not otherwise', () => {
    const sitting = withAct({ kind: 'sitting', bench: 'bench', seat: 'west', since: 120 });
    expect(greetingAt(sitting, priya, 1.99)).toBeNull();
    expect(greetingAt(sitting, priya, 2)).toBe(0);
    expect(greetingAt(sitting, priya, 2 + GREETING_S - 0.01)).toBeCloseTo(GREETING_S - 0.01, 12);
    expect(greetingAt(sitting, priya, 2 + GREETING_S)).toBeNull();
    expect(greetingAt(withAct({ kind: 'seating', bench: 'bench', seat: 'west', startTick: 99, endTick: 120, fromX: -4, fromY: 0.675 }), priya, 1.9)).toBeNull();
    expect(greetingAt(withAct({ kind: 'free' }), priya, 2.5)).toBeNull();
  });
});
