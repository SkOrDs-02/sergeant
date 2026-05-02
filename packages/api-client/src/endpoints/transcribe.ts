import {
  TranscribeQuerySchema as SharedTranscribeQuerySchema,
  TranscribeResponseSchema as SharedTranscribeResponseSchema,
  z,
} from "@sergeant/shared";
import { ApiError, isApiError } from "../ApiError";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * `POST /api/transcribe` — проксі на Groq Whisper STT.
 *
 * Body — сирий аудіо-блоб (`Blob`/`ArrayBuffer`) із `Content-Type: audio/*`.
 * `HttpClient.post` пропускає `Blob` як `BodyInit` без JSON-серіалізації
 * (див. `isBodylessInit`), а query-string формує зі `opts.query`.
 *
 * Схема валідації та типи — SSOT у `@sergeant/shared/schemas/api.ts`.
 * Реекспортуємо тут лише щоб callsite-и могли імпортувати з того самого
 * пакета, що й інші endpoint-и.
 */

export const TranscribeQuerySchema = SharedTranscribeQuerySchema;
export const TranscribeResponseSchema = SharedTranscribeResponseSchema;

export type TranscribeQuery = z.infer<typeof TranscribeQuerySchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

/**
 * Outcome-дискримінована відповідь на transcribe-запит.
 *
 * Для `/api/transcribe` помилки — це нормальна частина flow (503 коли
 * GROQ_KEY_MISSING → UI переходить на Web Speech, 401/429 → показати
 * toast). Замість того, щоб залишати виклики з `try/catch` у UI і
 * руками порівнювати `isApiError(err).status === 503`, повертаємо
 * discriminated union, і колсайт звужує тип через `result.outcome`.
 */
export type TranscribeOutcome =
  | { outcome: "ok"; data: TranscribeResponse }
  | { outcome: "provider_unavailable"; status: 503 }
  | { outcome: "unauthorized"; status: 401 }
  | { outcome: "rate_limited"; status: 429 }
  | { outcome: "payload_too_large"; status: 413 }
  | { outcome: "unsupported_media_type"; status: 415 }
  | { outcome: "error"; status: number; message: string };

export interface TranscribeBody {
  /** Бінарне аудіо. Сервер очікує `audio/*` Content-Type. */
  audio: Blob | ArrayBuffer;
  /** MIME-тип для `Content-Type` заголовка (наприклад, `audio/webm`). */
  mimeType: string;
}

export interface TranscribeEndpoints {
  /**
   * Надіслати аудіо у Groq Whisper. Повертає `TranscribeOutcome`, щоб
   * UI міг чисто переключатися на Web Speech при 503 без exception-driven
   * flow.
   */
  send: (
    body: TranscribeBody,
    query?: TranscribeQuery,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<TranscribeOutcome>;
}

export function createTranscribeEndpoints(
  http: HttpClient,
): TranscribeEndpoints {
  return {
    send: async ({ audio, mimeType }, query, { signal } = {}) => {
      const parsedQuery = query ? TranscribeQuerySchema.parse(query) : {};
      try {
        const raw = await http.post<unknown>("/api/transcribe", audio, {
          signal,
          headers: { "Content-Type": mimeType },
          query: parsedQuery,
        });
        const data = TranscribeResponseSchema.parse(raw);
        return { outcome: "ok", data };
      } catch (err) {
        if (!isApiError(err)) throw err;
        const apiErr = err as ApiError;
        if (apiErr.kind !== "http" || typeof apiErr.status !== "number") {
          throw err;
        }
        switch (apiErr.status) {
          case 503:
            return { outcome: "provider_unavailable", status: 503 };
          case 401:
            return { outcome: "unauthorized", status: 401 };
          case 429:
            return { outcome: "rate_limited", status: 429 };
          case 413:
            return { outcome: "payload_too_large", status: 413 };
          case 415:
            return { outcome: "unsupported_media_type", status: 415 };
          default:
            return {
              outcome: "error",
              status: apiErr.status,
              message: apiErr.message,
            };
        }
      }
    },
  };
}
