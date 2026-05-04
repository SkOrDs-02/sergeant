#!/usr/bin/env bash
# Vercel config drift guard — closes hardening card H7
# (docs/security/hardening/H7-vercel-config-drift.md).
#
# We ship exactly ONE `vercel.json` and it MUST live at `apps/web/vercel.json`,
# because the Vercel project's "Root Directory" is `apps/web`. Vercel reads
# only the file under that directory — any other copy (notably a stray one at
# the monorepo root) becomes dead code that silently ages out. A future
# admin-UI change to the Root Directory could then swap which security
# headers protect production with zero git diff.
#
# This guard fails the lint job the moment another `vercel.json` appears so
# the drift can never come back. Update `docs/deploy/vercel.md` if the policy
# changes (e.g. if the Vercel Root Directory is ever moved back to repo root).
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

# Anything outside `apps/web/vercel.json` is forbidden. Stick to `find` (no
# `git ls-files`) so the script also works on freshly cloned mirrors that
# haven't run `git update-index` yet (e.g. some Docker-based CI variants).
mapfile -t extras < <(find . \
  -path ./node_modules -prune -o \
  -path ./.git -prune -o \
  -path ./.turbo -prune -o \
  -path ./dist -prune -o \
  -name vercel.json -not -path ./apps/web/vercel.json -print | sort)

if [[ ${#extras[@]} -gt 0 ]]; then
  echo "::error::Found extra vercel.json files (only apps/web/vercel.json is allowed):"
  for f in "${extras[@]}"; do
    echo "::error::  $f"
  done
  echo
  echo "Why this matters: the Vercel project Root Directory is apps/web, so"
  echo "Vercel reads only apps/web/vercel.json. A second copy (e.g. at the"
  echo "monorepo root) silently drifts and lets a UI change to Root Directory"
  echo "swap which security headers protect production. See"
  echo "docs/security/hardening/H7-vercel-config-drift.md and"
  echo "docs/deploy/vercel.md."
  exit 1
fi

if [[ ! -f apps/web/vercel.json ]]; then
  echo "::error::apps/web/vercel.json is missing."
  echo "The Vercel deploy expects exactly one vercel.json and it must live at"
  echo "apps/web/vercel.json (because Root Directory = apps/web in the Vercel"
  echo "project). Without it, Vercel cannot pre-build @sergeant/db-schema and"
  echo "the production build fails with a rolldown resolution error. See"
  echo "docs/deploy/vercel.md."
  exit 1
fi

echo "vercel.json: OK (single source of truth at apps/web/vercel.json)"
