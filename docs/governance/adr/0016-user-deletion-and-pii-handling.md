# ADR-0016: Видалення користувача та поводження з PII

- **Status:** Accepted
- **Date:** 2026-04-27
- **Last validated:** 2026-09-04 by Codex against the codebase graph. **Next review:** 2026-12-20.
- **Supersedes:** —
- **Related:** [ADR-0001](./0001-monetization-architecture.md), [`dataRights.ts`](../../../apps/server/src/modules/me/dataRights.ts), [`cleanupQueue.ts`](../../../apps/server/src/modules/gdpr/cleanupQueue.ts).

## Контекст

Видалення акаунта має прибрати first-party персональні дані й лишити тільки мінімальні snapshots, необхідні для завершення зовнішнього cleanup. Soft-delete з пільговим періодом не реалізовано, тому його не можна описувати як поточну поведінку.

## Рішення

Реалізований потік — негайний hard delete.

1. І Better Auth hook, і `DELETE /api/me` викликають `deleteUserData()`.
2. Перед транзакцією для релевантних платіжних провайдерів best-effort запитується скасування. Помилка провайдера не зупиняє видалення.
3. В одній транзакції потік знімає snapshot email та, за наявності, Stripe customer ID; додає по одному external-cleanup запису на підтримуваний сервіс; скасовує локальні активні підписки; видаляє `ai_usage_daily` для `u:<userId>`; потім видаляє рядок `user`.
4. Залежні користувацькі записи прибираються foreign-key cascade. `ai_usage_daily.subject_key` не є FK, тому чиститься явно: per-user токен не переживає видалення.
   - **Доповнення 2026-09-16 (аудит бекенду).** Пункт 4 описував намір, але не мав жодного механічного забезпечення, і три таблиці з нього тихо випали: `fizruk_injuries` (зона травми + вільний текст про неї), `fizruk_custom_activities` і `ai_memory_ingest_failed` (`payload_json` із текстом, з якого будувалась памʼять). Усі три мали `user_id` **без FK**, тож каскад їх не діставав, а явного `DELETE` для них ніхто не написав — рядки переживали власника назавжди. Відтворено на чистій базі; закрито міграцією [`141_orphan_user_rows_fk.sql`](../../../apps/server/src/migrations/141_orphan_user_rows_fk.sql), яка спершу прибирає сиріт, потім вішає `ON DELETE CASCADE`.
   - Щоб пункт 4 більше не розходився з фактом, інваріант тепер гейтиться: [`141-142-user-scoped-cascade.test.ts`](../../../apps/server/src/migrations/__tests__/141-142-user-scoped-cascade.test.ts) ставить усі міграції на живий Postgres і падає, якщо зʼявилась таблиця з `user_id` без FK і без запису в `NO_FK_ALLOWLIST`.
   - **Навмисні винятки** (в allowlist, кожен із причиною): `gdpr_cleanup_queue` — існує саме щоб пережити видалення й доробити зовнішній cleanup; `email_unsubscribes` — opt-out мусить пережити акаунт, інакше видалення й повторна реєстрація тихо знімають відмову від розсилки; `feedback_entries` — `user_id` nullable, збереження тексту після видалення є продуктовим рішенням.
   - Окремо: каскад виконує `DELETE FROM <дитина> WHERE user_id = $1` **без** предиката `deleted_at IS NULL`, тому поширені часткові індекси `(user_id, deleted_at) WHERE deleted_at IS NULL` для нього непридатні (перевірено `EXPLAIN` під `enable_seqscan = off` — план лишався Seq Scan). Вісімнадцять каскадних дітей отримали беззастережний індекс у [`142_cascade_user_id_indexes.sql`](../../../apps/server/src/migrations/142_cascade_user_id_indexes.sql); без нього запит на видалення акаунта тим повільніший, чим більше в системі ЧУЖИХ даних, і врешті впирається в `statement_timeout`.
5. External queue навмисно тримає передвидалювальні user ID, email і опційний Stripe customer ID до завершення vendor-cleanup. In-process poller увімкнений за замовчуванням щогодини й записує метрики глибини черги.

## Наслідки

- Видалення в застосунку незворотне: немає реалізованих 30-денного soft-delete, restore-потоку чи hard-delete cron.
- Зовнішній cleanup асинхронний і retryable. Успішний local delete не доводить, що кожен vendor уже стер дані.
- Повторний delete безпечний: якщо `user` уже немає, новий snapshot для external cleanup не створюється.

## Pending policy та перевірки

- Retention для логів, backups і даних кожного external vendor лишається policy/operations роботою. Цей ADR не заявляє конкретний GDPR або український юридичний дедлайн.
- Ownership алертів, ескалація stuck-записів і production-доказ, що vendor credentials можуть виконати видалення, потребують окремої операційної перевірки.
- Майбутня політика soft-delete чи restore вимагатиме нового рішення та відповідної семантики авторизації/сесій.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                            | Merged     |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ---------- |
| [#95](https://github.com/zaebal-beep/sergeant/pull/95) | fix(server): закрити знахідки аудиту серверного шару, БД і синку | 2026-09-17 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
