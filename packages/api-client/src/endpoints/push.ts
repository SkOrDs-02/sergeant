import {
  PushRegisterSchema,
  PushTestRequestSchema as SharedPushTestRequestSchema,
  PushTestResponseSchema as SharedPushTestResponseSchema,
  PushUnregisterSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * Runtime-схема запиту `POST /api/v1/push/register`.
 *
 * Це точне дзеркало `PushRegisterSchema` з `@sergeant/shared`, щоб клієнт і
 * сервер валідувалися з одного джерела правди (див.
 * `packages/shared/src/schemas/api.ts`). Discriminated union на `platform`:
 *
 * - `platform: "web"` — web-push: `token` несе endpoint URL, `keys`
 *   (`p256dh`, `auth`) обовʼязкові (RFC 8030).
 * - `platform: "ios" | "android"` — native push: `token` — opaque APNs/FCM
 *   device token, `keys` відсутні.
 */
export const PushRegisterRequestSchema = PushRegisterSchema;

export type PushRegisterRequest = z.infer<typeof PushRegisterRequestSchema>;

export type PushPlatform = PushRegisterRequest["platform"];

/**
 * Runtime-схема відповіді `POST /api/v1/push/register`. Сервер відповідає
 * `200 { ok: true, platform }` як на web, так і на native (див.
 * `docs/mobile/overview.md`).
 */
export const PushRegisterResponseSchema = z.object({
  ok: z.literal(true),
  platform: z.enum(["web", "ios", "android"]),
});

export type PushRegisterResponse = z.infer<typeof PushRegisterResponseSchema>;

/**
 * Runtime-схема запиту `POST /api/v1/push/test` — дзеркало
 * `PushTestRequestSchema` з `@sergeant/shared`. Експонуємо також у
 * публічному API-client (`PushTestRequestSchema`) для callsite-ів, що
 * хочуть попередньо провалідувати payload перед викликом.
 */
export const PushTestRequestSchema = SharedPushTestRequestSchema;
export const PushTestResponseSchema = SharedPushTestResponseSchema;

export type PushTestRequest = z.infer<typeof PushTestRequestSchema>;
export type PushTestResponse = z.infer<typeof PushTestResponseSchema>;

/**
 * Runtime-схема запиту `POST /api/v1/push/unregister`. Дзеркало
 * `PushUnregisterSchema` з `@sergeant/shared`.
 *
 * - `platform: "web"` — знімаємо підписку за `endpoint` URL.
 * - `platform: "ios" | "android"` — за opaque APNs/FCM `token`.
 */
export const PushUnregisterRequestSchema = PushUnregisterSchema;

export type PushUnregisterRequest = z.infer<typeof PushUnregisterRequestSchema>;

/** Відповідь `POST /api/v1/push/unregister` — симетрична до `register`. */
export const PushUnregisterResponseSchema = z.object({
  ok: z.literal(true),
  platform: z.enum(["web", "ios", "android"]),
});

export type PushUnregisterResponse = z.infer<
  typeof PushUnregisterResponseSchema
>;

export interface PushEndpoints {
  /** Legacy web-push: VAPID public key для `PushManager.subscribe`. */
  getVapidPublic: () => Promise<{ publicKey: string }>;
  /**
   * Legacy web-push: зберегти `PushSubscription.toJSON()` на бекенді.
   *
   * @deprecated Використовуй `register({ platform: "web", token, keys })`.
   * Серверний `/api/push/subscribe` залишено proxy-адаптером (див.
   * `apps/server/src/modules/push/push.ts`) на період rollout.
   * @removeBy 2026-09-01
   */
  subscribe: (subscription: PushSubscriptionJSON) => Promise<unknown>;
  /**
   * Legacy web-push: видалити підписку за `endpoint`.
   *
   * @deprecated Використовуй `unregister({ platform: "web", endpoint })`.
   * @removeBy 2026-09-01
   */
  unsubscribe: (endpoint: string) => Promise<unknown>;
  /**
   * `POST /api/push/register` — уніфікована реєстрація push-пристрою
   * (web / iOS / Android). Шлях автоматично перетворюється в
   * `/api/v1/push/register` через `applyApiPrefix` у `HttpClient`
   * (див. `src/httpClient.ts`). Відповідь валідується
   * `PushRegisterResponseSchema`.
   */
  register: (
    body: PushRegisterRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<PushRegisterResponse>;
  /**
   * `POST /api/v1/push/test` — відправити тестовий пуш на всі зареєстровані
   * пристрої поточного користувача. Сервер відповідає сумаркою
   * `{ delivered, cleaned, errors }`; ми парсимо її `PushTestResponseSchema`,
   * щоб нетипічна відповідь (старий сервер / проксі) фейлила одразу на клієнті,
   * а не глибше у UI.
   */
  test: (
    body: PushTestRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<PushTestResponse>;
  /**
   * `POST /api/push/unregister` — уніфікований анрег push-пристрою.
   * Шлях переписується на `/api/v1/push/unregister`. Web-клієнт шле
   * `{ platform: "web", endpoint }`; native — `{ platform, token }`.
   */
  unregister: (
    body: PushUnregisterRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<PushUnregisterResponse>;
}

export function createPushEndpoints(http: HttpClient): PushEndpoints {
  return {
    getVapidPublic: () =>
      http.get<{ publicKey: string }>("/api/push/vapid-public"),
    subscribe: (subscription) =>
      http.post<unknown>("/api/push/subscribe", subscription),
    unsubscribe: (endpoint) =>
      http.del<unknown>("/api/push/subscribe", { endpoint }),
    register: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/push/register", body, {
        signal,
      });
      return PushRegisterResponseSchema.parse(raw);
    },
    test: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/push/test", body, {
        signal,
      });
      return PushTestResponseSchema.parse(raw);
    },
    unregister: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/push/unregister", body, {
        signal,
      });
      return PushUnregisterResponseSchema.parse(raw);
    },
  };
}
