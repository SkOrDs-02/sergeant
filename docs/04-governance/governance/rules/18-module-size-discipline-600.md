# Rule 18 — Module-size discipline — `max-lines: 600` for web TS/TSX and server TS/JS

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-06-05 by @Skords-01
> **Next review:** 2026-09-01
> **Status:** Active

> Per-rule canonical body for Hard Rule #18. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/04-governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `apps/server/src/**`

## Enforced by

- **convention** — eslint.config.js → max-lines: [error, { max: 600, skipBlankLines: true, skipComments: true }] (scoped to `apps/web/src/**/*.{ts,tsx}` and `apps/server/src/**/*.{js,ts}`; tests, `__tests__/**` exempt)
- **doc** — docs/90-work/initiatives/archive/\_0001-module-decomposition.md (decomposition queue — closed)

## Why / What is enforced

> Why a hard rule? Топ-15 файлів `apps/web/src/**` мали ≥600 LOC і одночасно тримали стейт, ефекти, бізнес-правила, навігацію та UI — рев'ю стає неможливим, регресії множаться, нові контриб'ютори не знають куди шукати. Прецедент — `apps/server/src/modules/chat/` (`chat.ts` thin orchestrator + `tools.ts` + `coach.ts` + `aiQuota.ts` + `toolMetrics.ts` + `toolDefs/`) довів цінність декомпозиції в продакшні. Без жорсткого ліміту декомпозиція — це постійний «уторгований борг» (зробили — наповзло знову).

**Rule.** Кожен `.ts` / `.tsx` файл під `apps/web/src/**` та кожен `.js` / `.ts` файл під `apps/server/src/**` мають мати ≤ 600 LOC (skipBlankLines + skipComments). Перевищення — `error` у `pnpm lint`. Тести (`*.{test,spec}.{ts,tsx}`, `__tests__/**`) виключені.

```js
// eslint.config.js — see initiative 0001 for the canonical block
{
  files: ["apps/web/src/**/*.{ts,tsx}"],
  ignores: [
    "apps/web/src/**/*.test.{ts,tsx}",
    "apps/web/src/**/*.spec.{ts,tsx}",
    "apps/web/src/**/__tests__/**",
    "apps/web/src/generated/**",
  ],
  rules: {
    "max-lines": [
      "error",
      { max: 600, skipBlankLines: true, skipComments: true },
    ],
  },
}
{
  files: ["apps/server/src/**/*.{js,ts}"],
  ignores: [
    "apps/server/src/**/*.test.{js,ts}",
    "apps/server/src/**/__tests__/**",
  ],
  rules: {
    "max-lines": [
      "error",
      { max: 600, skipBlankLines: true, skipComments: true },
    ],
  },
}
```

**Allowlist (закрито).** Декомпозиція завершена в межах ініціативи [0001](../../../90-work/initiatives/archive/_0001-module-decomposition.md) (closed) — окремого allowlist-блоку файлів-монолітів у `eslint.config.js` більше **немає**: `max-lines: 600` діє на весь `apps/web/src/**` та `apps/server/src/**` без винятків (виключені лише `*.{test,spec}` / `__tests__/**` / `generated/**`). Метрику «Файлів ≥600 LOC: 16 → 11 → ≤ 2» досягнуто, тому правило промовано з `active-initiative` у `lint-enforced-convention`. Якщо колись знадобиться тимчасовий виняток — його додають свідомо + апрув ревьюерів (розпухлий назад файл > 600 LOC падає).

**Як декомпонувати.** Розкладаємо за роллю, не за алфавітом: окремо state (custom hook / `useReducer` / state-machine), окремо ефекти (один `useEffect` = один named hook), окремо UI (presentational sub-components без логіки). Прецедент — `apps/server/src/modules/chat/` (`chat.ts` thin orchestrator + `tools.ts` + `coach.ts` + `aiQuota.ts` + `toolMetrics.ts` + `toolDefs/`) довів цінність декомпозиції в продакшні. Без жорсткого ліміту декомпозиція — це постійний «уторгований борг» (зробили — наповзло знову).

**Scope rationale.**

- `apps/mobile/**` — поза правилом (mobile-стратегія обговорюється в [`docs/90-work/initiatives/archive/_0002-mobile-platform-decision.md`](../../../90-work/initiatives/archive/_0002-mobile-platform-decision.md); декомпозиція ≠ заморозка платформи).
- `packages/**/src/**` — поза правилом (бібліотечні файли — публічний API, поріг для них інший; зачепимо в окремій ініціативі).

**Що блокує:**

- Новий `apps/web/src/**/*.tsx` ≥ 600 LOC падає на `pnpm lint` — mandatory у CI (Hard Rule #15).
- Новий `apps/server/src/**/*.{js,ts}` ≥ 600 LOC падає на `pnpm lint` — mandatory у CI (Hard Rule #15).
- Декомпонований файл, який «розпух» назад > 600 LOC, теж падає (allowlist треба свідомо знову додати + апрув ревьюерів).

**What this rule does NOT block:**

- Тимчасові experiment-файли в `apps/web/src/generated/**` або в test-fixture-ах.
- Декомпозовані файли під 600 LOC (rule passes silently).

## Related

- **doc** — docs/90-work/initiatives/archive/\_0001-module-decomposition.md
- **agents** — #18
