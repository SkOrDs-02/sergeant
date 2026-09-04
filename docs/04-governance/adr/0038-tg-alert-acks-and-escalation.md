# ADR-0038: Стан Telegram alert acknowledgement та escalation

- **Status:** Accepted
- **Last validated:** 2026-09-04 by Codex (звірка графа коду й джерел). **Next review:** 2026-12-03.
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`031_tg_alert_acks.sql`](../../../apps/server/src/migrations/031_tg_alert_acks.sql)
  - [`063_tg_alert_acks_escalation_tiers.sql`](../../../apps/server/src/migrations/063_tg_alert_acks_escalation_tiers.sql)
  - [`apps/server/src/modules/alerts/store.ts`](../../../apps/server/src/modules/alerts/store.ts)
  - [`apps/server/src/routes/internal/alerts.ts`](../../../apps/server/src/routes/internal/alerts.ts)
  - [Runbook ескалації alert-ів](../../03-operations/observability/runbook.md)

## Історичний контекст

Первісна пропозиція описувала OpenClaw/n8n topology та одну 15-хвилинну
ескалацію. Ці назви компонентів і твердження про майбутні workflow — історичні.
Стійка частина рішення — accountability record posted alert-а та ідемпотентні
state transitions, власником яких є сервер.

## Рішення

`tg_alert_acks` має один рядок на стабільний `alert_id`. Posting ідемпотентний;
acknowledgement та кожен escalation stamp встановлюються раз. Сервер дає
автентифіковані internal endpoints для post, acknowledge, pending list,
escalation/repeat/Sentry-warning, snooze, history та Telegram shipper.

| Подія                     | Записаний стан                              | Цільовий поріг                 |
| ------------------------- | ------------------------------------------- | ------------------------------ |
| acknowledgement оператора | `ack_at`, `ack_by_tg_user_id`, `ack_action` | дія користувача                |
| перша ескалація           | `escalated_at`                              | 15 хвилин без acknowledgement  |
| repeat reminder           | `repeated_at`                               | 60 хвилин без acknowledgement  |
| Sentry warning            | `sentry_warned_at`                          | 120 хвилин без acknowledgement |
| тимчасове придушення      | `snoozed_until_at`                          | дія оператора                  |

Pending queries використовують filters acknowledgement, попереднього tier та
snooze, тому retry не створює той самий transition двічі. Серверна мутація —
межа idempotency; external scheduler не може покладатися лише на власний dedup.

## Статус реалізації

Database schema, store, route handlers і route tests реалізовані. n8n
decommissioned за ADR-0090, тому він не є ані scheduler-ом, ані предметом
валидації. У цьому checkout немає перевіреного production trigger-а, який
періодично викликає escalation endpoints; ownership запуску, schedule activation
та end-to-end Telegram smoke лишаються операційним pending. ADR не має називати
жоден іменований trigger shipped, доки немає такого доказу.

## Наслідки

- Alert acknowledgement — operational data, а не chat-tool side effect.
- P0 delivery може обійти founder mute; нижчі severity можуть пропускатись у
  mute. Ця політика живе в поточному internal send route.
- Новий escalation threshold або delivery channel потребує ідемпотентного
  persisted transition та перевіреного scheduler/callback wiring.
