---
name: sergeant-analytics
description: Use when adding or changing product analytics — PostHog events, event naming, tracking calls, dashboards-as-code manifests; UA: додаєш чи міняєш аналітичні івенти PostHog.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Продуктова аналітика (PostHog) у Sergeant

Аналітика — це «lightweight sink» з подвійним транспортом: локальний ring-buffer завжди, PostHog — лише коли виставлений `VITE_POSTHOG_KEY` (lazy dynamic import, поза критичним шляхом бандла). Не підключай `posthog-js` напряму.

## Де живуть виклики

- Єдина точка входу: `trackEvent(name, payload?)` з `apps/web/src/core/observability/analytics.ts` — fire-and-forget, ніколи не кидає і не повертає Promise на await.
- Імена івентів — лише з реєстру `ANALYTICS_EVENTS` (`@sergeant/shared`); не вигадуй inline-рядки.
- PostHog-обвʼязка: `apps/web/src/core/observability/posthog.ts` (init/identify/reset), pageviews — `PageviewTracker.tsx`.
- Дашборди — as-code: `ops/posthog/dashboards/*.json` проти схеми `ops/posthog/schema/dashboard.schema.json`; гейт `pnpm lint:posthog-manifests` (унікальні panel keys, цілісність alerts/tiles).

## Коли додавати івент

- Івент відповідає на конкретне продуктове питання (активація, retention, воронка) — не «про всяк випадок».
- Payload — маленький plain object **без чутливих даних**: жодних email, сум із привʼязкою до особи; `scrubPII`/`containsPII` — страховка, не дозвіл.
- Новий івент → додай у `ANALYTICS_EVENTS` і, якщо він живить дашборд, онови manifest у `ops/posthog/dashboards/` у тому ж PR.

## Червоні прапорці

- `posthog.capture()` напряму в компоненті — обхід ring-buffer і PII-скрабінгу.
- Await на trackEvent або обробка його «помилок» — контракт fire-and-forget.
- Івент без споживача (ні дашборда, ні питання) — шум, який хтось потім вгадує.

## Роутинг далі

- Клієнтська поверхня: `sergeant-web-ui`; серверні метрики/алерти — `sergeant-deploy-and-observability`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
