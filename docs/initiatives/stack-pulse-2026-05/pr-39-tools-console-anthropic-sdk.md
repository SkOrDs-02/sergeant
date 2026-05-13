# PR-39: `tools/console` Anthropic SDK 0.36.3 → latest

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active — SDK вже на `^0.95.2` (міграція 0.36 → 0.95 відбулась у попередньому PR з ADR-0057); prompt caching opt-in (`ANTHROPIC_PROMPT_CACHE=1`) enable-но у `run-agent-loop`. SDK v1 GA ще не відбулась — cm. ADR-0057 § SDK v1 tracking.

|                    |                                                                    |
| ------------------ | ------------------------------------------------------------------ |
| **Severity**       | Low (L12)                                                          |
| **Linked finding** | L12 (`00-overview.md`)                                             |
| **Owner**          | TBD (sponsor: @Skords-01)                                          |
| **Effort**         | 0.5–1 день                                                         |
| **Risk**           | Low (SDK bump — but Anthropic SDK has had breaking changes before) |
| **Touches**        | `tools/console/package.json`, `tools/console/src/`                 |
| **Trigger**        | quarterly OR next time SDK 0.36.x deprecation announced            |

## Контекст

`tools/console/package.json` мав `"@anthropic-ai/sdk": "0.36.3"` (audit-доказана). На момент 2026-05-07 spec-а ми прогнозували latest ~ `1.x.x` (SDK мав GA-нути v1 десь у 2026-Q2). Прогноз не реалізувався — станом на 2026-05-13 `npm view @anthropic-ai/sdk dist-tags` показує `latest: 0.95.2` (released 2026-05-11). v1 все ще не GA-нула.

Issues:

1. v0.x SDK officially deprecated після v1 GA.
2. v1 має нові API affordances — improved streaming, MCP support, prompt caching.
3. Patch-level updates у v0.x branch suspended.

## Scope

### 1. Pre-flight ADR (small)

`docs/adr/0057-anthropic-sdk-v1-upgrade.md` — coverage matrix:

- Які SDK calls використовуються в `tools/console/src/`?
- Breaking changes від v0 → v1 (constructor signatures? methods renamed?).
- Нові features варто адопт-нути одразу (prompt caching = $$$ savings).

### 2. SDK bump

```bash
cd tools/console
pnpm add @anthropic-ai/sdk@^1.0.0
```

### 3. Code migration

`tools/console/src/agents/**/*.ts` — apply migration steps з SDK migration-guide-у.

### 4. Re-test

- Existing unit tests `tools/console/__tests__/`.
- Manual smoke: Telegram-bot startup, /command roundtrip.

### 5. Documentation

`tools/console/README.md` — version table updated.
`tools/console/docs/architecture.md` — note prompt caching opt-in (якщо використано).

## Out of scope

- Migration інших SDK у `tools/console` (telegraf, OpenAI) — окремий PR.
- Cross-bot prompt-engineering — backlog.

## Acceptance criteria (DoD)

- [x] ADR-0057 (small) з migration plan (оновлено: SDK v1 tracking секція + Prompt caching opt-in секція).
- [ ] `tools/console/package.json` має `@anthropic-ai/sdk@^1.0.0`. **Блоковано: SDK v1 не GA на 2026-05-13.** Намість того pin-нуто до `^0.95.2` (latest stable). Чекаємо v1 GA в окремому follow-up PR; трек-ємо у ADR-0057 § SDK v1 tracking.
- [x] All call-sites migrated (no v0-API references) — 0.36 → 0.95 міграція відбулась у попередньому PR з ADR-0057.
- [x] Tests pass у CI — `pnpm --filter @sergeant/console test` → 300 passed.
- [ ] Manual smoke pass — відкладено до v1 GA PR-у (поточний PR не міняє публічний API agent-loop в default-режимі).
- [x] Optional: prompt caching enabled на heavy-prompt commands — enable-но у `run-agent-loop.ts` (під env-флаг `ANTHROPIC_PROMPT_CACHE=1`); 10 нових unit-тестів у `run-agent-loop.test.ts`.

## Тести

- Existing unit tests `tools/console/__tests__/` зелені.
- Manual: `/start` Telegram command → bot reply.
- Cost-tracking: Sentry / obs-ом порівняти $/request pre-vs-post.

## Rollout

- Single PR. Bot deploy через окремий Railway service.

## Risks & mitigations

| Risk                                                   | Mitigation                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Breaking change у API → bot crash на startup           | Staged deploy: dev-env first, then prod                     |
| Prompt-caching incompatibility з certain workflow      | Feature-flag: env-var `ANTHROPIC_PROMPT_CACHE=1` для opt-in |
| Cost spike (нова billing-tier) при v1 з більшим limits | Spend-cap у Anthropic console; cost-monitoring dashboard    |

## Touchpoints (file:line)

- `tools/console/package.json` — `@anthropic-ai/sdk`
- `tools/console/src/agents/**/*.ts` — call sites
- `tools/console/__tests__/`
- `tools/console/README.md`
- `tools/console/docs/architecture.md` (якщо існує)
- `docs/adr/0057-anthropic-sdk-v1-upgrade.md` — new

## Refs

- [Anthropic SDK migration guide](https://docs.anthropic.com/en/api/migrating)
- [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- ADR-0032 tools/console architecture (existing якщо є)
