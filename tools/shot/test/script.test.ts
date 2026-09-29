import { describe, expect, it } from 'vitest';
import { describeStep, parseScript, scriptOutputName, scriptOutputNames, waitSteps } from '../src/script';

describe('parseScript', () => {
  it('accepts every action', () => {
    const script = parseScript({
      scene: 'hub',
      steps: [
        { keyDown: 'ArrowRight' },
        { wait: 1 },
        { keyUp: 'ArrowRight' },
        { press: 'Space' },
        { tap: [640, 360] },
        { shot: 'after-walk' },
      ],
    });
    expect(script.scene).toBe('hub');
    expect(script.layout).toBeUndefined();
    expect(script.steps).toHaveLength(6);
    expect(describeStep(script.steps[4]!)).toBe('tap [640,360]');
  });

  it('takes a hub layout (a test yard)', () => {
    expect(parseScript({ scene: 'hub', layout: 'bench', steps: [{ shot: 'a' }] }).layout).toBe('bench');
  });

  it.each([
    ['not an object', []],
    ['empty layout', { scene: 'hub', layout: '', steps: [{ shot: 'a' }] }],
    ['layout not a string', { scene: 'hub', layout: 1, steps: [{ shot: 'a' }] }],
    ['no scene', { steps: [{ shot: 'a' }] }],
    ['no steps', { scene: 'hub', steps: [] }],
    ['two actions in one step', { scene: 'hub', steps: [{ shot: 'a', wait: 1 }] }],
    ['unknown action', { scene: 'hub', steps: [{ jump: true }, { shot: 'a' }] }],
    ['empty key', { scene: 'hub', steps: [{ keyDown: '' }, { shot: 'a' }] }],
    ['bad tap', { scene: 'hub', steps: [{ tap: [1] }, { shot: 'a' }] }],
    ['negative wait', { scene: 'hub', steps: [{ wait: -1 }, { shot: 'a' }] }],
    ['wait under one step', { scene: 'hub', steps: [{ wait: 0.001 }, { shot: 'a' }] }],
    ['bad shot name', { scene: 'hub', steps: [{ shot: 'Has Spaces' }] }],
    ['reserved shot name', { scene: 'hub', steps: [{ shot: 'run' }] }],
    ['duplicate shot name', { scene: 'hub', steps: [{ shot: 'a' }, { shot: 'a' }] }],
    ['no shot', { scene: 'hub', steps: [{ wait: 1 }] }],
  ])('rejects %s', (_label, json) => {
    expect(() => parseScript(json)).toThrow();
  });
});

describe('script output names', () => {
  it('uses the file name without extension', () => {
    expect(scriptOutputName('hub-walk.json')).toBe('hub-walk');
  });

  it.each(['..json', '...json', '.json', 'Hub Walk.json', 'a.b.json'])('rejects %s', (name) => {
    expect(() => scriptOutputName(name)).toThrow();
  });

  it('rejects two scripts that would share a folder', () => {
    expect(() => scriptOutputNames(['air.json', 'air.json'])).toThrow();
    expect(scriptOutputNames(['a.json', 'b.json'])).toEqual(['a', 'b']);
  });
});

describe('waitSteps', () => {
  it('rounds seconds to whole 60 Hz steps', () => {
    expect(waitSteps(1)).toBe(60);
    expect(waitSteps(0.5)).toBe(30);
    expect(waitSteps(1 / 60)).toBe(1);
    expect(waitSteps(0.3333)).toBe(20);
  });
});
