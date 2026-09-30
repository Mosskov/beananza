/**
 * Preset names (D27): students pick one of these, never type one (students are minors, and there
 * is no free text anywhere). A name is an adjective and an animal, e.g. "Brave Otter". The server
 * accepts only names from this list.
 */
export const NAME_ADJECTIVES = [
  'Brave', 'Calm', 'Clever', 'Cosy', 'Curious', 'Gentle', 'Happy', 'Jolly',
  'Kind', 'Lucky', 'Merry', 'Nimble', 'Quick', 'Sunny', 'Swift', 'Witty',
] as const;

export const NAME_ANIMALS = [
  'Badger', 'Beaver', 'Bunny', 'Deer', 'Duck', 'Ferret', 'Fox', 'Hedgehog',
  'Koala', 'Lynx', 'Otter', 'Owl', 'Panda', 'Puffin', 'Robin', 'Seal',
] as const;

/** Every preset name (16 × 16 = 256). */
export const PRESET_NAMES: readonly string[] = NAME_ADJECTIVES.flatMap((a) => NAME_ANIMALS.map((b) => `${a} ${b}`));

const NAME_SET: ReadonlySet<string> = new Set(PRESET_NAMES);

export function isPresetName(name: unknown): name is string {
  return typeof name === 'string' && NAME_SET.has(name);
}

/**
 * `count` different preset names to offer, picked with `random` (0..1; the client passes
 * Math.random, tests a seeded one).
 */
export function nameChoices(count: number, random: () => number): string[] {
  const out = new Set<string>();
  while (out.size < Math.min(count, PRESET_NAMES.length)) {
    out.add(PRESET_NAMES[Math.floor(random() * PRESET_NAMES.length)] as string);
  }
  return [...out];
}
