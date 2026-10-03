# ADR-0098: Видалення акаунта через 30-денне вікно на скасування

- **Status:** Accepted
- **Date:** 2026-09-23
- **Last validated:** 2026-09-23
- **Next review:** 2027-03-31
- **Deciders:** @Skords-01
- **Supersedes:** ADR-0016 (у частині моменту й незворотності видалення; механіка очищення PII з ADR-0016 лишається чинною — див. § Decision, «Що переходить з ADR-0016 без змін»)
- **Related:**
  - [ADR-0016](./0016-user-deletion-and-pii-handling.md) — попереднє рішення: негайний hard delete.
  - [ADR-0017](./0017-better-auth-choice-and-session-model.md) — сесійна модель, яку гасить прохання про видалення.
  - [ADR-0089](./0089-job-substrates-outbox-broker-timer.md) — субстрат періодичних задач (чому добивач це in-process timer, а не BullMQ).
  - [`docs/work/specs/user-deletion-grace-window.md`](../../work/specs/user-deletion-grace-window.md) — спека реалізації.

---

## Context and Problem Statement

[ADR-0016](./0016-user-deletion-and-pii-handling.md) зафіксував **негайний hard delete**: `DELETE /api/me` в одній транзакції знімав snapshot email, ставив у чергу зовнішнє очищення, скасовував підписки і виконував `DELETE FROM "user"`, а каскади зносили решту. У § Наслідки того ADR це названо прямо: «Видалення в застосунку незворотне: немає реалізованих 30-денного soft-delete, restore-потоку чи hard-delete cron», а в § Pending — «Майбутня політика soft-delete чи restore вимагатиме нового рішення».

Цей ADR і є тим новим рішенням. Проблема, яку воно закриває:

1. **Помилку не можна відкотити.** Кнопка видалення незворотна для людини, яка натиснула її випадково, у стані, про який потім пожалкує, або не зрозумівши наслідків.
2. **Вкрадена сесія знищувала акаунт остаточно.** До вікна максимум, який могла зробити людина після компромісу, — це поновити акаунт з нуля. Вікно робить атаку відкотною.
3. **Планку тримав не той шлях.** Живим шляхом був `POST /api/auth/delete-user` (Better Auth) через хук `user.deleteUser.beforeDelete`, і саме там стояла перевірка пароля.

Реалізація вже в коді з 2026-09-21 (міграція 145 і далі), тож цей запис фіксує ухвалене рішення, а не пропонує його вперше. Він існує тому, що ADR-0016 лишався `Accepted` і описував протилежний потік — розбіжність, яку сама спека назвала residual-ом «статус ADR-0016 окремим PR».

## Considered Options

1. **Вікно на самому хуку Better Auth** — лишити `POST /api/auth/delete-user` живим шляхом і не пускати видалення з `beforeDelete`.
2. **Вікно у власному роуті, хук вимкнено** — `DELETE /api/me` позначає акаунт, фоновий добивач через 30 днів виконує ту саму незворотну функцію.
3. **Do nothing** — лишити негайне видалення, як описує ADR-0016.

## Decision

Обрано варіант 2.

**Прохання видалити акаунт стає відкладеним.** `DELETE /api/me` ([`routes/me.ts`](../../../apps/server/src/routes/me.ts)) більше нічого не видаляє:

- ставить мітку `deletion_requested_at` у таблиці `"user"` (міграція [`145_user_deletion_grace_window.sql`](../../../apps/server/src/migrations/145_user_deletion_grace_window.sql), частковий індекс `WHERE deletion_requested_at IS NOT NULL`);
- гасить сесії на всіх пристроях (`DELETE FROM session WHERE user_id = $1`);
- скасовує активні підписки в день прохання, а не в день добивання: людина не платить за акаунт, який просила видалити;
- відповідає `{ ok, deletedAt, scheduledPurgeAt }` ([`MeDeleteResponseSchema`](../../../packages/shared/src/schemas/api.ts)), де `deletedAt` лишається під старим імʼям і означає момент прохання.

