# Handover to Claude Code

## What's in here
- `CLAUDE.md`: project instructions Claude Code loads automatically when it starts in this folder
- `docs/DESIGN.md`: the design spec (everything explored so far, marked Explored / Proposed / Open / Parked)
- `docs/DECISIONS.md`: open decisions with current leanings (nothing approved yet)
- `docs/ROADMAP.md`: proposed milestones, starting with a single-player vertical slice
- `docs/IMPLEMENTATION.md`: lessons from the prototypes, architecture rules, rotation approach, engine options (including why not Unreal), behavior inventory and tuned numbers
- `docs/ART_PIPELINE.md`: proposed asset pipeline and art contract
- `docs/TOPICS.md`: design topics backlog
- `prompts/M0-first-session.md`: prepared prompt for the first build session (scaffold plus verification loop)
- `reference/`: the showcase page and the bean rotation comparison, as standalone HTML (open in a browser, needs internet for fonts and Three.js)
- `art/`: reference SVGs (five bean views with labeled rig parts, body forms, the parked Heavy Baron) plus palette and fonts

## How to start
1. Create a new folder (or git repo) for the game and copy all of these files into it.
2. Open Claude Code in that folder.
3. Paste the kickoff prompt below.

## Kickoff prompt
> Read CLAUDE.md and everything in docs/. Nothing is approved yet, so treat it all as proposals.
> First, summarize your understanding in a few bullets. Then list the open decisions that block
> Milestone 0 and 1, with your recommendation for each, and ask me to confirm. Once I've answered,
> propose a step-by-step plan for Milestone 0. Don't write code until I approve the plan.

## Then build
Once you have answered the kickoff questions and confirmed the M0 stack (D6), paste the contents
of `prompts/M0-first-session.md`. It sets up the workspace, the sim, a screenshot tool and a
first proof scene (a 1 kg and a 10 kg ball dropped together), and it stops to ask before locking
any Open decision.

## Design canvas
The visual exploration (styles, hubs, characters, animations, playable prototypes) lives in your
claude.ai artifact: https://claude.ai/artifact/9YDRLAEtTBbmrrfWxTDWyX

## Other references
- Showcase draft: https://claude.ai/artifact/4v4B5RFYFt3nw6PwP4mWhS
- Rotation comparison: https://claude.ai/artifact/6pakwQQE6hkR8MzaMhBzT2
