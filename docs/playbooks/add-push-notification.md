# Playbook: Add Push Notification

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** «Надсилай push коли X» / «Додати новий тип сповіщення» / нагадування / реакція на зовнішню подію (Mono webhook, AI insight, scheduler).

---

## Контекст

Push-інфраструктура вже зібрана (див. `apps/server/src/push/` і `apps/server/src/lib/webpushSend.ts`):

- **Контракт payload** — `PushPayload` у `packages/shared/src/types/index.ts` (cross-package: web SW, mobile handler, server `sendToUser`).
- **Server fan-out** — `sendToUser(userId, payload)` з `apps/server/src/push/send.ts`. Читає з `push_devices` + `push_subscriptions`, паралельно б'є APNs/FCM/web-push, повертає аґреговану статистику. Не throw-ає; помилки конкретного каналу повертає у `errors[]`.
- **Quiet variant** — `sendToUserQuietly(userId, payload)` для fire-and-forget (наприклад, всередині handler-а, що не має валитись через push).
- **Client SW** (web) — `apps/web/src/sw.ts` рядок ~627, `self.addEventListener("push", …)`. Розпаковує JSON payload, показує `Notification` з `payload.title`, `payload.body`, `data.module` (для click-routing у `notificationclick`).
- **VAPID** — `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` у `.env` (опціонально, без них web-push мовчки skip-ається).

Додавання нового **типу** push-у — це не новий transport, а нова **точка тригера** + (опціонально) новий routing у SW.

---

## Steps

### 1. Визнач тригер

Запитай: коли саме push має полетіти?

| Тип тригера                       | Куди вставити                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Реакція на user-action (POST/PUT) | Всередині відповідного handler-а в `apps/server/src/modules/<domain>/`, після успішного write.                                                 |
| Mono webhook event                | `apps/server/src/modules/monoWebhook/`. Див. `add-monobank-event-handler.md` для скелета.                                                      |
| Періодичний (раз на день/тиждень) | Додай як HTTP endpoint, що тригериться зовнішнім cron-ом (Railway scheduler / GitHub Action). У репо немає вбудованого in-process scheduler-а. |
| Side effect AI insight            | Дивись `coach.ts` як приклад: викликає `sendToUserQuietly` після генерації insight-а.                                                          |

**Не клади** push логіку в `chat.ts` (порушує тонко-passthrough архітектуру; див. `AGENTS.md`).

### 2. Сформуй payload

Використовуй `PushPayload` з `@sergeant/shared`:

```ts
import type { PushPayload } from "@sergeant/shared";

const payload: PushPayload = {
  title: "Новий ліміт у Фінік",
  body: "Ти витратив 80% місячного бюджету «Кафе».",
  data: { module: "finyk", route: "/finyk/budgets" },
  url: "/finyk/budgets",
  threadId: "finyk-budget-warning",
  badge: 1,
};
```

Правила:

- **`title` обов'язковий.** APNs / FCM / web-push всі вимагають.
- **`body` коротко й конкретно.** Без «Привіт, ти ж знаєш, що…»; iOS обрізає на ~110 символів.
- **`data.module`** використовується SW для click-routing (`apps/web/src/sw.ts` `notificationclick`). Якщо новий тип належить існуючому модулю — постав його значення (`finyk`/`fizruk`/`nutrition`/`routine`); якщо ні — вирішуй чи додавати новий case у SW (крок 4).
- **`threadId`** групує нотифікації на iOS у єдиний thread (наприклад, всі бюджет-warning у одну групу). Без нього кожен push — окремий thread.
- **`silent: true`** тільки якщо це реально data-only push без UI (background sync). За замовчуванням — visible.

### 3. Викликай `sendToUser` (або quiet-варіант)

```ts
import { sendToUser, sendToUserQuietly } from "../push/send.js";

// Шлях, де push — частина бізнес-логіки і failure має бачитись:
const result = await sendToUser(user.id, payload);
if (result.errors.length > 0) {
  logger.warn({ userId: user.id, errors: result.errors }, "push partial fail");
}

// Шлях, де push — side effect і не має валити основний потік:
void sendToUserQuietly(user.id, payload);
```

`sendToUser` сам соft-видаляє stale subscription-и (наприклад, користувач відписався у браузері) і реєструє Prometheus метрики. Не дублюй цю логіку у викликаючому коді.

### 4. (Опц.) Розширити SW handler

Якщо новий тип push-у потребує:

