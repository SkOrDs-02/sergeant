/**
 * Тестовий міст `window.__sergeantScenario`. Існує лише в білді з
 * `VITE_E2E_SEED=true` (гейт у `main.tsx`), у прод-бандл не потрапляє
 * (`scripts/ci/check-e2e-seed-boundary.mjs`).
 */
import type { QueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@sergeant/api-client";
import { apiQueryKeys } from "@sergeant/api-client/react";
import {
  safeReadLSDurable,
  safeWriteLSDurable,
} from "@shared/lib/storage/storage";

import { getStorageReadySnapshot } from "../core/db/storageReady";
import { readActiveSqliteUserId, readActiveSqliteVfs } from "../core/db/sqlite";
import { parseScenarioLocalWorld, waitUntil, type ScenarioId } from "./world";

export interface ScenarioSnapshot {
  readonly scenario: ScenarioId | null;
  readonly appliedAt: string | null;
  readonly pendingQueries: number;
  readonly pendingMutations: number;
  readonly sqliteReady: boolean;
}

export interface ScenarioBridge {
  apply(world: unknown): Promise<ScenarioSnapshot>;
  snapshot(): ScenarioSnapshot;
}

declare global {
  interface Window {
    __sergeantScenario?: ScenarioBridge;
  }
}

/** Мітка застосованого світу переживає `reload`, щоб тест звірив її після нього. */
const APPLIED_KEY = "sergeant.e2e.scenario.v1";

interface AppliedMark {
  readonly scenario: ScenarioId;
  readonly appliedAt: string;
}

/**
 * Auth-контекст готовий, коли `/me` осів, а для залогіненого ще й SQLite
 * перемкнуто на його партицію: до того писачі поклали б рядки в анонімну
 * базу (`AuthContext` → `switchSqliteUser`).
 */
function authReady(queryClient: QueryClient): boolean {
  const state = queryClient.getQueryState<MeResponse>(
    apiQueryKeys.me.current(),
  );
  if (!state || state.status === "pending") return false;
  const userId = state.data?.user.id ?? null;
  return userId === null || readActiveSqliteUserId() === userId;
}

export function installScenarioBridge(queryClient: QueryClient): void {
  function snapshot(): ScenarioSnapshot {
    const mark = safeReadLSDurable<AppliedMark | null>(APPLIED_KEY, null);
    return {
      scenario: mark?.scenario ?? null,
      appliedAt: mark?.appliedAt ?? null,
      pendingQueries: queryClient.isFetching(),
      pendingMutations: queryClient.isMutating(),
      sqliteReady: getStorageReadySnapshot() && readActiveSqliteVfs() !== null,
    };
  }

  async function apply(worldValue: unknown): Promise<ScenarioSnapshot> {
    const world = parseScenarioLocalWorld(worldValue);
    try {
      await waitUntil("auth", () => authReady(queryClient));
      // Писачі модулів вантажаться лише тут: статичний імпорт тягнув їх у
      // бут кожної сторінки тестового білда і змінював її поведінку.
      const { applyFinyk, applyFizruk, applyPantry, applyRoutine } =
        await import("./writers");
      await applyPantry(world);
      await applyRoutine(world);
      await applyFinyk(world);
      await applyFizruk(world);
      await waitUntil(
        "settle-queries",
        () => queryClient.isFetching() === 0 && queryClient.isMutating() === 0,
      );
      safeWriteLSDurable(APPLIED_KEY, {
        scenario: world.scenario,
        appliedAt: new Date().toISOString(),
      } satisfies AppliedMark);
      return snapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`apply scenario '${world.scenario}' failed: ${message}`);
    }
  }

  window.__sergeantScenario = { apply, snapshot };
}
