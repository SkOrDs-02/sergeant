/**
 * Overlay tests for `useWorkoutTemplates` (Stage 12 / PR
 * #057f-tombstone-mobile-stage12 — mobile).
 *
 * Verifies the SQLite cache → hook overlay path for workout
 * templates. Pre-boot the hook starts empty; once the cache is warm
 * the hook surfaces the templates list. Mutators (`addTemplate`,
 * `updateTemplate`, `removeTemplate`, `markTemplateUsed`) update
 * in-memory state and never touch MMKV. No-op guards keep state
 * referentially identical when the operation is meaningless
 * (unknown id / empty patch).
 */
import { act, renderHook } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import {
  notifyFizrukSqliteCacheRefresh,
  __resetFizrukSqliteReadGateForTests,
} from "../../lib/sqliteReadGate";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../lib/sqliteReader";
import { useWorkoutTemplates } from "../useWorkoutTemplates";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useWorkoutTemplates — SQLite read overlay (Stage 12)", () => {
  it("starts empty when the cache is cold", () => {
    const { result } = renderHook(() => useWorkoutTemplates());
    expect(result.current.templates).toEqual([]);
    expect(result.current.recentlyUsed).toEqual([]);
  });

  it("overlays templates from the warm cache (sorted: recently-used first internally)", () => {
    __setFizrukSqliteCacheForTests({
      workoutTemplates: [
        {
          id: "tpl-a",
          name: "Push day",
          exerciseIds: ["bench", "ohp"],
          groups: [],
          updatedAt: "2026-04-01T00:00:00.000Z",
          lastUsedAt: null,
        },
        {
          id: "tpl-b",
          name: "Pull day",
          exerciseIds: ["row"],
          groups: [],
          updatedAt: "2026-04-02T00:00:00.000Z",
          lastUsedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });

    const { result } = renderHook(() => useWorkoutTemplates());

    const ids = result.current.templates.map((t) => t.id).sort();
    expect(ids).toEqual(["tpl-a", "tpl-b"]);
    // `recentlyUsed` only includes templates with a `lastUsedAt`.
    expect(result.current.recentlyUsed.map((t) => t.id)).toEqual(["tpl-b"]);
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires", () => {
    __setFizrukSqliteCacheForTests({
      workoutTemplates: [
        {
          id: "tpl-1",
          name: "First",
          exerciseIds: [],
          groups: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastUsedAt: null,
        },
      ],
    });

    const { result } = renderHook(() => useWorkoutTemplates());
    expect(result.current.templates.map((t) => t.id)).toEqual(["tpl-1"]);

    __setFizrukSqliteCacheForTests({
      workoutTemplates: [
        {
          id: "tpl-2",
          name: "Second",
          exerciseIds: [],
          groups: [],
          updatedAt: "2026-02-01T00:00:00.000Z",
          lastUsedAt: null,
        },
      ],
    });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    expect(result.current.templates.map((t) => t.id)).toEqual(["tpl-2"]);
  });

  it("addTemplate updates state and never writes to MMKV", () => {
    const { result } = renderHook(() => useWorkoutTemplates());

    let created: ReturnType<typeof result.current.addTemplate> | null = null;
    act(() => {
      created = result.current.addTemplate("Legs day", ["squat", "deadlift"]);
    });

    expect(created).not.toBeNull();
    expect(result.current.templates.length).toBe(1);
    expect(result.current.templates[0]?.name).toBe("Legs day");
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_TEMPLATES)).toBe(
      false,
    );
  });

  it("updateTemplate on an unknown id leaves state referentially identical", () => {
    __setFizrukSqliteCacheForTests({
      workoutTemplates: [
        {
          id: "tpl-1",
          name: "Push day",
          exerciseIds: [],
          groups: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastUsedAt: null,
        },
      ],
    });

    const { result } = renderHook(() => useWorkoutTemplates());
    const before = result.current.templates;

    act(() => {
      result.current.updateTemplate("does-not-exist", { name: "X" });
    });

    expect(result.current.templates).toBe(before);
  });

  it("removeTemplate / markTemplateUsed update state without MMKV writes", () => {
    __setFizrukSqliteCacheForTests({
      workoutTemplates: [
        {
          id: "tpl-1",
          name: "Push day",
          exerciseIds: [],
          groups: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastUsedAt: null,
        },
        {
          id: "tpl-2",
          name: "Pull day",
          exerciseIds: [],
          groups: [],
          updatedAt: "2026-01-02T00:00:00.000Z",
          lastUsedAt: null,
        },
      ],
    });

    const { result } = renderHook(() => useWorkoutTemplates());

    act(() => {
      result.current.markTemplateUsed("tpl-2");
    });
    expect(
      result.current.templates.find((t) => t.id === "tpl-2")?.lastUsedAt,
    ).toBeTruthy();

    act(() => {
      result.current.removeTemplate("tpl-1");
    });
    expect(result.current.templates.map((t) => t.id)).toEqual(["tpl-2"]);
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_TEMPLATES)).toBe(
      false,
    );
  });
});
