// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTrainingProgram } from "./useTrainingProgram";

const ACTIVE_PROGRAM_KEY = "fizruk_active_program_id_v1";

describe("useTrainingProgram", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes the built-in program list and no active program by default", () => {
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.programs.length).toBeGreaterThan(0);
    expect(result.current.activeProgramId).toBeNull();
    expect(result.current.activeProgram).toBeNull();
  });

  it("activates a program, persists it, and resolves the program object", () => {
    const { result } = renderHook(() => useTrainingProgram());
    const id = result.current.programs[0]!.id;
    act(() => result.current.activateProgram(id));
    expect(result.current.activeProgramId).toBe(id);
    expect(result.current.activeProgram?.id).toBe(id);
    expect(localStorage.getItem(ACTIVE_PROGRAM_KEY)).toBe(id);
  });

  it("deactivates and clears persistence", () => {
    const { result } = renderHook(() => useTrainingProgram());
    const id = result.current.programs[0]!.id;
    act(() => result.current.activateProgram(id));
    act(() => result.current.deactivateProgram());
    expect(result.current.activeProgramId).toBeNull();
    expect(result.current.activeProgram).toBeNull();
    expect(localStorage.getItem(ACTIVE_PROGRAM_KEY)).toBeNull();
  });

  it("hydrates an active program from storage", () => {
    const { result: seed } = renderHook(() => useTrainingProgram());
    const id = seed.current.programs[0]!.id;
    localStorage.setItem(ACTIVE_PROGRAM_KEY, id);
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.activeProgramId).toBe(id);
  });

  it("activateProgram(null) clears an active program", () => {
    const { result } = renderHook(() => useTrainingProgram());
    const id = result.current.programs[0]!.id;
    act(() => result.current.activateProgram(id));
    act(() => result.current.activateProgram(null));
    expect(result.current.activeProgramId).toBeNull();
  });
});
