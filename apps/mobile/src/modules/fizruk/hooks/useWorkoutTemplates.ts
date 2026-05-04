/**
 * `useWorkoutTemplates` — mobile hook for Fizruk workout templates.
 *
 * Persists under `STORAGE_KEYS.FIZRUK_TEMPLATES`
 * (`fizruk_workout_templates_v1`), the same slot the web hook
 * `apps/web/src/modules/fizruk/hooks/useWorkoutTemplates.ts` writes to.
 *
 * Templates carry `{ id, name, exerciseIds, groups, updatedAt,
 * lastUsedAt? }`. Mutators no-op (skip `enqueueChange`) when invoked
 * with an unknown id (`update`, `remove`, `markUsed`) or when restoring
 * a template whose id is already present.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { enqueueChange } from "@/sync/enqueue";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_TEMPLATES;

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

function readList(): WorkoutTemplate[] {
  const raw = safeReadLS<unknown>(STORAGE_KEY, []);
  return Array.isArray(raw) ? (raw as WorkoutTemplate[]) : [];
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
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(readList);
  // See `useFizrukWorkouts` for why we mirror state in a ref.
  const stateRef = useRef<WorkoutTemplate[]>(templates);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = readList();
      stateRef.current = fresh;
      setTemplates(fresh);
    });
    return () => sub.remove();
  }, []);

  const persist = useCallback(
    (updater: (prev: WorkoutTemplate[]) => WorkoutTemplate[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;
      safeWriteLS(STORAGE_KEY, next);
      enqueueChange(STORAGE_KEY);
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