- спеціального `notificationclick` routing (наприклад, deep-link на конкретну сторінку всередині модуля),
- іншої іконки / badge,
- кастомного `tag` (для replace-замість-стек семантики),

— онови `apps/web/src/sw.ts` `push` event-listener. Проте більшість випадків покривається `data.module` + `data.route` без змін у SW.

Для mobile (Expo) — окремий код в `apps/mobile/`; деталі за межами цього playbook-а.

### 5. (Опц.) VAPID env

Перевір що:

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` присутні у Railway production.
- Локально (у `.env`) — заповнено, якщо хочеш отримати web-push на dev-машині. Без них `sendWebPush` мовчки skip-ає web-канал, але APNs/FCM продовжують працювати.

Згенерувати pair можна через `npx web-push generate-vapid-keys` (один раз на проєкт).

### 6. Тести

Mock `web-push` (як у `apps/server/src/lib/webpushSend.test.ts`) і пиши unit-тест на свій тригер:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../push/send.js", () => ({
  sendToUser: vi.fn().mockResolvedValue({
    delivered: { ios: 0, android: 0, web: 1 },
    cleaned: 0,
    errors: [],
  }),
  sendToUserQuietly: vi.fn().mockResolvedValue(undefined),
}));

it("notifies user when budget threshold reached", async () => {
  await handleBudgetUpdate(user, { spent: 8500, limit: 10000 });
  const { sendToUser } = await import("../push/send.js");
  expect(sendToUser).toHaveBeenCalledWith(
    user.id,
    expect.objectContaining({
      title: expect.stringContaining("ліміт"),
      data: expect.objectContaining({ module: "finyk" }),
    }),
  );
});
```

Запуск:

```bash
pnpm --filter @sergeant/server exec vitest run src/modules/<your-domain>
```

### 7. Smoke у dev

```bash
# 1. Web SW зареєстрований (DevTools → Application → Service Workers).
# 2. Зайди на /settings, ввімкни push для test-юзера → у БД з'явиться запис у push_subscriptions.
# 3. Тригерни тест POST'ом / cron-ом / AI flow і перевір браузерну нотифікацію.
```

Альтернатива — використай існуючий `/api/push/test` endpoint (`apps/server/src/routes/push.ts`) як reference, якщо потрібен ручний trigger.

---

## Verification

- [ ] Тригер локалізований у відповідному `apps/server/src/modules/<domain>/` (НЕ у `chat.ts`).
- [ ] `payload` побудовано через `PushPayload` тип з `@sergeant/shared`, не свавільний об'єкт.
- [ ] `sendToUser` / `sendToUserQuietly` обрано свідомо (failure-visible vs fire-and-forget).
- [ ] `data.module` встановлено для коректного click-routing у SW.
- [ ] Unit test mock-ує `sendToUser` і перевіряє shape payload-у.
- [ ] Якщо змінено SW — версію bumpнуто (workbox cache key) + smoke у DevTools, що SW дійсно оновився.
- [ ] VAPID env заповнено в Railway (production); локально — опціонально.
- [ ] `pnpm --filter @sergeant/server exec vitest run src/modules/<domain>` — green.

## Notes

- **Не шли push без user opt-in.** Web-push підписка вимагає явного `Notification.requestPermission`; без неї `push_subscriptions` буде порожнім і `sendToUser` мовчки skip-ає web-канал. Це норма.
- **Не дублюй push.** Якщо вже існує тригер на ту ж подію — додай поле в `data` замість другого виклику `sendToUser`. Юзеру неприємно отримувати два банери на одну подію.
- **Не клади приватні дані в `body`.** `body` рендериться lock-screen-ом; суми, баланси, медичні факти — в `data` (рендериться лише після відкриття).
- **Soft-delete підписок** робить `sendToUser` сам, не викликай DELETE на `push_subscriptions` руками.
- **Production rollout:** після релізу слідкуй у Prometheus `push_sends_total` за `result="error"` — drift сигналізує про зламаний APNs cert / VAPID drift.

## See also

- [add-monobank-event-handler.md](add-monobank-event-handler.md) — push як реакція на webhook event
- [add-api-endpoint.md](add-api-endpoint.md) — якщо тригер push-у — це новий endpoint
- `apps/server/src/push/send.ts` — реалізація `sendToUser` / `sendToUserQuietly`
- `apps/server/src/lib/webpushSend.ts` — web-push transport
- `apps/web/src/sw.ts` рядок ~627 — `push` event listener
- `packages/shared/src/types/index.ts` — `PushPayload` контракт
