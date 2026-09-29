# M0 first-session prompt

How to use: run the kickoff prompt from `HANDOVER.md` first, answer its questions, and confirm
the M0 stack (D6). Then paste everything below the line into Claude Code.

The stack in this prompt (TypeScript, pnpm, Vite, Phaser, Vitest) is what is being *proposed*.
If D6 is still Open when the session starts, Claude Code should ask for confirmation in its
first message and wait.

---

# Goal
Set up milestone M0 for our physics teaching game in this repo, and build the verification
loop that every later milestone will use. Do not build game features yet.

Read first: `CLAUDE.md`, `docs/DECISIONS.md`, `docs/TOPICS.md`, `docs/DESIGN.md`,
`docs/ROADMAP.md`, `docs/IMPLEMENTATION.md` and `docs/ART_PIPELINE.md`. They describe the game,
the proposed architecture and what is still undecided.

# Scope (M0)
1. pnpm workspace in TypeScript: `packages/shared`, `packages/sim`, `packages/client`.
   (`packages/server` comes in M2; don't create it.)
2. Client: Vite + Phaser (latest stable). An empty scene that boots, plus a scene switcher via
   URL (`?scene=name`).
3. Sim: pure TypeScript, SI units (metres, seconds, kg), +Y up, fixed 60 Hz timestep with an
   accumulator, seeded RNG only, no imports from Phaser, the DOM or the network. The client only
   renders sim state; `PIXELS_PER_METER` lives in `shared`.
4. First proof scene, "drop": a 1 kg and a 10 kg ball released from 10 m, in side view, with a
   simple timer. Placeholder shapes are fine; mark them as placeholders in the code. (This is the
   Heavy Baron's misconception: heavier things fall faster. The first thing the codebase verifies
   is that they don't.)
5. Vitest tests:
   - determinism: the same seed and inputs give an identical state after 10,000 steps
   - fall time from 10 m is sqrt(2·10/9.81) ≈ 1.428 s within one step, for both masses
   - a boundary test that fails if `packages/sim` imports phaser, DOM globals or client code

# Verification loop (build this before the drop scene)
- `tools/shot`: a headless Chrome script (Playwright) that starts or reuses the dev server,
  opens `?scene=<name>`, waits for a `window.__ready` flag set by the game, can advance to a given
  sim time, and writes a PNG plus a JSON log: console errors and warnings, average fps and frame
  time, scene name, sim time, git commit.
- Every scene registers under a name so it can be screenshotted on its own.
- Never claim something works or looks right without a screenshot or test you have actually
  checked in this session. Report failures as failures.

# How to work
- Small steps. Each ends with the app loadable, tests green, and a commit with a clear message.
- Port behavior and numbers from the prototypes (see `docs/IMPLEMENTATION.md` and `reference/`),
  never their code.
- Routine choices (tool configs, folder names, lint rules): decide, keep them reversible, and
  log them in `docs/ASSUMPTIONS.md`.
- Anything that would lock a decision marked Open in `docs/DECISIONS.md` beyond this scaffolding
  (engine, physics library, art format, hub camera, multiplayer): stop and ask me. Only change a
  decision's status after I have confirmed it.
- Don't add Planck.js, Colyseus, a database or an art pipeline yet.

# Review gate
When M0 looks done, run a separate reviewer pass (a subagent if available) that writes no code
and checks:
- install, build, typecheck, lint and tests pass from a clean clone
- `tools/shot` produces a PNG and a log with zero console errors for every scene
- the drop scene at t = 1.0 s shows both balls at the same height, and at t = 1.5 s both have
  landed
- the sim boundary test passes; units and timestep match `docs/IMPLEMENTATION.md`
- the README explains how to run the game, the tests and `tools/shot`
Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Write `docs/STATUS.md`: what was built, test and screenshot results (with file paths), fps as
measured (headless numbers are informational, not a gate), open issues, assumptions made, and a
proposed plan for M1. Then stop.
