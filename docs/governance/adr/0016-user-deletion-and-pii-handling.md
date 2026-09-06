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
5. External queue навмисно тримає передвидалювальні user ID, email і опційний Stripe customer ID до завершення vendor-cleanup. In-process poller увімкнений за замовчуванням щогодини й записує метрики глибини черги.

## Наслідки

- Видалення в застосунку незворотне: немає реалізованих 30-денного soft-delete, restore-потоку чи hard-delete cron.
- Зовнішній cleanup асинхронний і retryable. Успішний local delete не доводить, що кожен vendor уже стер дані.
- Повторний delete безпечний: якщо `user` уже немає, новий snapshot для external cleanup не створюється.

## Pending policy та перевірки

- Retention для логів, backups і даних кожного external vendor лишається policy/operations роботою. Цей ADR не заявляє конкретний GDPR або український юридичний дедлайн.
- Ownership алертів, ескалація stuck-записів і production-доказ, що vendor credentials можуть виконати видалення, потребують окремої операційної перевірки.
- Майбутня політика soft-delete чи restore вимагатиме нового рішення та відповідної семантики авторизації/сесій.
