# Playbook: Додати HubChat Tool

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

**Trigger:** "Дай асистенту нову дію" / "Додай tool в HubChat" / зміна серверного tool definition, клієнтського executor-а або action card для HubChat orchestration.

## Owner surface

- Primary surfaces: `apps/server/src/modules/chat/**`, `apps/web/src/core/lib/chatActions/**`
- Governing skill: `sergeant-hubchat`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-hubchat`.
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
- Потрібно змінити внутрішнього Telegram-агента в `tools/console`, а не HubChat — це інша поверхня з власним playbook-ом.

## Related playbooks and skills

- [modify-console-agent.md](./modify-console-agent.md)
- Skill: `sergeant-hubchat`
- Skill: `sergeant-web-ui`
- Skill: `sergeant-server-api`
