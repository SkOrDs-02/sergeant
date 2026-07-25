import {
  MeDeleteResponseSchema,
  AiMemoryClearResponseSchema,
  AiMemoryDeleteResponseSchema,
  AiMemoryListResponseSchema,
  MeExportResponseSchema,
  MeResponseSchema,
  UserPreferencesPatchSchema,
  UserPreferencesSchema,
  type MeDeleteResponse,
  type AiMemoryClearResponse,
  type AiMemoryDeleteResponse,
  type AiMemoryListItem,
  type AiMemoryListResponse,
  type MeExportResponse,
  type MeResponse,
  type User,
  type UserPreferences,
  type UserPreferencesPatch,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

export interface MeEndpoints {
  /**
   * GET /api/me — повертає публічний профіль поточного користувача.
   * Відповідь валідується `MeResponseSchema` з `@sergeant/shared`, тож
   * типізація й runtime-перевірка — з одного джерела правди.
   */
  get: (opts?: Pick<RequestOptions, "signal">) => Promise<MeResponse>;
  exportData: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<MeExportResponse>;
  getPreferences: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<UserPreferences>;
  updatePreferences: (
    patch: UserPreferencesPatch,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<UserPreferences>;
  deleteAccount: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<MeDeleteResponse>;
  clearAiMemory: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<AiMemoryClearResponse>;
  /**
   * `GET /api/ai-memory/list` — сторінка фактів, які асистент про тебе
   * запам'ятав. `cursor` — `nextCursor` попередньої сторінки.
   *
   * AI-CONTEXT: живе в `me`-групі поруч із `clearAiMemory`, хоч шлях і
   * `/api/ai-memory/*`. Це свідомо: всі три виклики обслуговують один
   * екран «Згода та дані» в налаштуваннях, і розводити їх по двох
   * групах заради збігу з URL-префіксом — гірше для call-site-ів.
   */
  listAiMemory: (
    params?: { limit?: number; cursor?: number },
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<AiMemoryListResponse>;
  /** `DELETE /api/ai-memory/:id` — стерти один факт. Назавжди. */
  deleteAiMemory: (
    id: number,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<AiMemoryDeleteResponse>;
}

export function createMeEndpoints(http: HttpClient): MeEndpoints {
  return {
    get: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/me", { signal });
      return MeResponseSchema.parse(raw);
    },
    exportData: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/me/export", { signal });
      return MeExportResponseSchema.parse(raw);
    },
    getPreferences: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/me/preferences", { signal });
      return UserPreferencesSchema.parse(raw);
    },
    updatePreferences: async (patch, { signal } = {}) => {
      const body = UserPreferencesPatchSchema.parse(patch);
      const raw = await http.patch<unknown>("/api/me/preferences", body, {
        signal,
      });
      return UserPreferencesSchema.parse(raw);
    },
    deleteAccount: async ({ signal } = {}) => {
      const raw = await http.del<unknown>("/api/me", undefined, { signal });
      return MeDeleteResponseSchema.parse(raw);
    },
    clearAiMemory: async ({ signal } = {}) => {
      const raw = await http.del<unknown>("/api/ai-memory", undefined, {
        signal,
      });
      return AiMemoryClearResponseSchema.parse(raw);
    },
    listAiMemory: async (params = {}, { signal } = {}) => {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.cursor !== undefined) qs.set("cursor", String(params.cursor));
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      const raw = await http.get<unknown>(`/api/ai-memory/list${suffix}`, {
        signal,
      });
      return AiMemoryListResponseSchema.parse(raw);
    },
    deleteAiMemory: async (id, { signal } = {}) => {
      const raw = await http.del<unknown>(`/api/ai-memory/${id}`, undefined, {
        signal,
      });
      return AiMemoryDeleteResponseSchema.parse(raw);
    },
  };
}

export type {
  MeDeleteResponse,
  AiMemoryClearResponse,
  AiMemoryDeleteResponse,
  AiMemoryListItem,
  AiMemoryListResponse,
  MeExportResponse,
  MeResponse,
  User,
  UserPreferences,
  UserPreferencesPatch,
};
