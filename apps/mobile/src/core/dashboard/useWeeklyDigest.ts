/**
 * Мобільний `useWeeklyDigest` — дзеркалить `apps/web/src/core/insights/useWeeklyDigest.ts`.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "@sergeant/api-client";
import { useApiClient, apiQueryKeys } from "@sergeant/api-client/react";
import { getWeekKey } from "@sergeant/shared";

import {
  buildWeeklyDigestPayload,
  getWeekRange,
} from "./weeklyDigestAggregates";
import { loadDigest, saveDigest } from "./weeklyDigestStorage";

function formatGenError(e: unknown): string {
  if (isApiError(e)) {
    return e.serverMessage ?? e.message ?? "Помилка генерації звіту";
  }
  return e instanceof Error ? e.message : "Помилка генерації звіту";
}

export function useWeeklyDigest(selectedWeekKey?: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const currentWeekKey = getWeekKey();
  const weekKey = selectedWeekKey ?? currentWeekKey;
  const weekRange = useMemo(
    () => getWeekRange(new Date(weekKey + "T12:00:00")),
    [weekKey],
  );
  const isCurrentWeek = weekKey === currentWeekKey;

  const wk = apiQueryKeys.weeklyDigest.byWeek(weekKey);

  const query = useQuery({
    queryKey: wk,
    queryFn: () => loadDigest(weekKey) ?? null,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: () => loadDigest(weekKey) ?? undefined,
    initialDataUpdatedAt: () => {
      const existing = loadDigest(weekKey);
      return existing ? Date.now() : undefined;
    },
  });

  const mutation = useMutation({
    mutationFn: async (key: string) => {
      const json = (await api.weeklyDigest.generate(
        buildWeeklyDigestPayload(key),
      )) as { report?: unknown; generatedAt?: string };

      if (!json.generatedAt) {
        throw new Error("Сервер не повернув generatedAt");
      }

      const currentWeekRange = getWeekRange(new Date(key + "T12:00:00"));
      return {
        report: json.report,
        generatedAt: json.generatedAt,
        weekKey: key,
        weekRange: currentWeekRange,
      };
    },
    onSuccess: ({ report, generatedAt, weekKey: wkKey, weekRange: wr }) => {
      const newDigest = {
        ...(report as object),
        generatedAt,
        weekKey: wkKey,
        weekRange: wr,
      };
      saveDigest(wkKey, newDigest);
      queryClient.setQueryData(
        apiQueryKeys.weeklyDigest.byWeek(wkKey),
        newDigest,
      );
      queryClient.invalidateQueries({
        queryKey: apiQueryKeys.weeklyDigest.history,
      });
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.coach.all });

      void api.coach
        .postMemory({
          weeklyDigest: {
            weekKey: wkKey,
            weekRange: wr,
            generatedAt,
            ...(report as object),
          },
        })
        .catch((err: unknown) => {
          console.warn("[weeklyDigest] coach.postMemory failed", err);
        });
    },
  });

  const { mutateAsync } = mutation;

  const generate = useCallback(async () => {
    if (!isCurrentWeek) return null;
    try {
      const result = await mutateAsync(weekKey);
      return {
        ...(result.report as object),
        generatedAt: result.generatedAt,
        weekKey: result.weekKey,
        weekRange: result.weekRange,
      };
    } catch {
      return null;
    }
  }, [weekKey, isCurrentWeek, mutateAsync]);

  return {
    digest: query.data ?? null,
    loading: mutation.isPending,
    error: mutation.error ? formatGenError(mutation.error) : null,
    weekKey,
    weekRange,
    generate,
    isCurrentWeek,
  };
}
