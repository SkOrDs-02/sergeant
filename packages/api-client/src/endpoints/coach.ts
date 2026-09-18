import type { HttpClient } from "../httpClient";

export interface CoachInsightPayload {
  snapshot: unknown;
  memory: unknown;
}

export interface CoachEndpoints {
  getMemory: () => Promise<{ memory?: unknown }>;
  postInsight: (
    payload: CoachInsightPayload,
  ) => Promise<{ insight?: string | null }>;
  postMemory: (payload: unknown) => Promise<unknown>;
}

export function createCoachEndpoints(http: HttpClient): CoachEndpoints {
  return {
    getMemory: () => http.get<{ memory?: unknown }>("/api/coach/memory"),
    postInsight: (payload) =>
      http.post<{ insight?: string | null }>("/api/coach/insight", payload),
    postMemory: (payload) => http.post<unknown>("/api/coach/memory", payload),
  };
}
