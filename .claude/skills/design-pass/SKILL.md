---
name: design-pass
description: Run a Beananza design pass: turn Open decisions in docs/DECISIONS.md into concrete options with one recommendation each, ask the user in one message, record only what they confirm, and write the confirmed slices into the target build prompt. Use this whenever a session is asked to settle, decide or "design" something marked Open (D2, D9, …), prepare a build prompt, or when a build session hits an Open decision it must not lock in on its own.
---

# Design pass

Nothing in `docs/` is approved unless `docs/DECISIONS.md` says so, and only the user confirms
a status (CLAUDE.md). A design pass runs in its own short chat before the build session, so the
build never waits on answers.

## 1. Read
- [ ] `docs/DECISIONS.md`: every item the session names, with its notes and what it depends on.
- [ ] `docs/TOPICS.md`: the topic's write-up and anything parked that touches it.
- [ ] The design and implementation notes the items point to (`docs/DESIGN.md`,
      `docs/IMPLEMENTATION.md` §6 for prototype numbers, `reference/` for behaviour only).
- [ ] The code that the choice would change, enough to say what each option costs.

## 2. Prepare each question
For each Open item, write:
- [ ] **The options**, two to four, each one line. Include "leave it Open" when that is viable.
- [ ] **One recommendation,** with the reason. Where there are numbers, give them in SI with how
      they were derived (for example "apex 0.768 m from v₀ = √(2·g·h)"), and name the constant
      and file they would live in.
- [ ] **What the choice changes:** code, art, tests, other decisions it unlocks or blocks, and
      what would be expensive to undo.
- [ ] Anything you can decide yourself (reversible, not in DECISIONS.md) is not a question:
      note it for `docs/ASSUMPTIONS.md` instead.

## 3. Ask once
- [ ] Put every question in **one message** (the AskUserQuestion tool when there are at most
      four with short options; otherwise a numbered list), recommendation first and marked.
- [ ] Wait for the answers. Don't write any status before them.

## 4. Record
- [ ] For each confirmed item, update its row in `docs/DECISIONS.md`: status **Confirmed** or
      **Partly confirmed** with the date and the chat ("2026-10-01, D9 design pass"), and the
      confirmed content in the status cell, newest notes first. Name constants and files rather
      than copying values that can drift. Escape a `|` inside a cell as `\|`.
- [ ] Items the user left open stay Open, with a dated note of what was discussed.
- [ ] `pnpm test` (the share site parses the DECISIONS table; a malformed row fails it).

## 5. Hand over to the build
- [ ] Write the confirmed slices into the target build prompt in `prompts/` (scope, in order,
      each small enough to review on its own, with the checks that prove it), and name the
      skills the build will use (`hub-interaction`, `draw-piece`, `add-clip`, `pr-ready`).
- [ ] Anything still Open that a slice needs: say in the prompt that the build must stop and ask.
- [ ] Commit the DECISIONS change and the prompt on the pass's branch; open a PR (`pr-ready`,
      the short version: no verify needed for docs only, but `pnpm check` must be green).
