#!/usr/bin/env bash
# Vercel config drift guard — closes hardening card H7
# (docs/04-governance/security/hardening/archive/H7-vercel-config-drift.md).
#
# Кожен `vercel.json` МУСИТЬ лежати в Root Directory якогось Vercel-проєкту.
# Vercel читає файл лише звідти — будь-яка копія деінде (насамперед у корені
# монорепо) стає мертвим конфігом, що тихо старіє. Зміна Root Directory в
# адмінці могла б після цього підмінити те, які security-заголовки захищають
# прод, із нульовим git-дифом.
#
# Дозволених директорій ДВІ, бо Vercel-проєктів два:
#   - apps/web     — PWA (Root Directory = apps/web)
#   - apps/landing — маркетинговий лендінг, окремий Vercel build (PR #487)
#
# Історична нотатка: спершу дозволявся рівно ОДИН файл, бо проєкт був один.
# Лендінг приїхав із власним `vercel.json`, і гейт почав падати на кожному
# PR-і, включно з docs-only — тобто блокував `check` на `main`. Розширення
# allowlist-у не послаблює інваріант: заборона копії в корені (та будь-де
# поза Root Directory) лишається дослівно тією самою.
#
# Оновлюй `docs/03-operations/deploy/vercel.md` разом із цим списком.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

# Root Directory кожного Vercel-проєкту. Порядок неважливий; додавати сюди
# новий рядок можна ЛИШЕ разом із реальним Vercel-проєктом, чий Root Directory
# на нього вказує — інакше це знову мертвий конфіг, який гейт і ловить.
ALLOWED_DIRS=(apps/web apps/landing)

# Stick to `find` (no `git ls-files`) so the script also works on freshly
# cloned mirrors that haven't run `git update-index` yet (e.g. some
# Docker-based CI variants).
find_args=()
for dir in "${ALLOWED_DIRS[@]}"; do
  find_args+=(-not -path "./${dir}/vercel.json")
done

mapfile -t extras < <(find . \
  -path ./node_modules -prune -o \
  -path ./.git -prune -o \
  -path ./.turbo -prune -o \
  -path ./dist -prune -o \
  -name vercel.json "${find_args[@]}" -print | sort)

if [[ ${#extras[@]} -gt 0 ]]; then
  echo "::error::Found vercel.json outside a Vercel project Root Directory."
  echo "::error::Allowed: ${ALLOWED_DIRS[*]/%//vercel.json}"
  for f in "${extras[@]}"; do
    echo "::error::  unexpected: $f"
  done
  echo
  echo "Why this matters: Vercel reads vercel.json only from the project's"
  echo "Root Directory. A copy anywhere else (notably at the monorepo root)"
  echo "silently drifts and lets a UI change to Root Directory swap which"
  echo "security headers protect production. See"
  echo "docs/04-governance/security/hardening/archive/H7-vercel-config-drift.md"
  echo "and docs/03-operations/deploy/vercel.md."
  exit 1
fi

missing=()
for dir in "${ALLOWED_DIRS[@]}"; do
  [[ -f "${dir}/vercel.json" ]] || missing+=("${dir}/vercel.json")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "::error::Missing vercel.json for a configured Vercel project:"
  for f in "${missing[@]}"; do
    echo "::error::  $f"
  done
  echo
  echo "Each Vercel project needs its config at its Root Directory. Without"
  echo "apps/web/vercel.json, Vercel cannot pre-build @sergeant/db-schema and"
  echo "the production build fails with a rolldown resolution error. See"
  echo "docs/03-operations/deploy/vercel.md."
  exit 1
fi

echo "vercel.json: OK (${#ALLOWED_DIRS[@]} project config(s): ${ALLOWED_DIRS[*]})"
