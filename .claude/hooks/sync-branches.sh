#!/usr/bin/env bash
# SessionStart hook: keep the local checkout in step with GitHub, which deletes a branch when its
# pull request is merged. Fetches with --prune; fast-forwards local main to origin/main when that
# is only a fast-forward (and, when main is checked out, the tree is clean); deletes each local
# branch whose origin branch is gone and whose tip is already in main. Anything else is kept and
# reported. Best effort: it never fails the session.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

if ! git fetch --prune --quiet origin 2>/dev/null; then
  echo "sync-branches: fetch failed (offline?); nothing changed"
  exit 0
fi

current=$(git branch --show-current)
# The base branch (a variable only so the hook can be tried out in a scratch repository).
base="${SYNC_BASE_BRANCH:-main}"

# Local main: fast-forward only. A main that has commits origin/main lacks is left alone.
if git show-ref --verify --quiet "refs/heads/$base" && [ "$(git rev-parse "$base")" != "$(git rev-parse "origin/$base")" ]; then
  if ! git merge-base --is-ancestor "$base" "origin/$base"; then
    echo "sync-branches: local $base has commits that origin/$base lacks; not updated"
  elif [ "$current" = "$base" ]; then
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      echo "sync-branches: $base is checked out with uncommitted changes; not updated"
    elif git merge --ff-only --quiet "origin/$base"; then
      echo "sync-branches: $base fast-forwarded to origin/$base ($(git rev-parse --short HEAD))"
    fi
  elif git fetch --quiet . "origin/$base:$base"; then
    echo "sync-branches: $base fast-forwarded to origin/$base ($(git rev-parse --short "$base"))"
  fi
fi

# Branches whose origin branch is gone (deleted after the merge): delete them if merged into main.
git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | while read -r branch track; do
  [ "$track" = "[gone]" ] || continue
  if [ "$branch" = "$current" ]; then
    echo "sync-branches: $branch is gone from origin but checked out; kept"
  elif git merge-base --is-ancestor "$branch" "$base"; then
    # Its tip is in main, so -D loses nothing (-d would compare with the checked-out branch).
    git branch -D --quiet "$branch" && echo "sync-branches: deleted $branch (merged, gone from origin)"
  else
    echo "sync-branches: $branch is gone from origin but not in $base; kept"
  fi
done
exit 0