Ідемпотентність — через `AND deletion_requested_at IS NULL` в `UPDATE`: повторний виклик не зсуває дедлайн уперед, тобто вікно неможливо подовжувати нескінченно. Повторний виклик віддає **першу** мітку, інакше відповідь показала б дедлайн, якого сервер не дотримається.

**Незворотну частину виконує добивач.** `purgeUserData` — та сама функція, що раніше бігла синхронно — тепер викликається з [`modules/me/deletionPoller.ts`](../../../apps/server/src/modules/me/deletionPoller.ts) для рядків, де `deletion_requested_at < NOW() - ACCOUNT_DELETION_GRACE_DAYS`. Вікно — 30 днів, одне джерело правди [`packages/shared/src/lib/accountDeletion.ts`](../../../packages/shared/src/lib/accountDeletion.ts) (`ACCOUNT_DELETION_GRACE_DAYS`, `accountDeletionDeadline()`), звідти ж його бере і UI. Добивач — `setInterval` + `unref()` з годинним тиком і `FOR UPDATE SKIP LOCKED` claim, за [ADR-0089](./0089-job-substrates-outbox-broker-timer.md) § Compliance; видимість у `/health/workers`.

**Доступ у вікні припинено, крім двох роутів.** `requireSession()` / `requireFreshSession()` ([`http/requireSession.ts`](../../../apps/server/src/http/requireSession.ts)) відбивають позначений акаунт кодом `ACCOUNT_PENDING_DELETION_CODE`. Свідомий виняток — `allowPendingDeletion: true` на `GET /api/me/deletion-status` і на роуті скасування: без нього вони заблокували б самі себе, і людина у вікні не побачила б ані дати, ані кнопки «відновити». Веб показує [`PendingDeletionScreen.tsx`](../../../apps/web/src/core/profile/PendingDeletionScreen.tsx).

**Скасування повертає акаунт, але не підписку.** `restoreAccount` знімає мітку; якщо знімати було нічого — `false` → 404, щоб «відновив неіснуюче» не виглядало як успіх. Підписку не відновлюємо навмисно: її скасували в день прохання, і повернути її може лише нове оформлення. UI попереджає про це **до** натискання.

**Better-Auth-хук вимкнено, і це частина рішення, а не побічний ефект.** `user.deleteUser: { enabled: false }` у [`auth.ts`](../../../apps/server/src/auth.ts). На тому хуку вікно нездійсненне: Better Auth після `beforeDelete` **безумовно** виконує власний `internalAdapter.deleteUser` (`dist/api/routes/update-user.mjs`), тож єдиним способом зупинити видалення було б кидати помилку на успішному шляху. Планка, яку той ендпоінт тримав, не загублена — вона переїхала разом зі шляхом: `DELETE /api/me` стоїть за `requireFreshSession()` і сам звіряє пароль через [`verifyAccountPassword.ts`](../../../apps/server/src/modules/me/verifyAccountPassword.ts). Без цієї звірки вимога впала б зі «знає пароль» до «має живу сесію», і вкрадена сесія могла б запустити відлік.

### Що переходить з ADR-0016 без змін

Цей ADR замінює ADR-0016 **лише** в частині моменту й незворотності видалення. Механіка самого очищення не переглядається і лишається такою, як її описав ADR-0016 — вона просто виконується пізніше, з добивача:

- вміст незворотної транзакції: snapshot email і Stripe customer ID, по одному запису зовнішнього очищення на підтримуваний сервіс, явне прибирання `ai_usage_daily` для `u:<userId>`, потім `DELETE FROM "user"`;
- прибирання залежних записів каскадом `ON DELETE CASCADE` плюс інваріант «немає таблиці з `user_id` без FK», який гейтить [`141-142-user-scoped-cascade.test.ts`](../../../apps/server/src/migrations/__tests__/141-142-user-scoped-cascade.test.ts), і навмисні винятки в allowlist;
- черга зовнішнього очищення `gdpr_cleanup_queue`, яка існує саме щоб пережити видалення.

