/**
 * `useWorkoutTemplates` — mobile hook for Fizruk workout templates.
 *
 * Stage 12 / PR #057f-tombstone-mobile-stage12 of
 * `docs/planning/storage-roadmap.md` (mobile parity for Stage 8
 * `#057f-tombstone` extended to the new Stage 12
 * workout-templates slot). Reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState`) and persists exclusively through
 * the dual-write pipeline (`triggerFizrukDualWrite`). The legacy
 * MMKV slot `STORAGE_KEYS.FIZRUK_TEMPLATES` is drained on first
 * boot via `importFizrukResidualFromMmkv` and removed.
 *
 * Templates carry `{ id, name, exerciseIds, groups, updatedAt,
 * lastUsedAt? }`. Mutators are no-op-guarded: passing an unknown id
 * to `update` / `remove` / `markUsed` keeps state referentially
 * identical and skips the dual-write trigger entirely.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractWorkoutTemplateSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import {
  getCachedFizrukSqliteState,
  type CachedWorkoutTemplate,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

export interface WorkoutTemplateGroup {
  id: string;
  itemIds: string[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  groups: WorkoutTemplateGroup[];
  updatedAt: string;
  lastUsedAt?: string;
}

function uid(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Project a cache row onto the loose hook shape. */
function projectFromCache(row: CachedWorkoutTemplate): WorkoutTemplate {
  const out: WorkoutTemplate = {
    id: row.id,
    name: row.name,
    exerciseIds: [...row.exerciseIds],
    groups: Array.isArray(row.groups)
      ? row.groups
          .filter(
            (g): g is { id: unknown; itemIds: unknown } =>
              !!g && typeof g === "object",
          )
          .map((g) => ({
            id: typeof g.id === "string" ? g.id : "",
            itemIds: Array.isArray(g.itemIds)
              ? (g.itemIds as readonly unknown[]).filter(
                  (x: unknown): x is string => typeof x === "string",
                )
              : [],
          }))
      : [],
    updatedAt: row.updatedAt,
  };
  if (row.lastUsedAt) out.lastUsedAt = row.lastUsedAt;
  return out;
}

function readInitialFromCache(): WorkoutTemplate[] {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return [];
  return cache.workoutTemplates.map(projectFromCache);
}

export interface UseWorkoutTemplatesResult {
  templates: readonly WorkoutTemplate[];
  recentlyUsed: readonly WorkoutTemplate[];
  addTemplate(
    name: string,
    exerciseIds: string[],
    opts?: { groups?: WorkoutTemplateGroup[] },
  ): WorkoutTemplate;
  updateTemplate(id: string, patch: Partial<WorkoutTemplate>): void;
  removeTemplate(id: string): void;
  restoreTemplate(template: WorkoutTemplate, atIndex?: number): void;
  markTemplateUsed(id: string): void;
}

export function useWorkoutTemplates(): UseWorkoutTemplatesResult {
  const [templates, setTemplates] =
    useState<WorkoutTemplate[]>(readInitialFromCache);
  // See `useFizrukWorkouts` for why we mirror state in a ref.
  const stateRef = useRef<WorkoutTemplate[]>(templates);

  // Stage 12 / PR #057f-tombstone-mobile-stage12: overlay templates
  // from the SQLite warm cache once it's available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = cache.workoutTemplates.map(projectFromCache);
    stateRef.current = overlay;
    setTemplates(overlay);
  }, [sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: WorkoutTemplate[]) => WorkoutTemplate[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;

      const prevDualWrite =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      const nextDualWrite = {
        ...prevDualWrite,
        workoutTemplates: extractWorkoutTemplateSnapshots(next),
      };
      try {
        triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
      } catch {
        /* trigger is fire-and-forget — never propagate */
      }

      setTemplates(next);
    },
    [],
  );

  const addTemplate = useCallback<UseWorkoutTemplatesResult["addTemplate"]>(
    (name, exerciseIds, opts) => {
      const trimmed = (name || "").trim();
      if (!trimmed) throw new Error("name required");
      const t: WorkoutTemplate = {
        id: uid(),
        name: trimmed,
        exerciseIds: Array.isArray(exerciseIds)
          ? exerciseIds.filter(Boolean)
          : [],
        groups: Array.isArray(opts?.groups) ? opts!.groups! : [],
        updatedAt: new Date().toISOString(),
      };
      persist((prev) => [t, ...prev]);
      return t;
    },
    [persist],
  );

  const updateTemplate = useCallback<
    UseWorkoutTemplatesResult["updateTemplate"]
  >(
    (id, patch) => {
      persist((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = {
          ...prev[idx]!,
          ...patch,
          id,
          updatedAt: new Date().toISOString(),
        };
        return next;
      });
    },
    [persist],
  );

  const removeTemplate = useCallback<
    UseWorkoutTemplatesResult["removeTemplate"]
  >(
    (id) => {
      persist((prev) => {
        const next = prev.filter((t) => t.id !== id);
        return next.length === prev.length ? prev : next;
      });
    },
    [persist],
  );

  const restoreTemplate = useCallback<
    UseWorkoutTemplatesResult["restoreTemplate"]
  >(
    (template, atIndex) => {
      if (!template?.id) return;
      persist((prev) => {
        if (prev.some((t) => t.id === template.id)) return prev;
        const next = prev.slice();
        const idx =
          typeof atIndex === "number" && atIndex >= 0
            ? Math.min(atIndex, next.length)
            : next.length;
        next.splice(idx, 0, template);
        return next;
      });
    },
    [persist],
  );

  const markTemplateUsed = useCallback<
    UseWorkoutTemplatesResult["markTemplateUsed"]
  >(
    (id) => {
      persist((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = { ...prev[idx]!, lastUsedAt: new Date().toISOString() };
        return next;
      });
    },
    [persist],
  );

  const sorted = useMemo(
    () =>
      [...templates].sort((a, b) =>
        (b.updatedAt || "").localeCompare(a.updatedAt || ""),
      ),
    [templates],
  );

  const recentlyUsed = useMemo(
    () =>
      [...templates]
        .filter((t) => t.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt || "").localeCompare(a.lastUsedAt || ""))
        .slice(0, 3),
    [templates],
  );

  return {
    templates: sorted,
    recentlyUsed,
    addTemplate,
    updateTemplate,
    removeTemplate,
    restoreTemplate,
    markTemplateUsed,
  };
}
