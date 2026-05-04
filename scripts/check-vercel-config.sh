#!/usr/bin/env bash
# Vercel config drift guard — closes hardening card H7
# (docs/security/hardening/H7-vercel-config-drift.md).
#
# We ship exactly ONE `vercel.json` at the repo root. A second copy under
# `apps/web/vercel.json` (or anywhere else inside `apps/`) used to drift from
# the live one because Vercel reads only the file under the project's "Root
# Directory" — the other copy becomes dead code that silently ages out.
#
# This guard fails the lint job the moment another `vercel.json` appears so
# the drift can never come back. Update `docs/deploy/vercel.md` if the policy
# changes.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

# Anything outside the repo root is forbidden. Stick to `find` (no `git ls-files`)
# so the script also works on freshly cloned mirrors that haven't run `git
# update-index` yet (e.g. some Docker-based CI variants).
mapfile -t extras < <(find . \
  -path ./node_modules -prune -o \
  -path ./.git -prune -o \
  -path ./.turbo -prune -o \
  -path ./dist -prune -o \
  -name vercel.json -not -path ./vercel.json -print | sort)

if [[ ${#extras[@]} -gt 0 ]]; then
  echo "::error::Found extra vercel.json files (only the repo root is allowed):"
  for f in "${extras[@]}"; do
    echo "::error::  $f"
  done
  echo
  echo "Why this matters: Vercel reads only one vercel.json (whichever lives"
  echo "under the project's Root Directory). A second copy silently drifts and"
  echo "lets a UI change to Root Directory swap which security headers protect"
  echo "production. See docs/security/hardening/H7-vercel-config-drift.md and"
  echo "docs/deploy/vercel.md."
  exit 1
fi

if [[ ! -f vercel.json ]]; then
  echo "::error::vercel.json is missing at the repo root."
  echo "The Vercel deploy expects exactly one vercel.json and it must live at"
  echo "the monorepo root. See docs/deploy/vercel.md."
  exit 1
fi

echo "vercel.json: OK (single source of truth at repo root)"
