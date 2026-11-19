// @vitest-environment jsdom
/**
 * Last validated: 2026-11-17
 * Status: Active
 *
 * Позначка травми — жорстке застереження на старті шаблону (ADR-0083).
 * Раніше оркестратор питав `recoveryConflictsForExercise(ex, rec.by)` без
 * активних позначок, тож шаблон із жимом при болю в плечі стартував без
 * жодного підтвердження (аудит 2026-11-17, §3.4).
 *
 * Мокаємо лише `useInjuries`: `useRecovery` справжній, тож тест ловить
 * увесь ланцюг «позначка → rec.injurySites → виклик домену».
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import type { InjurySiteId } from "@sergeant/fizruk-domain/data";
import { RestTimerProvider } from "../context/RestTimerProvider";
import { useWorkoutsOrchestrator } from "./useWorkoutsOrchestrator";

const injuryState = vi.hoisted(() => ({
  sites: new Set<string>(),
}));

vi.mock("./useInjuries", () => ({
  useInjuries: () => ({
    all: [],
    active: [],
    activeSites: injuryState.sites as ReadonlySet<InjurySiteId>,
    mark: () => {},
    markMany: () => {},
    clear: () => {},
    remove: () => {},
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <RestTimerProvider>{children}</RestTimerProvider>
    </ToastProvider>
  );
}

const BENCH = "bench_press_barbell";

describe("useWorkoutsOrchestrator — позначка травми (ADR-0083)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    injuryState.sites = new Set();
  });

  it("шаблон із вправою на травмовану зону просить підтвердження", () => {
    injuryState.sites = new Set(["shoulder"]);
    const { result } = renderHook(() => useWorkoutsOrchestrator(), {
      wrapper,
    });
    expect(result.current.exercises.some((e) => e.id === BENCH)).toBe(true);

    act(() =>
      result.current.startWorkoutFromTemplate({
        id: "tpl-bench",
        name: "Груди",
        exerciseIds: [BENCH],
        groups: [],
      } as never),
    );

    expect(result.current.riskyTemplateConfirm).toMatchObject({
      id: "tpl-bench",
    });
    expect(result.current.activeWorkoutId).toBeNull();
  });

  it("без позначок той самий шаблон стартує одразу", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator(), {
      wrapper,
    });
    act(() =>
      result.current.startWorkoutFromTemplate({
        id: "tpl-bench",
        name: "Груди",
        exerciseIds: [BENCH],
        groups: [],
      } as never),
    );
    expect(result.current.riskyTemplateConfirm).toBeNull();
    expect(result.current.activeWorkoutId).not.toBeNull();
  });
});
