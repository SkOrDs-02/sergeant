import {
  WebVitalsPayloadSchema as SharedWebVitalsPayloadSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * `POST /api/metrics/web-vitals` — анонімний beacon-endpoint для Core Web
 * Vitals. Сервер завжди відповідає `204 No Content`; payload валідується
 * через `WebVitalsPayloadSchema` (SSOT у `@sergeant/shared`).
 *
 * Реальний транспорт у браузері — `navigator.sendBeacon`, а не `fetch`
 * (див. `apps/web/src/core/observability/webVitals.ts`). Цей endpoint
 * існує як SSR-/mobile-safe fallback і як явна точка для інструментальних
 * тестів.
 */

export const WebVitalsPayloadSchema = SharedWebVitalsPayloadSchema;
export type WebVitalsPayload = z.infer<typeof WebVitalsPayloadSchema>;

export interface WebVitalsEndpoints {
  send: (
    payload: WebVitalsPayload,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<void>;
}

export function createWebVitalsEndpoints(http: HttpClient): WebVitalsEndpoints {
  return {
    send: async (payload, { signal } = {}) => {
      const parsed = WebVitalsPayloadSchema.parse(payload);
      await http.post<unknown>("/api/metrics/web-vitals", parsed, {
        signal,
        parse: "text",
      });
    },
  };
}
