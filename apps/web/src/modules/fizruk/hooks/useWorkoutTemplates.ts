import { useCallback, useEffect, useMemo, useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

import { triggerFizrukDualWrite } from "../lib/dualWrite/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractWorkoutTemplateSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

const KEY = STORAGE_KEYS.FIZRUK_TEMPLATES;

export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  groups: unknown[];
  updatedAt?: string;
  lastUsedAt?: string;
  [key: string]: unknown;
}

type TemplatesUpdater =
  | WorkoutTemplate[]
  | ((prev: WorkoutTemplate[]) => WorkoutTemplate[]);

function uid() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useWorkoutTemplates() {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  // `loaded` lets consumers distinguish "first paint before the read"
  // from "read complete, genuinely empty" — without it the Dashboard
  // computes its hero/KPI state from an empty array and flashes the
  // empty/zero UI for returning users before hydration.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Cache-first: prefer the warm SQLite cache over the LS blob so
    // templates don't regress to a stale LS snapshot once SQLite is
    // the source of truth. LS remains a write-mirror fallback via
    // `persist` below — see `residualImport.ts` for the boot-time
    // drain of legacy LS data.
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt !== null) {
      setTemplates(cache.workoutTemplates as WorkoutTemplate[]);
      setLoaded(true);
      return;
    }
    const parsed = safeReadLS(KEY, []);
    if (Array.isArray(parsed)) setTemplates(parsed as WorkoutTemplate[]);
    setLoaded(true);
  }, []);

  // Overlay templates from the SQLite cache once it's warm.
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setTemplates(cache.workoutTemplates as WorkoutTemplate[]);
    setLoaded(true);
  }, [sqliteCacheTick]);

  // Функціональний updater через setTemplates, щоб уникнути stale closure:
  // колбеки в undo-toast можуть викликатись після того, як state оновився
  // (див. AGENTS.md §5.11).
  const persist = useCallback((updater: TemplatesUpdater) => {
    setTemplates((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      safeWriteLS(KEY, next);
      // Stage 12 / PR #070f-dualwrite — mirror template writes into
      // SQLite via the dual-write pipeline. Fire-and-forget; the
      // trigger is a no-op when no dual-write context is registered.
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
      return next;
    });
  }, []);

  const addTemplate = useCallback(
    (
      name: string,
      exerciseIds: string[],
      { groups }: { groups?: unknown[] } = {},
    ) => {
      const n = (name || "").trim();
      if (!n) throw new Error("name required");
      const ids = Array.isArray(exerciseIds) ? exerciseIds.filter(Boolean) : [];
      const t = {
        id: uid(),
        name: n,
        exerciseIds: ids,
        groups: Array.isArray(groups) ? groups : [],
        // eslint-disable-next-line no-restricted-syntax -- UTC-anchored updatedAt timestamp, not a Kyiv day-boundary calc
        updatedAt: new Date().toISOString(),
      };
      persist((prev) => [t, ...prev]);
      return t;
    },
    [persist],
  );

  const updateTemplate = useCallback(
    (id: string, patch: Partial<WorkoutTemplate>) => {
      persist((prev) =>
        prev.map((t) =>
          t.id === id
            ? // eslint-disable-next-line no-restricted-syntax -- UTC-anchored updatedAt timestamp
              { ...t, ...patch, updatedAt: new Date().toISOString() }
            : t,
        ),
      );
    },
    [persist],
  );

  const removeTemplate = useCallback(
    (id: string) => {
      persist((prev) => prev.filter((t) => t.id !== id));
    },
    [persist],
  );

  const restoreTemplate = useCallback(
    (template: WorkoutTemplate | null | undefined, atIndex?: number) => {
      if (!template || !template.id) return;
      persist((prev) => {
        if (prev.some((t) => t.id === template.id)) return prev;
        const next = [...prev];
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

  const markTemplateUsed = useCallback(
    (id: string) => {
      persist((prev) =>
        prev.map((t) =>
          t.id === id
            ? // eslint-disable-next-line no-restricted-syntax -- UTC-anchored lastUsedAt timestamp
              { ...t, lastUsedAt: new Date().toISOString() }
            : t,
        ),
      );
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
    loaded,
    recentlyUsed,
    addTemplate,
    updateTemplate,
    removeTemplate,
    restoreTemplate,
    markTemplateUsed,
  };
}
