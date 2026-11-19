/**
 * Серверна копія тижневого звіту (С-3 (а), рішення власника 2026-11-18,
 * OD-30): автогенерація питає «чи є звіт за тиждень ДЕ-НЕБУДЬ», а не лише
 * на цьому пристрої.
 *
 * Джерело — памʼять коуча (`GET /api/coach/memory`). Після кожної генерації
 * клієнт шле туди повний звіт (`useWeeklyDigest` → `coachApi.postMemory`),
 * схема приймає блоки модулів дослівно (`CoachMemoryPostSchema`, поля
 * модулів `z.unknown()`), а `mergeMemory` (`apps/server/src/modules/chat/
 * coach.ts`) тримає один запис на `weekKey`, 12 останніх тижнів. Тобто з
 * запису відновлюється рівно той обʼєкт, який генерація кладе в сховище.
 *
 * Запис, з якого картку чесно не відмалювати (зламана форма звіту чи жодного
 * модуля), вважається відсутнім: тоді звіт генерується, як і раніше.
 */
import type { QueryClient } from "@tanstack/react-query";
import { WeeklyDigestReportSchema } from "@sergeant/shared";
import { coachApi } from "@shared/api";
import { coachKeys } from "@shared/lib/api/queryKeys";
import {
  getWeekRange,
  persistDigest,
  type WeeklyDigest,
} from "./useWeeklyDigest";

/**
 * Стеля очікування читання. `getMemory` не має власного таймауту, а завислий
 * запит тримав би прохід автогенерації без кінця.
 */
export const SERVER_DIGEST_READ_TIMEOUT_MS = 10_000;

interface MemoryEntry {
  weekKey?: unknown;
  weekRange?: unknown;
  generatedAt?: unknown;
  finyk?: unknown;
  fizruk?: unknown;
  nutrition?: unknown;
  routine?: unknown;
  overallRecommendations?: unknown;
}

/**
 * Звіт тижня з памʼяті коуча у формі локального запису або `null`.
 * Службові `correlations` памʼяті коуча (рядки для промпту чату) до картки
 * не потрапляють: генерація їх у сховище теж не кладе.
 */
export function serverDigestFromMemory(
  memory: unknown,
  weekKey: string,
): WeeklyDigest | null {
  const digests = (memory as { weeklyDigests?: unknown } | null)?.weeklyDigests;
  if (!Array.isArray(digests)) return null;
  const entry = (digests as MemoryEntry[]).find(
    (d) => d && d.weekKey === weekKey,
  );
  if (!entry || typeof entry.generatedAt !== "string") return null;

  const report = WeeklyDigestReportSchema.safeParse({
    finyk: entry.finyk ?? null,
    fizruk: entry.fizruk ?? null,
    nutrition: entry.nutrition ?? null,
    routine: entry.routine ?? null,
    overallRecommendations: entry.overallRecommendations ?? [],
  });
  if (!report.success) return null;
  const r = report.data;
  // Та сама умова, за якою картка показує порожній стан замість звіту.
  if (!(r.finyk || r.fizruk || r.nutrition || r.routine)) return null;

  return {
    ...r,
    generatedAt: entry.generatedAt,
    weekKey,
    weekRange:
      typeof entry.weekRange === "string" && entry.weekRange
        ? entry.weekRange
        : getWeekRange(new Date(`${weekKey}T12:00:00`)),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Читає памʼять коуча (ключ із фабрики, без кешу: питання саме «що зараз на
 * сервері») і повертає звіт тижня або `null`. Помилку чи таймаут кидає далі:
 * що з ними робити, вирішує викликач.
 */
export async function readServerDigest(
  queryClient: QueryClient,
  weekKey: string,
): Promise<WeeklyDigest | null> {
  const data = await withTimeout(
    queryClient.fetchQuery({
      queryKey: coachKeys.memory,
      queryFn: () => coachApi.getMemory(),
      staleTime: 0,
      retry: false,
    }),
    SERVER_DIGEST_READ_TIMEOUT_MS,
  );
  return serverDigestFromMemory(data?.memory ?? null, weekKey);
}

/** Кладе серверний звіт на пристрій тим самим шляхом, що й генерація. */
export function adoptServerDigest(
  queryClient: QueryClient,
  digest: WeeklyDigest,
): void {
  persistDigest(queryClient, digest);
}
