# ADR-0088: Виведення Devin і Kilo Code з активних харнесів

- **Status:** Proposed
- **Last validated:** 2026-08-28 by @Skords-01. **Next review:** 2026-11-28.
- **Date:** 2026-08-28
- **Deciders:** @Skords-01
- **Supersedes:** -
- **Related:**
  - [ADR-0072](./0072-harness-versioning.md) - harness versioning: механіка чинна, реєстр перенесено в `.agents/`.
  - [ADR-0071](./0071-dynamic-agent-snapshot.md) - dynamic snapshot: механіка чинна, шлях виводу перенесено в `.agents/`.
  - [ADR-0081](./0081-repository-simplification.md), [ADR-0082](./0082-private-storage-repo-posture.md) - попередні хвилі спрощення репо.

## Контекст

З весни 2026 репо будувалось як tool-agnostic: будь-який AI-харнес (Claude Code, Kilo Code, Devin, Cursor) читає `AGENTS.md` + `.agents/skills/` і працює як рівноправний пір. Фактичний стан на 2026-08-28 інший: власник працює лише через Claude Code і Codex; Devin- і Kilo-сесій давно немає.

Попри це `git grep -il -E "devin|kilo"` давав ~144 tracked-файли, і десятки з них подавали Devin/Kilo як активні опції: таблиця харнесів і SECURITY-нотатка в `AGENTS.md`, коренева обгортка `DEVIN.md`, секція Kilo-еквівалентів у `CLAUDE.md`, `kilo-code` у tools-списках loop-реєстру, branch-конвенція `devin/<unix-ts>-…` у 13 playbooks, Devin-кроки в onboarding і renovate-процесах. Два kilo-названі шляхи (`.kilo/harness-versions.json`, `.kilocode/snapshot.md`) прив'язували harness-neutral механіку до мертвого бренду.

## Рішення

1. **Активні харнеси: Claude Code і Codex.** Архітектура лишається tool-agnostic (skills у `.agents/skills/` harness-neutral, `AGENTS.md` - source of truth), але таблиця харнесів і живі інструкції більше не перелічують Devin/Kilo.
2. **`DEVIN.md` видалено.** Єдиний тонкий wrapper - `CLAUDE.md`; `scripts/check-agents-family-sync.mjs` перевіряє `CLAUDE.md` + опційний `OPENAI.md`.
3. **Реєстр версій харнеса перенесено:** `.kilo/harness-versions.json` → `.agents/harness-versions.json` (git mv, append-only історія версій збережена). `schemaVersion` лишається `1`: layout файлу не змінився, змінився лише шлях. ADR-0072 щодо механіки чинний.
4. **Snapshot-вивід перенесено:** `.kilocode/snapshot.md` → `.agents/snapshot.md`, кеш → `.agents/snapshot.cache.json` (обидва gitignored). ADR-0071 щодо механіки чинний.
5. **Branch-конвенція у playbooks:** `devin/<unix-ts>-…` → `<harness>/…` (фактична практика: `claude/<desc>`). Історичні гілки не перейменовуються.
6. **Історія не редагується:** ADR, аудити, pr-ledger, archive, planning-worklogs, footer-логи «Last touched by Devin», `scripts/docs/author-map.json` (атрибуція devin-bot комітів у git-історії), Rule #20 (Devin-конвенція `Git_PAT` як походження чинного enforcement), regex AI-трейлерів у ai-pr-checklist, launch-фази і product-os трекери травня 2026.

## Наслідки

- Живі інструкції (AGENTS.md, CLAUDE.md, onboarding, playbooks, loop-реєстр, runbooks, скіли) не згадують Devin/Kilo як активну опцію; решта згадок у репо - історичні за дизайном.
- `.kilo/` і `.kilocode/` зникають з tracked-дерева. Локальні залишки в чекаутах (`.kilo/agent-manager.json` тощо, `.kilocode/snapshot*`) - непотріб; видалити вручну.
- Поза репо: `~/.config/kilo/` (у `kilo.json` може лежати GitHub PAT - токен відкликати на GitHub перед видаленням теки), `~/.kilo/`, `~/.kilocode/`, `~/.devin/` - видалити локально. Поза скоупом цього PR.
- Повернення будь-якого харнеса в майбутньому = рядок у таблиці `AGENTS.md` + власний wrapper; harness-neutral механіка скілів для цього не змінювалась.

## Compliance

- `pnpm lint:harness-version-freshness` і тести бампера (`scripts/__tests__/ci-bump-harness-version.test.mjs`, `check-harness-version-freshness.test.mjs`) читають новий шлях реєстру.
- `pnpm lint:agents-family-sync` перевіряє лише наявні wrappers.
- Окремого механічного гейта «без devin/kilo» не вводимо: чистка разова, нові згадки зловить review.
