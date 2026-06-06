import {
  MeDeleteResponseSchema,
  MeExportResponseSchema,
  MeResponseSchema,
  UserPreferencesPatchSchema,
  UserPreferencesSchema,
  type MeDeleteResponse,
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
  };
}

export type {
  MeDeleteResponse,
  MeExportResponse,
  MeResponse,
  User,
  UserPreferences,
  UserPreferencesPatch,
};
