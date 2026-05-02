# Monobank integration — план покращень після webhook-міграції

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Статус документа:** plan / draft. Створено 2026-04-25 одразу після cutover (#705 → #708).
**Поточний стан:** Webhook-pipeline у проді, `mono_webhook` дефолтом `true`, проблеми «`T.data.map`» (#706), silent-50-truncation (#707) і `bigint`-as-string (#708) пофіксені.
**Що цей документ:** черга PR-ів, які варто зробити поверх webhook-міграції. Кожен пункт — окремий PR, незалежний від решти, можна мерджити у будь-якому порядку (з врахуванням рекомендованої черговості нижче).

---

## TL;DR пріоритетів

| #     | PR                                   | Ефект для користувача | Складність | Ризик    | Статус (2026-04-27)                                                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------ | --------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Cleanup legacy polling               | (невидимий)           | низька     | низький  | ⏳ pending — `useMonobankLegacy()` живий у `apps/web/src/modules/finyk/hooks/useMonobank.ts:171`; `useFlag("mono_webhook")` все ще викликається у `FinykApp.tsx:45` і `useMonobank.ts:161`.                                                                                                                       |
| **B** | Backfill UX (Діагностика + progress) | плюс                  | низька     | низький  | ⏳ pending — `apps/server/src/modules/mono/backfill.ts` без progress-DTO; блок «🔧 Діагностика» у `FinykSection.tsx` не доданий.                                                                                                                                                                                  |
| **C** | Auto-categorization по MCC           | плюс плюс             | середня    | середній | ⏳ pending — `apps/server/src/modules/mono/mccCategories.ts` не існує; міграція `010_mono_mcc_categorization.sql` не створена.                                                                                                                                                                                    |
| **D** | Push-нотифікації                     | плюс плюс плюс        | висока     | середній | ✅ done — `apps/server/src/modules/mono/webhook.ts` після UPSERT викликає `void sendToUserQuietly(userId, payload, { module: "mono" })` з `RETURNING (xmax = 0) AS inserted` для де-дупу retry-доставок. Покриття: `webhook.test.ts` — 4 нові кейси (insert→push, update→no-push, hold-marker, idempotent retry). |
| **E** | Webhook secret rotation              | (захист)              | низька     | низький  | ⏳ pending — `webhook.ts` робить lookup `WHERE webhook_secret = $1` без версіонування / rotation flow.                                                                                                                                                                                                            |

**Рекомендована черговість:** A → B → C → D (довести до кінця) → E.
A знімає мертвий код, що спрощує наступні; B — швидкий UX-win; C дає видиму користь без зовнішніх залежностей; D — найбільший wow, але потребує VAPID-keys і Service Worker; E — security-hardening.

---

## A. Cleanup legacy polling

### Що видалити

**Web (`apps/web/src/modules/finyk/`):**

- `hooks/useMonoStatements.ts` + `hooks/useMonoStatements.test.tsx`
- `useMonobankLegacy()` функція всередині `hooks/useMonobank.ts` (вся, ~450 рядків)
- Snapshot fallback: ключі `INFO_CACHE_KEY` (`finyk_info_cache`), `CACHE_KEY` (`finyk_tx_cache`), `LAST_GOOD_KEY` (`finyk_tx_cache_last_good`)
- `lib/mergeTx.ts` + `lib/mergeTx.test.ts` (використовується тільки в legacy snapshot-merge)

**Web (feature flags):**

- `mono_webhook` з `apps/web/src/core/lib/featureFlags.ts` (бо legacy зникне → флаг втрачає сенс)
- `useFlag("mono_webhook")` всі виклики (зараз: `FinykApp.tsx:45`, `useMonobank.ts:161`)

**Server (`apps/server/src/`):**

- `modules/mono/mono.ts` — legacy proxy `/api/mono?path=/personal/...` (не потрібен, server тепер сам ходить у Monobank через `connection.ts`)
- Маршрут реєстрації цього handler-а (знайти у `routes/index.ts` чи де він мапиться)
- `lib/bankProxy.ts` — якщо ним користувався тільки `mono.ts`, видалити

**API client (`packages/api-client/src/endpoints/mono.ts`):**

- `clientInfo` + `statement` методи з legacy-proxy шляхом
- `MONO_STATEMENT_PAGE_SIZE`, `MONO_STATEMENT_MAX_PAGES`, `MONO_RETRY_*`, `__setMonoSleep`
- Залишити тільки webhook-API (connect/disconnect/accounts/transactions/sync-state/backfill)

**Тести:**

- Видалити `apps/web/src/modules/finyk/hooks/useMonoClientInfo.test.tsx` (хук не використовується ніде в проді)
- Видалити `apps/web/src/modules/finyk/hooks/useMonoClientInfo.ts`
- Перевірити `useMonoTokenMigration.test.tsx` — він може посилатись на `finyk_token` ключі. Залишаємо хук як є (auto-migration ще потрібен), просто прибрати тести які звіряють снапшот-кеш.

**Що НЕ чіпати в цьому PR:**

- `useMonoTokenMigration.ts` — ще потрібен (auto-migrates legacy `finyk_token` з localStorage у server). Phase out — окремий PR через 1-2 місяці після cleanup.
- `seedDemoData.ts` посилання на `finyk_token` — це seed-data для онбордингу, окрема логіка.

### Перевірка

- `pnpm --filter @sergeant/web exec vitest run` — усі тести зелені.
- `pnpm --filter @sergeant/server exec vitest run` — усі тести зелені.
- `pnpm typecheck` — нуль помилок.
- Smoke на проді: connect, disconnect, refresh — все працює.

### Розмір

**~-1100 рядків коду, +0 нових файлів.** Один з найбільш вигідних PR.

---

## B. Backfill UX (перенесення в Діагностику + progress)

### Проблема

- Кнопка «Re-sync (backfill)» зараз поряд з основними діями. Звичайний юзер може натиснути на неї «про всяк» і потім чекати ~6 хвилин (60 сек pacing × 6 акаунтів) без зворотного зв'язку.
- Немає UI прогресу: просто spinner + лог в консоль. Юзер не розуміє, що відбувається.

### Що зробити

**Server (`apps/server/src/modules/mono/backfill.ts`):**

- Додати progress-event-stream. Варіанти:
  - **A.** Server-Sent Events: `GET /api/mono/backfill/progress` — стрім подій `{accountId, status, processed}` поки backfill виконується.
  - **B.** Простіше: `GET /api/mono/sync-state` вже повертає `lastSyncAt` per-account. Розширити DTO полем `backfillStatus: { running, accountsProcessed, accountsTotal, currentAccount, lastError }`. Фронт polling-ить кожні 2 сек поки `running=true`.

Рекомендую **B** — менше нового інфраструктурного коду.

**Web (`apps/web/src/core/settings/FinykSection.tsx`):**

- Прибрати кнопку «Re-sync (backfill)» з основних дій.
- Додати в Settings новий блок «**🔧 Діагностика**» (collapsed за замовчуванням):
  - Статус webhook (active/error/last update).
  - Кнопка «Backfill last 31 days» з warning «Triggers Monobank statement API, takes ~1 minute per account due to rate-limit».
  - Прогрес-бар з лічильником `2 / 6 accounts processed (currently fetching: white)`.
  - Кнопка «View raw events» — лінк на `/api/mono/sync-state` JSON.

### Перевірка

- Стартанути backfill з UI → бачити прогрес → дочекатись завершення → новий UI стан «Last backfill: 2 хв тому, 6 / 6 ✓».
- Кнопка disabled поки `running=true` (не дати натиснути двічі).

### Розмір

~150-200 рядків + новий UI компонент. 1 робочий день.

---

## C. Auto-categorization по MCC

### Контекст

Monobank кожній транзакції присвоює **Merchant Category Code** (MCC, ISO 18245) — 4-значний код категорії merchant-а. Зараз ми зберігаємо `mcc` у БД, але не використовуємо його для категоризації; усі транзакції потрапляють як «без категорії», поки юзер вручну їх не розкладе.

### Що зробити

**Шар 1: MCC → Category map (server-side, статична).**

Додати `apps/server/src/modules/mono/mccCategories.ts`:

```ts
// Підмножина MCC → ваші категорії з finyk-domain
export const MCC_TO_CATEGORY: Record<number, CategorySlug> = {
  // Food
  5411: "groceries", // Grocery stores, supermarkets
  5499: "groceries", // Misc food stores
  5812: "restaurants", // Eating places, restaurants
  5813: "restaurants", // Bars, taverns
  5814: "fast_food", // Fast food
  // Transport
  4111: "transport", // Local commuter transport
  4121: "transport", // Taxis & limousines
  5541: "fuel", // Gas stations
  // ... ~50-100 найпоширеніших MCC
};
```

Список найпоширеніших MCC можна взяти з `https://github.com/greggles/mcc-codes` (CSV ~1000 кодів, але для України потрібно ~100-150).

**Шар 2: Apply при створенні tx (webhook).**

У `apps/server/src/modules/mono/webhook.ts` (handler що обробляє вхідний event):

```ts
const categoryFromMcc = MCC_TO_CATEGORY[tx.mcc] ?? null;
await db.query(
  `INSERT INTO mono_transaction (..., category_slug)
   VALUES (..., $N) ON CONFLICT ... DO UPDATE SET ...`,
  [..., categoryFromMcc],
);
```

**Шар 3: Override.**

Юзер може вручну змінити категорію у `mono_transaction` (через UI на сторінці Транзакції). Тоді server повинен поважати override:

- Додати колонку `category_overridden BOOLEAN DEFAULT FALSE`.
- При apply-MCC у webhook-і: `WHERE category_overridden = FALSE`.
- При manual edit з UI: `SET category_overridden = TRUE, category_slug = ...`.

**Шар 4: Backfill існуючих tx.**

Окремий one-shot job:

```sql
UPDATE mono_transaction
SET category_slug = (CASE mcc
  WHEN 5411 THEN 'groceries'
  ...
END)
WHERE category_overridden = FALSE AND category_slug IS NULL;
```

Запустити як SQL-міграцію `010_mono_mcc_categorization.sql`.

### Edge cases

- MCC `0`, `null`, або не у мапі → залишити `null`. Юзер сам розкладе.
- MCC змінився між версіями webhook-event (бо Monobank може refund-ити з іншим MCC) → on `UPSERT` оновлюємо `category_slug` тільки якщо `category_overridden = FALSE`.

### Перевірка

- 5 модельних tx з різними MCC → перевірити що `category_slug` правильний.
- Manual override → новий webhook event для тієї ж tx → `category_slug` НЕ перезаписаний.
- Tx без MCC → `category_slug` = null.

### Розмір

~300-400 рядків (мапа + handler-зміни + міграція + тести). 1 робочий день.

---

## D. Push-нотифікації

### Чому це wow-фіча

Зараз real-time є, але **тільки коли юзер відкрив додаток**. Webhook event записався в БД, але якщо клієнт не підписаний — він не дізнається про транзакцію поки не відкриє Фінік.

З push-ами ти отримуєш сповіщення в момент покупки, навіть з закритим браузером (на десктопі) або з закритим PWA (на мобілці).

### Архітектура

```
Mono webhook event → server.ts onTransactionPersisted() →
  ↓
push.service.sendToUser(userId, payload)
  ↓
Web Push API (VAPID-signed POST до browser push service)
  ↓
Service Worker fetches → showNotification(...)
```

### Що зробити

**1. Згенерувати VAPID-keys (одноразово):**

```bash
pnpm exec web-push generate-vapid-keys
```

Поставити у Railway env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:admin@yourdomain`.

**2. Нова таблиця `push_subscription`:**

```sql
CREATE TABLE push_subscription (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX push_subscription_user_id_idx ON push_subscription(user_id);
```

**3. Нові API:**

- `POST /api/push/subscribe` — body: `{endpoint, keys: {p256dh, auth}}`. Зберігає у БД.
- `DELETE /api/push/subscribe` — body: `{endpoint}`. Видаляє.
- `GET /api/push/vapid-public-key` — повертає публічний VAPID-ключ для frontend-а.

**4. Service Worker (`apps/web/public/sw.js`) — додати handler:**

```js
self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/badge.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

**5. Settings UI:**
Toggle «Отримувати push-нотифікації про транзакції». При вмиканні:

```ts
const reg = await navigator.serviceWorker.ready;
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
});
await fetch("/api/push/subscribe", {
  method: "POST",
  body: JSON.stringify(sub),
});
```

**6. Server-side hook у webhook-і (`apps/server/src/modules/mono/webhook.ts`):**

```ts
// Існуючий хук:
await onTransactionPersisted(userId, transaction);

// Новий код у onTransactionPersisted:
const subs = await db.query(
  `SELECT endpoint, p256dh, auth FROM push_subscription WHERE user_id = $1`,
  [userId],
);
const sign = transaction.amount > 0 ? "+" : "";
const payload = JSON.stringify({
  title: `Mono: ${sign}${(transaction.amount / 100).toFixed(2)} ₴`,
  body: transaction.description,
  url: "/finyk/transactions",
});
for (const sub of subs.rows) {
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
  } catch (err) {
    if (err.statusCode === 410) {
      // subscription expired, remove
      await db.query(`DELETE FROM push_subscription WHERE endpoint = $1`, [
        sub.endpoint,
      ]);
    }
  }
}
```

### Edge cases

- iOS Safari: web push працює тільки якщо PWA встановлено на home screen. Перевірити флагом `Notification.permission` і показати помилку якщо не PWA.
- Користувач відмовив у permission → showmessage «Push-and заблоковані браузером, увімкни їх у налаштуваннях».
- Кілька пристроїв → кожне має свій subscription. Push шлемо на всі.
- Battery saver / Do Not Disturb → push може не з'явитись, але це не наша проблема.

### Безпека

- VAPID-keys — приватний у env, не у git.
- При delete user → cascade видалить subscriptions автоматично (FK).
- Throttling: максимум 1 push на одну транзакцію (deduplication by `mono_tx_id` у webhook-і).

### Перевірка

- Підписатись з Chrome → зробити покупку → push прийшов.
- Disconnect Monobank → відписка від push НЕ потрібна (просто більше не буде events).
- Multiple devices → push на всі.

### Розмір

~600-800 рядків (Web Push lib, server, SW, UI, тести). 1.5-2 робочих дні. Найбільший і найскладніший PR.

---

## E. Webhook secret rotation

### Проблема

Зараз `mono_connection.webhook_secret` генерується при connect і живе вічно. Якщо secret якось спливає (logs, supply-chain attack на Monobank, etc.) — нічого не вдієш окрім disconnect+reconnect, що губить історію.

### Що зробити

**1. Server endpoint `POST /api/mono/rotate-webhook-secret`:**

```ts
// apps/server/src/modules/mono/connection.ts
async function rotateWebhookSecret(req, res) {
  const userId = req.user.id;
  const newSecret = randomBytes(32).toString("hex");
  const newWebhookUrl = `${PUBLIC_API_BASE_URL}/api/mono/webhook/${newSecret}`;

  // 1. Re-register у Monobank
  await monoBank.setWebHook(token, newWebhookUrl);

  // 2. Atomic update
  await db.query(
    `UPDATE mono_connection
     SET webhook_secret = $1, webhook_url = $2, webhook_rotated_at = now()
     WHERE user_id = $3`,
    [newSecret, newWebhookUrl, userId],
  );

  // 3. Old webhook URL автоматично перестає бути валідним (mono.ts шукає по secret в БД).
  res.json({ ok: true, rotatedAt: new Date().toISOString() });
}
```

**2. Settings UI:**
У блоці «🔧 Діагностика» додати «Rotate webhook secret» з warning «New secret will be registered with Monobank. No data loss.».

**3. Edge cases:**

- Monobank `setWebHook` failed → НЕ оновлюємо БД. Інакше старий webhook залишиться валідним у банка, новий — в БД, події ламаються.
- Race condition: один tab rotate-ить, інший отримує webhook з old secret → `404 unknown secret`. Прийнятно — Monobank ретраїть, наступна спроба буде з новим URL.

### Перевірка

- Rotate → перевірити що новий webhook активний (зробити тестову покупку).
- Старий secret більше не приймається (`curl /api/mono/webhook/<old-secret>` → 404).

### Розмір

~150 рядків + UI кнопка. Півдня.

---

## Поза скоупом цього roadmap

- **Observability у Prometheus / Datadog.** Зараз метрики `mono_webhook_received_total{status}` збираються в `prom-client`, але не експортуються наверх. Окремий PR на observability stack — узагальнено для всього додатку.
- **Retention policy для `mono_transaction`.** На горизонті 2-3 років таблиця може стати великою. Партиціонування по `time` або archiving у cold storage — окрема задача.
- **MIGRATE_DATABASE_URL** через Railway internal DNS — залежить від змін у Railway, не у нас.
- **Phase out `useMonoTokenMigration`** — через 1-2 місяці після того як cleanup PR-А зайде, коли впевнені що ніхто не має старих `finyk_token` у localStorage.
- **MonoCorporate API.** Окрема інтеграція, окрема задача.
- **Розширити push-нотифікації** на інші модулі (Routine reminders, Coach, weekly digest) — окремий PR після D.

---

## Додатки

### Як міняти черговість

A → B → C → D → E — рекомендована, але не строга.

- **A треба перед C, D, E** — інакше ці PR-и теж міняти будуть legacy-код.
- **B можна перед A** — він самодостатній.
- **C, D, E** незалежні один від одного, можна паралелити.

### Estimation summary

| PR        | Час        | Рядків       |
| --------- | ---------- | ------------ |
| A         | пів дня    | -1100        |
| B         | 1 день     | +200         |
| C         | 1 день     | +400         |
| D         | 1.5-2 дні  | +800         |
| E         | пів дня    | +150         |
| **Total** | **5 днів** | **+450 net** |

### Послідовний контракт PR

Кожен PR повинен:

1. Бути окремою гілкою `devin/<timestamp>-<short-name>`.
2. Мати окремий PR-template.
3. Покривати зміни тестами (vitest).
4. Не ламати CI: lint, typecheck, vitest усі зелені.
5. Мати «Review checklist for human» з чіткими smoke-кроками для перевірки на проді.