Деталі цих трьох пунктів читай в ADR-0016 — дублювати їх тут означало б два джерела правди (Hard Rule #15).

## Rationale

Варіант 1 неможливий технічно, і це головний аргумент: `beforeDelete` не має права вето. Зупинити Better Auth після хука можна лише винятком, тобто успішне прохання про видалення мусило б виглядати для клієнта як помилка — контракт, у якому 200 і 500 міняються місцями. Вимкнути ендпоінт і володіти шляхом самому дешевше й прозоріше.

Варіант 3 лишав би незакритою причину, з якої вікно й почали робити: незворотність рішення, ухваленого за секунду. 30 днів — не технічне число, а те саме, що ADR-0016 сам назвав очікуваною політикою, перш ніж її реалізували.

Добивач як in-process timer, а не BullMQ — вимога [ADR-0089](./0089-job-substrates-outbox-broker-timer.md): періодичний ідемпотентний скан із дедупом у Postgres належить таймеру. Годинний тик замість частішого — бо точність до години для 30-денного вікна надлишкова.

## Consequences

### Positive

- Помилкове або скомпрометоване видалення відкотне протягом 30 днів.
- Планка на видаленні тепер явна й перевіряється: пароль і свіжа сесія в роуті, який ми контролюємо, а не в поведінці бібліотеки.
- Списання зупиняється в день прохання, а не через місяць.

### Negative

- Дані позначеного акаунта живуть ще 30 днів. Для GDPR Art. 17 це навмисна затримка, а не прострочення, але вона мусить бути описана в політиці приватності.
- Зʼявився ще один фоновий процес, який може стати. Якщо добивач не біжить, позначені акаунти висять вічно — тобто обіцянка видалити дані порушується тихо. Звідси вимога видимості в `/health/workers`.
- Відновлення повертає акаунт, але не підписку. Це асиметрія, яку доводиться пояснювати в UI.

### Neutral

- Незворотна частина не переписана — `purgeUserData` це той самий код, лише з іншим викликачем.
- Зовнішнє очищення лишається асинхронним і retryable; успішний local purge не доводить, що кожен vendor уже стер дані.

## Compliance

| Що тримається                                         | Чим перевіряється                                                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Хук Better Auth лишається вимкненим і без обробника   | [`apps/server/src/auth.test.ts`](../../../apps/server/src/auth.test.ts) § «user.deleteUser закритий на користь вікна скасування»                               |
| Гварди живого шляху: пароль і свіжа сесія             | [`apps/server/src/routes/me.delete.route.test.ts`](../../../apps/server/src/routes/me.delete.route.test.ts) § «DELETE /api/me — гварди живого шляху видалення» |
| Мітка, ідемпотентність, гасіння сесій, скасування     | [`modules/me/dataRights.test.ts`](../../../apps/server/src/modules/me/dataRights.test.ts)                                                                      |
| Добивання після кінця вікна                           | [`modules/me/deletionPoller.test.ts`](../../../apps/server/src/modules/me/deletionPoller.test.ts)                                                              |
| Немає таблиці з `user_id` без FK (каскад із ADR-0016) | [`141-142-user-scoped-cascade.test.ts`](../../../apps/server/src/migrations/__tests__/141-142-user-scoped-cascade.test.ts)                                     |

## Links

- [`docs/work/specs/user-deletion-grace-window.md`](../../work/specs/user-deletion-grace-window.md) — спека, `Status: Implemented`, усі чотири кроки.
- Міграція [`145_user_deletion_grace_window.sql`](../../../apps/server/src/migrations/145_user_deletion_grace_window.sql) і парний `.down.sql`.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                                | Title                                                                  | Merged     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| [#101](https://bitbucket.org/skords01/sergeant/pull-requests/101) | fix(root): червоні кроки pnpm lint на main і три Windows-баги в гейтах | 2026-09-29 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
