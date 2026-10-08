# Передача прогону durability-2026-10-08

> **Status:** Active

- **Виконано.** Живий харнес `apps/web/tests/verification-live/data-durability.spec.ts` (P1–P9) двічі: на `main` до фіксу (прогін `q554x`) і на гілці фіксу (прогін `shdpa`). До фіксу 83 pass / 3 fail, P9 не стартував каскадом. Після фіксу 9/9 фаз, 96 pass / 0 fail. Плюс ізольовані проби для двох багів, з тимчасовою `console.info`-діагностикою в прод-білді (не закомічена).
- **Знайдено й виправлено (PR):**
  - `DURABILITY-20261008-LOGOUT-1` (critical): офлайн-вихід мовчки стирав чергу. Офлайн `drain` резолвить юзера через `getSession()`, той кидає `TypeError: Failed to fetch` крізь `flushNow()`, а `catch` у `flushPendingSyncOpsBeforeLogout` повертав `unknown: true`. Фікс `ac4420f5`.
  - `DURABILITY-20261008-SIGNUP-1` (major): перший запис після реєстрації без аноніма не ставав у чергу. На свіжій партиції `INSERT` у `sync_op_outbox` влітав посеред `ROUTINE_CLIENT_MIGRATIONS` (таблиця є, `user_id` з 006 ще ні), адаптер ковтав помилку. Фікс `5a9667c8`: один серіалізований мігратор схеми черги (`core/syncEngine/outboxSchema.ts`) для бута Рутини, writer-runtime і кожного enqueue.
- **Знайдено, відкрито:** `DURABILITY-20261008-BOOT-1`: білий екран на буті (B1), 3 з 6 прогонів, reload рятує, один раз обвалив усі фази. `DURABILITY-20261008-OFFLINE-1`: одноразове «Помилка в модулі» на першій офлайн-навігації, чанки в прекеші є, не підтверджено.
- **Перевірено:** `PILOT-20260905-SYNC-1` (чистий другий context не бачив витрату) → `verified`, бо P3 зелений.
- **Стан акаунтів і seed:** лише одноразові `verify_*@example.com` / `probe_*@example.com` / `fix_*@example.com` у локальній БД `sergeant_verify`; прод не зачіпався.
- **Середовище й нюанси:**
  - Docker у контейнері недоступний, тож Postgres 16 локальний. pgvector 0.8.0 зібраний із вихідників, бо пакет з apt (0.6) без `halfvec`, і міграція 025 падає.
  - Харнес ходить у БД через `docker exec hub-postgres psql`. Замість docker стояв shim у `PATH`, який виконує локальний `psql -h 127.0.0.1`. `VERIFY_DB=sergeant_verify`.
  - Репо пінить Playwright із headless-shell 1243, в образі лише 1194. Допоміг symlink шляху 1243 на бінарник 1194 (Chromium 141).
  - `vite preview` мусить стартувати з `VERCEL=1`, інакше роздає `../server/dist` (404 на `/`).
  - Прод-логер мовчить: для діагностики знадобились тимчасові `console.info` і перезбірка.
- **Наступна точна команда/крок:**
  - Після мержу й деплою перепрогнати `data-durability` на свіжому білді `main` і перевести LOGOUT-1/SIGNUP-1 у `verified`.
  - `SYNC-offline-conflict-isolation` добрати окремо: IDOR, 401 на протухлій сесії, інвентар OPFS.
  - Розібрати B1: він найчастіше валить живі прогони.
- **Поза скоупом, помічено:** на `main` червоні `BarcodeScanner.test.tsx` (native permission toast) і `DailyPlanCard.extra.test.tsx` (FirstRunHintBanner). Eager-бюджет на локальному `VERCEL=1`-білді 277.6 kB при ліміті 268 kB уже на `main`; фікс набір preload-чанків не змінює.
