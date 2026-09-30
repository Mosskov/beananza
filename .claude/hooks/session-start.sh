#!/usr/bin/env bash
# SessionStart hook: make a fresh Claude Code on the web container ready for `pnpm verify`.
# Runs only in cloud sessions (CLAUDE_CODE_REMOTE=true); a local session has its own worktree
# set up by the session-start skill. Installs dependencies, and Playwright's Chromium only when
# it is not there yet (cloud images may already have it under PLAYWRIGHT_BROWSERS_PATH).
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# pnpm at the version in package.json, through corepack.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || corepack enable --install-directory "$HOME/.local/bin"
  export PATH="$HOME/.local/bin:$PATH"
fi

pnpm install --frozen-lockfile

# Is the Chromium tools/shot launches already installed?
if (cd tools/shot && node -e "
  const fs = require('node:fs');
  const p = require('playwright').chromium.executablePath();
  process.exit(fs.existsSync(p) ? 0 : 1);
"); then
  echo "session-start: Playwright Chromium already present"
else
  echo "session-start: installing Playwright Chromium"
  # What `pnpm shot:install` runs, without a nested pnpm.
  pnpm --filter @beananza/shot exec playwright install chromium
  # System libraries, where the container lets us (needs root; skipped otherwise).
  pnpm --filter @beananza/shot exec playwright install-deps chromium || echo "session-start: could not install system libraries for Chromium"
fi
