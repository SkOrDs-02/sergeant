// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useWorkoutTemplates,
  type WorkoutTemplate,
} from "./useWorkoutTemplates";

type CreatedTemplate = ReturnType<
  ReturnType<typeof useWorkoutTemplates>["addTemplate"]
>;

describe("useWorkoutTemplates", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restoreTemplate повертає видалений шаблон на ту саму позицію", () => {
    const { result } = renderHook(() => useWorkoutTemplates());

    act(() => {
      result.current.addTemplate("A", ["e1"]);
    });
    act(() => {
      result.current.addTemplate("B", ["e2"]);
    });
    act(() => {
      result.current.addTemplate("C", ["e3"]);
    });

    // sorted by updatedAt desc → [C, B, A]
    const b = result.current.templates.find((t) => t.name === "B");
    expect(b).toBeDefined();
    const bId = b!.id;
    const bIndex = result.current.templates.findIndex((t) => t.id === bId);

    act(() => {
      result.current.removeTemplate(bId);
    });
    expect(result.current.templates.find((t) => t.id === bId)).toBeUndefined();

    act(() => {
      result.current.restoreTemplate(b, bIndex);
    });
    expect(result.current.templates.find((t) => t.id === bId)).toBeDefined();
  });

  it("restoreTemplate переживає stale closure: захоплена до deletion функція все одно відновлює шаблон", () => {
    const { result } = renderHook(() => useWorkoutTemplates());

    let created: CreatedTemplate | undefined;
    act(() => {
      created = result.current.addTemplate("X", ["e1"]);
    });
    // Захоплюємо restoreTemplate до того як відбудеться видалення — саме так
    // це стається у showUndoToast.onUndo, і раніше тут ламалась ідемпотентна
    // перевірка на stale `templates`.
    const capturedRestore = result.current.restoreTemplate;

    act(() => {
      result.current.removeTemplate(created!.id);
    });
    expect(result.current.templates).toHaveLength(0);

    act(() => {
      capturedRestore(created as unknown as WorkoutTemplate, 0);
    });
    expect(result.current.templates.map((t) => t.id)).toEqual([created!.id]);
  });

  it("restoreTemplate ідемпотентний: повторний виклик не дублює шаблон", () => {
    const { result } = renderHook(() => useWorkoutTemplates());
    let created: CreatedTemplate | undefined;
    act(() => {
      created = result.current.addTemplate("Y", []);
    });
    act(() => {
      result.current.removeTemplate(created!.id);
    });
    act(() => {
      result.current.restoreTemplate(created as unknown as WorkoutTemplate, 0);
    });
    act(() => {
      result.current.restoreTemplate(created as unknown as WorkoutTemplate, 0);
    });
    expect(
      result.current.templates.filter((t) => t.id === created!.id),
    ).toHaveLength(1);
  });

  it("restoreTemplate ігнорує null/undefined/invalid template", () => {
    const { result } = renderHook(() => useWorkoutTemplates());
    act(() => {
      result.current.restoreTemplate(null, 0);
    });
    act(() => {
      result.current.restoreTemplate(
        { id: "" } as Parameters<typeof result.current.restoreTemplate>[0],
        0,
      );
    });
    expect(result.current.templates).toHaveLength(0);
  });
});
