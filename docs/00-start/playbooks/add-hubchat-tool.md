# Playbook: Додати HubChat Tool

> **Last touched:** 2026-08-28 by @github-actions[bot]. **Next review:** 2026-12-15.
> **Status:** Active

**Trigger:** "Дай асистенту нову дію" / "Додай tool в HubChat" / зміна серверного tool definition, клієнтського executor-а або action card для HubChat orchestration.

## Owner surface

- Primary surfaces: `apps/server/src/modules/chat/**`, `apps/web/src/core/lib/chatActions/**`
- Governing skill: `sergeant-module-ai`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-module-ai`.
- Якщо tool торкає auth, сесію або життєвий цикл акаунта, додатково звір `better-auth-best-practices`.
- Якщо tool робить запис у БД або викликає зовнішнє API, звір відповідний skill для тієї поверхні (`sergeant-server-api`, `sergeant-data-and-migrations`).

## Steps

### 1. Визнач tool contract

- `name`, `description`, схема вхідних даних, очікуваний side effect, коротке повідомлення про успіх.
- Виріши, чи це безпечний tool, ризиковий tool, чи суто інформаційний tool — від цього залежить, як його позначити в UI.
- Переконайся, що `description` допомагає моделі викликати його правильно, а не рекламно описує можливість. Уникай маркетингової мови — пиши про умови, у яких tool слід викликати, і про вхідні поля.

### 2. Додай серверне визначення

- Розмісти tool у правильному `toolDefs/<domain>.ts` — за відповідним доменом, до якого він належить.
- Зберігай domain ownership: cross-module tool-и не клади у випадковий модуль; для них використовуй `toolDefs/_shared.ts` або новий доменний файл.
- Перевір prompt-cache: якщо змінюєш великий спільний список tool-ів, кешований префікс інвалідується — деплой може стати дорожчим, а перші відповіді — повільнішими.

### 3. Додай клієнтський executor

- Додай типізовану дію (action) у відповідний реєстр.
- Реалізуй executor або локальний action handler — той самий шар, де живуть інші tool-и того ж домену.
- Не роби сирого звертання до `localStorage` — використовуй Sergeant-обгортки (`ls`, `lsSet`, typed-store).
- Не ховай side effect-и сервера всередині клієнтської оркестрації без явного контролю — інакше тестова матриця стає крихкою, а помилки шукати важко.

### 4. Додай user-facing картку або фідбек

- Якщо tool видимий користувачу, онови action card і відповідний title mapping.
- Для ризикових tool-ів додай явне маркування — щоб користувач бачив, що дія незворотна або з нетривіальними наслідками.
- Стан успіху і стан помилки мають відрізнятися і текстом, і тоном — користувач не повинен гадати, що саме сталося.

### 5. Додай тести і regression coverage

- Сценарій успіху (happy path).
- Сценарій помилки (error path) — мінімум один: некоректний вхід або відмова сервера.
- Маркування ризикового tool-а або форма реєстру tool-ів, якщо це частина поведінки, що тестується окремо.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Визначення tool-а, executor і картка узгоджені між собою (один і той самий name, той самий контракт)
- [ ] Ризиковий tool позначено правильно, якщо застосовно
- [ ] Немає сирого звертання до browser storage і несинхронізованих side-effect-ів

## When not to use this playbook

- Потрібно лише підкрутити формулювання системного промпта без нової tool-поверхні.

## Related playbooks and skills

- Skill: `sergeant-module-ai`
- Skill: `sergeant-web-ui`
- Skill: `sergeant-server-api`

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| [#895](https://github.com/Skords-01/Sergeant/pull/895) | fix(agents): полірування агентного шару після розкатки module-owners | 2026-08-28 |
| [#892](https://github.com/Skords-01/Sergeant/pull/892) | feat(agents): module-owner і службові Claude-агенти                  | 2026-08-27 |
| [#891](https://github.com/Skords-01/Sergeant/pull/891) | feat(agents): скіли-дисципліни                                       | 2026-08-27 |
| [#890](https://github.com/Skords-01/Sergeant/pull/890) | feat(agents): інфра module-скіли і nested-роутинг                    | 2026-08-27 |
| [#889](https://github.com/Skords-01/Sergeant/pull/889) | feat(agents): продуктові module-owner скіли                          | 2026-08-27 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 5 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
