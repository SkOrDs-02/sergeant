# ADR-0016: Видалення користувача та поводження з PII

- **Status:** Superseded by ADR-0098
- **Date:** 2026-04-27
- **Last validated:** 2026-09-04 by Codex against the codebase graph. **Next review:** 2026-12-20.
- **Supersedes:** —
- **Related:** [ADR-0001](./0001-monetization-architecture.md), [`dataRights.ts`](../../../apps/server/src/modules/me/dataRights.ts), [`cleanupQueue.ts`](../../../apps/server/src/modules/gdpr/cleanupQueue.ts).

> **Superseded by [ADR-0098](./0098-account-deletion-grace-window.md) — але ЧАСТКОВО, і різницю варто прочитати перед тим, як спиратись на цей документ.**
>
> Замінено лише **момент і незворотність** видалення: з 2026-09-21 `DELETE /api/me` не видаляє, а ставить мітку `deletion_requested_at`, і незворотну частину через 30 днів виконує добивач. Твердження «Реалізований потік — негайний hard delete» і «Видалення в застосунку незворотне» нижче — історичний запис станом на 2026-04-27, а не поточна поведінка. Better-Auth-хук з пункту 1 вимкнений.
>
> **Механіка самого очищення лишається чинною і живе тут** — ADR-0098 на неї посилається, а не переписує: вміст незворотної транзакції (пункт 3), каскад і інваріант «немає таблиці з `user_id` без FK» (пункт 4 з усіма доповненнями), черга зовнішнього очищення (пункт 5). Правки цих пунктів ідуть сюди.

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
   - **Уточнення реалізації 2026-10-20.** Після підтвердженого cleanup воркер атомарно ставить `completed_at` і прибирає `email`, `stripe_customer_id`, `last_error`. Міграція [`160_gdpr_cleanup_email_redaction.sql`](../../../apps/server/src/migrations/160_gdpr_cleanup_email_redaction.sql) дозволяє `email = NULL` лише завершеним записам: початковий `NOT NULL` з міграції 113 блокував цей UPDATE. Реальні retry, lease-конкуренція та редакція snapshot-а перевіряються в [`cleanupWorker.integration.test.ts`](../../../apps/server/src/modules/gdpr/cleanupWorker.integration.test.ts).

   - **Рішення власника 2026-10-23 (аудит `priv-13`): стеля 30 днів на email.** «До завершення vendor-cleanup» з пункту 5 не мало верхньої межі: pending-рядок, чий вендор не налаштований (sentry/resend без токенів), і exhausted-рядок (`next_attempt_at = 'infinity'`) тримали email вічно. Тепер кожен батч воркера (той самий `GdprCleanupPoller`, нового воркера немає) після purge виконує `UPDATE gdpr_cleanup_queue SET email = NULL WHERE email IS NOT NULL AND created_at < NOW() - 30 days`. Рядок лишається; `completed_at` не чіпається, крім `resend` (нижче). Міграція [`164_gdpr_cleanup_pending_email_nullable.sql`](../../../apps/server/src/migrations/164_gdpr_cleanup_pending_email_nullable.sql) знімає CHECK `gdpr_cleanup_queue_pending_email` з 160, який забороняв `email = NULL` для pending. Видалити контакт у Resend без email неможливо, тож незавершений `resend`-рядок тим самим UPDATE закривається `completed_at = NOW()` і дає warn `gdpr_cleanup_resend_closed_without_email` (рішення власника 2026-10-23): контакт у Resend міг лишитись, але вічного щогодинного перепланування немає. Стеля не залежить від того, чи налаштовані токени.

## Наслідки

- Видалення в застосунку незворотне: немає реалізованих 30-денного soft-delete, restore-потоку чи hard-delete cron. **Більше не так — див. [ADR-0098](./0098-account-deletion-grace-window.md).**
- Зовнішній cleanup асинхронний і retryable. Успішний local delete не доводить, що кожен vendor уже стер дані.
- Повторний delete безпечний: якщо `user` уже немає, новий snapshot для external cleanup не створюється.

## Pending policy та перевірки

- Retention для логів, backups і даних кожного external vendor лишається policy/operations роботою. Цей ADR не заявляє конкретний GDPR або український юридичний дедлайн.
- Ownership алертів, ескалація stuck-записів і production-доказ, що vendor credentials можуть виконати видалення, потребують окремої операційної перевірки.
- Майбутня політика soft-delete чи restore вимагатиме нового рішення та відповідної семантики авторизації/сесій. **Це рішення ухвалено — [ADR-0098](./0098-account-deletion-grace-window.md).**

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                  | Merged     |
| -------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| [#1571](https://github.com/SkOrDs-02/sergeant/pull/1571) | fix(server): unblock GDPR redaction and cover OAuth storage boundaries | 2026-10-20 |
| [#95](https://github.com/zaebal-beep/sergeant/pull/95)   | fix(server): закрити знахідки аудиту серверного шару, БД і синку       | 2026-09-17 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
