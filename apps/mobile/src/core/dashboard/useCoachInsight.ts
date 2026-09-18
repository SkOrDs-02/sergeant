import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError, type ApiClient } from "@sergeant/api-client";
import { useApiClient, apiQueryKeys } from "@sergeant/api-client/react";

import { aggregateCurrentSnapshot } from "./coachSnapshot";
import { safeReadLS, safeWriteLS } from "@/lib/storage";

const CACHE_KEY = "hub_coach_insight_cache_v1";

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadInitialInsight(todayKey: string): string | undefined {
  const cached = safeReadLS<{ date?: string; text?: string } | null>(
    CACHE_KEY,
    null,
  );
  if (cached?.date === todayKey && typeof cached?.text === "string") {
    return cached.text;
  }
  return undefined;
}

async function fetchCoachInsight(api: ApiClient): Promise<string | null> {
  let memory: unknown = null;
  try {
    const memJson = await api.coach.getMemory();
    memory = memJson?.memory ?? null;
  } catch {
    /* ok without memory */
  }

  const snapshot = aggregateCurrentSnapshot();
  const insightJson = await api.coach.postInsight({ snapshot, memory });
  return insightJson?.insight ?? null;
}

export interface UseCoachInsightResult {
  insight: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<unknown>;
}

export function useCoachInsight(
  options: { enabled?: boolean } = {},
): UseCoachInsightResult {
  const { enabled = true } = options;
  const api = useApiClient();
  const queryClient = useQueryClient();
  const todayKey = localDateKey();
  const qk = apiQueryKeys.coach.insight(todayKey);

  const query = useQuery({
    queryKey: qk,
    queryFn: () => fetchCoachInsight(api),
    enabled,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    initialData: enabled ? () => loadInitialInsight(todayKey) : undefined,
    initialDataUpdatedAt: () => {
      if (!enabled) return undefined;
      const cached = safeReadLS<{ date?: string } | null>(CACHE_KEY, null);
      if (cached?.date !== todayKey) return undefined;
      return Date.now();
    },
  });

  useEffect(() => {
    if (
      typeof query.data === "string" &&
      query.data.length > 0 &&
      !query.isFetching
    ) {
      const cached = safeReadLS<{ date?: string; text?: string } | null>(
        CACHE_KEY,
        null,
      );
      if (cached?.date !== todayKey || cached?.text !== query.data) {
        safeWriteLS(CACHE_KEY, { date: todayKey, text: query.data });
      }
    }
  }, [query.data, query.isFetching, todayKey]);

  const { refetch } = query;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: apiQueryKeys.coach.all });
    return refetch();
  }, [queryClient, refetch]);

  return {
    insight: query.data ?? null,
    loading: query.isPending || query.isFetching,
    error: query.error
      ? isApiError(query.error) && query.error.kind === "http"
        ? query.error.serverMessage || "Помилка генерації інсайту"
        : (query.error as Error).message || "Помилка завантаження"
      : null,
    refresh,
  };
}
