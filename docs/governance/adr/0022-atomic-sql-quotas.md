# ADR-0022: Атомарні денні AI-квоти у PostgreSQL

- **Status:** Accepted
- **Date:** 2026-04-27
- **Last validated:** 2026-09-04 against the codebase graph. **Next review:** 2026-12-03.
- **Supersedes:** —
- **Related:** [`aiQuota.ts`](../../../apps/server/src/modules/chat/aiQuota.ts), [`002_ai_usage_daily.sql`](../../../apps/server/src/migrations/002_ai_usage_daily.sql), [ADR-0085](./0085-free-ai-quota-five-per-day.md), [ADR-0086](./0086-no-anonymous-ai-sign-in-required.md), [ADR-0016](./0016-user-deletion-and-pii-handling.md).

## Контекст

Ліміт AI не може реалізовуватися read-then-write перевіркою: паралельні
запити можуть побачити той самий залишок і разом перевищити allowance.
Квота потребує durable per-user стану, який не губиться при рестарті процесу
та не залежить від IP або in-memory lock.

## Рішення

`ai_usage_daily` є обліковим сховищем для автентифікованого subject key
`u:<userId>`. `consumeQuota()` змінює один рядок conditional PostgreSQL
upsert-ом: якщо новий count перевищує limit, `RETURNING` не дає рядка і
middleware відхиляє запит. Це єдина межа конкурентного списання; не потрібні
`SELECT FOR UPDATE`, Redis mutex чи retry loop.

Ключ таблиці включає subject, usage day, bucket та endpoint. `default` і
`tool:<name>` можуть бути окремими bucket-ами; конкретний route не встановлює
собі власний plan allowance. `effectiveLimits()` визначає entitlement:
поточний Free limit — 5 AI-запитів на добу, Pro — `null` (unlimited), як
ратифіковано ADR-0085.

Списання, що не дійшло до корисної upstream-відповіді, може бути повернене
ідемпотентним refund. Операційна поведінка при недоступній БД має лишатися
явною у коді та метриках; цей ADR не проголошує fail-open/fail-closed policy
для нового AI route без відповідної реалізації й тесту.

## Межі

- Anonymous IP subject key retired: AI route вимагає сесію за ADR-0086.
- `AI_DAILY_*` environment compatibility knobs не замінюють plan entitlement.
- `ai_usage_daily.subject_key` не має FK, тому рядки `u:<userId>` очищуються
  явним кроком під час deletion account за ADR-0016.
- Weekly digest, presets і майбутні дорогі маршрути входять у квоту лише коли
  це явно змонтовано й протестовано; наявність таблиці не робить їх
  автоматичними споживачами.

## Наслідки

- Паралельні запити не можуть перевищити limit одного облікового рядка.
- Єдині зміни чисел ліміту проходять через `effectiveLimits()` і policy ADR,
  а не через inline constants у handlers.
- Міграція на інший back-end квоти можлива лише зі збереженням цієї атомарної
  семантики, reset/retention і user-deletion path.
