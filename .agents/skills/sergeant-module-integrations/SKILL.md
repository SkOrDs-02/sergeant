---
name: sergeant-module-integrations
description: Use when the task touches external integrations — Silpo receipts import, Telegram bots, audio transcription, inbound webhooks; UA: задача про silpo/telegram/transcribe/webhooks.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Integrations — власник інфра-модуля

Покриває чотири зовнішні поверхні: Silpo (імпорт чеків), Telegram (боти/репортинг), transcribe (аудіо → текст), webhooks (вхідні події). Інфра-модуль без канону: контекст і журнал — тут (рішення 6 спеки `docs/90-work/planning/specs/archive/agent-module-owners.md`).

## Контекст

- Silpo: імпорт чеків у finyk/nutrition — `apps/server/src/modules/silpo/` (branchContext, cart, фікстури зі снапшотами).
- Telegram: `apps/server/src/modules/telegram/` (waitlist-бот, beta-тексти); структура каналів репортингу — [ADR-0030](../../../docs/04-governance/adr/0030-telegram-reporting-channel-structure.md).
- Transcribe: `apps/server/src/modules/transcribe/` з USD-капом витрат (`usdCap.ts`).
- Webhooks: `apps/server/src/modules/webhooks/` — запис, replay, retention-полер вхідних подій; автоматизаційні воркфлоу — джерело істини n8n ([ADR-0026](../../../docs/04-governance/adr/0026-n8n-workflow-source-of-truth.md)).

## Інваріанти модуля

- Зовнішній провайдер може впасти — кожен інтеграційний шлях має явний error-шлях і не блокує основний продуктовий потік.
- Секрети інтеграцій — лише env (Coolify), у логах — редаговані поля (Hard Rule #21, pino redaction).
- Платні зовнішні виклики (transcribe) — під капом витрат; не знімай кап без рішення maintainer-а.
- Вхідні webhook-події — ідемпотентні: запис + replay замість повторної обробки на льоту.

## Журнал рішень

| Дата       | Рішення                                                          | Джерело/ADR                                                                                   |
| ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-08-19 | Silpo-інтеграція чеків приїхала в main (розчинена в finyk/nutrition-чанках) | [PR #819](https://github.com/Skords-01/Sergeant/pull/819)                                     |
| 2026-05-02 | Telegram-репортинг — фіксована структура каналів для n8n         | [ADR-0030](../../../docs/04-governance/adr/0030-telegram-reporting-channel-structure.md)      |

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api`; деплой/env — `sergeant-deploy-and-observability`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
