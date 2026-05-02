import {
  WaitlistSubmitSchema as SharedWaitlistSubmitSchema,
  WaitlistSubmitResponseSchema as SharedWaitlistSubmitResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * Phase 0 monetization rails: client для `POST /api/v1/waitlist`.
 *
 * Re-export-имо схеми з `@sergeant/shared` так само, як це зроблено для
 * push-endpoint-ів — щоб callsite-и могли попередньо валідувати payload
 * перед мережевим викликом, і щоб тести могли імпортувати схему без
 * зачіпки за весь shared-bundle.
 */
export const WaitlistSubmitRequestSchema = SharedWaitlistSubmitSchema;
export const WaitlistSubmitResponseSchema = SharedWaitlistSubmitResponseSchema;

export type WaitlistSubmitRequest = z.infer<typeof WaitlistSubmitRequestSchema>;
export type WaitlistSubmitResponse = z.infer<
  typeof WaitlistSubmitResponseSchema
>;

export interface WaitlistEndpoints {
  /**
   * `POST /api/v1/waitlist` — анонімний sign-up на майбутній Pro-тір.
   * Сервер відповідає `{ ok: true, created: boolean }`; парсимо
   * `WaitlistSubmitResponseSchema`, щоб неочікуваний shape (старий сервер,
   * проксі-injection) фейлив на клієнті, а не пізніше у UI-логіці.
   */
  submit: (
    body: WaitlistSubmitRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<WaitlistSubmitResponse>;
}

export function createWaitlistEndpoints(http: HttpClient): WaitlistEndpoints {
  return {
    submit: async (body, { signal } = {}) => {
      // Шлях `/api/waitlist` перепишеться на `/api/v1/waitlist` через
      // `applyApiPrefix` у `HttpClient` (див. `src/httpClient.ts`) —
      // конвенція решти endpoint-ів цього клієнта.
      const raw = await http.post<unknown>("/api/waitlist", body, { signal });
      return WaitlistSubmitResponseSchema.parse(raw);
    },
  };
}
