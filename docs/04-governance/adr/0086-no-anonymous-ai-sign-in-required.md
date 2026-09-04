# ADR-0086: AI вимагає автентифікованої сесії

- **Status:** Accepted
- **Last validated:** 2026-09-04 by Codex (звірка графа коду й джерел). **Next review:** 2026-12-03.
- **Date:** 2026-08-24
- **Deciders:** @SkOrDs-02
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/routes/chat.ts`](../../../apps/server/src/routes/chat.ts)
  - [`apps/server/src/http/requireSession.ts`](../../../apps/server/src/http/requireSession.ts)
  - [`apps/server/src/modules/chat/aiQuota.ts`](../../../apps/server/src/modules/chat/aiQuota.ts)
  - [`apps/web/src/core/hub/chat/ChatAuthGate.tsx`](../../../apps/web/src/core/hub/chat/ChatAuthGate.tsx)
  - [ADR-0085](./0085-free-ai-quota-five-per-day.md)

## Контекст

IP-keyed anonymous quota не була ні durable identity, ні значущою cost boundary.
AI request містить client-controlled context і витрачає upstream provider budget,
тож це не public proxy. IPv6 rotation та shared network addresses також роблять
IP allowance непридатним product identity.

## Рішення

Кожен AI route стоїть за `requireSession()` до AI quota middleware. `/api/chat`
показує потрібний порядок:

1. резолв сесії;
2. per-user burst/sustained rate limit;
3. upstream key і plan-based daily quota;
4. handler.

Неавтентифікований chat request отримує 401 до rate або daily quota handling.
Клієнт дає явний sign-in recovery path через `ChatAuthGate` і спільне
authentication-required message.

Залишкова null-user гілка quota code — defensive handling transient другого
session lookup після того, як route вже прийняв сесію. Вона fallback-иться на
Free cap і не є anonymous feature.

## Наслідки

- `AI_DAILY_ANON_LIMIT` та anonymous IP quota retired і не можуть повертатися
  конфігурацією.
- Plan-aware quotas і request attribution використовують authenticated user ID.
- Анонімна demo-поверхня, якщо колись потрібна, вимагатиме нового ADR з non-IP
  identity, власним provider budget і явною context-safety boundary.

## Межа верифікації

Chat route і його тести мають зберігати session middleware перед rate та quota
middleware. Клієнтські тести мають лишати видимий, практичний sign-in recovery
для 401, а не зводити його до generic access-denied error.
