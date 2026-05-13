# Initiatives — Архів

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active — batch 2026-05-13 виконано (7 initiatives архівовано раніше запланованої дати 2026-08-02; 90-day waiting period skipped за рішенням founder-а).

Цей каталог тримає **архівовані ініціативи** — файли, що пройшли повний lifecycle `Proposed → In progress → Done → Closed → Archived` та лежали ≥90 днів без регресій / нових follow-up-ів. Архівація — це **фізичний переніс** файлу з `docs/initiatives/<file>.md` сюди, з 1-рядковим redirect-stub-ом у [`../README.md` § Архів](../README.md#архів).

## Чим це не є

- **Не tombstone для Withdrawn-ініціатив.** `Withdrawn` означає «передумови зникли, ніколи не починали реалізувати». Такі файли лишаються в активному списку у `../README.md` зі статусом `Withdrawn` для аудит-сліду; сюди не переносяться.
- **Не source of truth для канонічних правил.** Якщо ініціатива породила Hard Rule / lint-правило / ADR — канонічна копія живе у [`AGENTS.md`](../../../AGENTS.md), [`docs/governance/`](../../governance/) або відповідному ESLint-плагіні. Архівований файл — це **історичний контекст**, а не контракт.

## Як архівувати ініціативу

Покрокова процедура — у [`../README.md` § Гайдлайн → крок 6 (Архівація)](../README.md#гайдлайн-для-авторів). Коротко:

1. Перевірити: статус у файлі = `Closed`, дата переходу у `Closed` ≥ 90 днів тому, у `follow-ups.md` немає нових unchecked-пунктів з цієї ініціативи.
2. `git mv docs/initiatives/<NNNN-slug>.md docs/initiatives/archive/<NNNN-slug>.md`.
3. У `../README.md`: видалити рядок з § Нещодавно завершені, додати 1-рядковий stub у § Архів формату:
   ```
   - [archive/<NNNN-slug>.md](./archive/<NNNN-slug>.md) — archived YYYY-MM-DD; superseded by <посилання на successor / canonical home>.
   ```
4. Перевірити, що канонічні правила (Hard Rules, lint-правила, ADR-и), які ініціатива породила, все ще живі у `AGENTS.md` / `docs/governance/`. Якщо ні — спочатку винести їх туди, тоді архівувати.
5. Запустити `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` локально перед PR-ом. CI-гейт `lint:initiative-status-sync` розуміє Archive-stub-формат і не падає на «row without file».

## Batch archival schedule

### ✅ 2026-05-13 (executed early)

Сім initiatives архівовано в одному PR-і — founder прийняв рішення про fast-forward, 90-day waiting period skipped:

| Initiative                      | Done/Closed | Successor / Canonical                                                                  | Archive path                                                                   |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **0001** Module decomposition   | 2026-05-04  | Hard Rule #18 + Successor [0013](../0013-module-decomposition-round-2.md)              | [`_0001-module-decomposition.md`](./_0001-module-decomposition.md)             |
| **0004** Server observability   | 2026-05-04  | [ADR-0035](../../adr/0035-distributed-tracing-opentelemetry.md)                        | [`_0004-server-observability.md`](./_0004-server-observability.md)             |
| **0005** AI cost (prompt cache) | 2026-05-04  | [ADR-0039](../../adr/0039-anthropic-prompt-cache-policy.md)                            | [`_0005-ai-cost-and-prompt-cache.md`](./_0005-ai-cost-and-prompt-cache.md)     |
| **0007** Design-system tooling  | 2026-05-05  | Storybook live deploy + [ADR-0046](../../adr/0046-storybook-vrt-scope.md)              | [`_0007-design-system-tooling.md`](./_0007-design-system-tooling.md)           |
| **0008** Platform hardening     | 2026-05-04  | `RATE_LIMIT_POLICIES` registry + [ADR-0044](../../adr/0044-renovate-vs-dependabot.md)  | [`_0008-platform-hardening.md`](./_0008-platform-hardening.md)                 |
| **0009** Agent-OS hardening     | 2026-05-09  | AGENTS.md slim (907 → 137 LOC) + `docs/governance/rules/` (canonical Hard Rule bodies) | [`_0009-agent-os-hardening.md`](./_0009-agent-os-hardening.md)                 |
| **0012** Perfect TS strictness  | 2026-05-04  | Hard Rule #19 + `tools/tsconfig-guard/allowlist.json`                                  | [`_0012-perfect-strictness-rollout.md`](./_0012-perfect-strictness-rollout.md) |

**Verification (2026-05-13):**

- [x] Усі carry-over items закриті або передані successor-ам
- [x] Hard Rules / ADRs / lint-правила live у AGENTS.md / docs/governance/
- [x] Batch-PR побудовано (7 файлів + README оновлення + comment-refs)
- [x] `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` pass
- [x] Merge виконано 2026-05-13

## Поточний вміст

7 archived initiatives — див. таблицю вище. Канонічні правила з цих initiatives продовжують жити у [`AGENTS.md`](../../../AGENTS.md) Hard Rules + [`docs/governance/`](../../governance/) — файли нижче — **історичний контекст**, не джерело правди.
