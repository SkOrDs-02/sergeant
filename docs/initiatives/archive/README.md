# Initiatives — Архів

> **Last validated:** 2026-05-11 by @Skords-01. **Next review:** 2026-08-09.
> **Status:** Archive prep — batch 2026-08-02 scheduled (6/6 initiatives ready).

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

### 📅 2026-08-02 (22 дні)

Шість initiatives готові до архівації (≥90 днів від Done/Closed):

| Initiative                      | Done/Closed | Days | Successor / Canonical                                           | Action                                                   |
| ------------------------------- | ----------- | ---- | --------------------------------------------------------------- | -------------------------------------------------------- |
| **0001** Module decomposition   | 2026-05-04  | 90   | Successor: 0013                                                 | → `_0001-module-decomposition.md`                        |
| **0004** Server observability   | 2026-05-04  | 90   | [ADR-0035](../../adr/0035-distributed-tracing-opentelemetry.md) | → `_0004-server-observability.md`                        |
| **0005** AI cost (prompt cache) | 2026-05-04  | 90   | [ADR-0039](../../adr/0039-anthropic-prompt-cache-policy.md)     | → `_0005-ai-cost-and-prompt-cache.md`                    |
| **0008** Platform hardening     | 2026-05-04  | 90   | `RATE_LIMIT_POLICIES` registry                                  | → `_0008-platform-hardening.md`                          |
| **0012** Perfect TS strictness  | 2026-05-04  | 90   | Hard Rule #19 + allowlist                                       | → `_0012-perfect-strictness-rollout.md`                  |
| **0007** Design-system tooling  | 2026-05-05  | 89   | Storybook live deployment                                       | → `_0007-design-system-tooling.md` (defer to 2026-08-03) |

**Prep checklist:**

- [ ] Перевірити, що усі carry-over items закриті / передані successors
- [ ] Перевірити, що Hard Rules / ADRs / lint-правила вже live у AGENTS.md / docs/governance/
- [ ] Побудувати batch-PR для одночасного переносу 6 файлів
- [ ] `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` pass
- [ ] Merge до 2026-08-03

## Поточний вміст

_Архів поки порожній; batch 2026-08-02 в підготовці._
