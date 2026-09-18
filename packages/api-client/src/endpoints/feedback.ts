import {
  FeedbackSubmitSchema as SharedFeedbackSubmitSchema,
  FeedbackSubmitResponseSchema as SharedFeedbackSubmitResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * Client для `POST /api/v1/feedback` — in-app віджет фідбеку.
 *
 * Re-export схем із `@sergeant/shared` дзеркалить waitlist-endpoint: callsite
 * може перевалідувати payload до мережевого виклику, а тести — імпортувати
 * схему без зачіпки за весь shared-bundle.
 */
export const FeedbackSubmitRequestSchema = SharedFeedbackSubmitSchema;
export const FeedbackSubmitResponseSchema = SharedFeedbackSubmitResponseSchema;

export type FeedbackSubmitRequest = z.infer<typeof FeedbackSubmitRequestSchema>;
export type FeedbackSubmitResponse = z.infer<
  typeof FeedbackSubmitResponseSchema
>;

export interface FeedbackEndpoints {
  /**
   * `POST /api/v1/feedback` — анонімний сабміт фідбеку.
   *
   * Сервер відповідає `{ ok: true, id: number }`; парсимо відповідь схемою,
   * щоб неочікуваний shape (старий сервер, captive-portal, проксі-injection)
   * впав ТУТ. Для цього віджета це принципово: UI показує «надіслано» саме
   * за фактом успішного парсу, тож мовчазний фолбек на «ну щось повернулось»
   * повернув би ту саму брехню, заради усунення якої endpoint і зроблений.
   */
  submit: (
    body: FeedbackSubmitRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<FeedbackSubmitResponse>;
}

export function createFeedbackEndpoints(http: HttpClient): FeedbackEndpoints {
  return {
    submit: async (body, { signal } = {}) => {
      // `/api/feedback` → `/api/v1/feedback` через `applyApiPrefix`
      // у `HttpClient` — конвенція решти endpoint-ів цього клієнта.
      const raw = await http.post<unknown>("/api/feedback", body, { signal });
      return FeedbackSubmitResponseSchema.parse(raw);
    },
  };
}
