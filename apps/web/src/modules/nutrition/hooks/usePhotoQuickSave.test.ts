// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Зберегти в журнал» після фото пише одразу (OD-27 Х-2 а): тост «Записав у
 * … · Змінити», чесна помилка без напівзаписаної страви.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Meal } from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";

vi.mock("../lib/mealPhotoStorage", () => ({
  fileToThumbnailBlob: vi.fn(() => Promise.resolve(new Blob(["x"]))),
  saveMealThumbnail: vi.fn(() => Promise.resolve()),
}));

import { saveMealThumbnail } from "../lib/mealPhotoStorage";
import { usePhotoQuickSave } from "./usePhotoQuickSave";

function meal(id: string, kcal: number): Meal {
  return {
    id,
    name: id,
    time: "19:40",
    mealType: "dinner",
    label: "Вечеря",
    macros: { kcal, protein_g: 1, fat_g: 1, carbs_g: 1 },
    source: "photo",
    macroSource: "photoAI",
    amount_g: null,
    foodId: null,
  };
}

function setup(date = "2026-11-18", failOn?: string) {
  const log = {
    handleAddMeal: vi.fn((m: Meal) => {
      if (m.id === failOn) throw new Error("quota");
      return date;
    }),
    handleRemoveMeal: vi.fn(),
  };
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
  } as unknown as ToastApi;
  const onEdit = vi.fn();
  const { result } = renderHook(() =>
    usePhotoQuickSave({ log, toast, onEdit }),
  );
  return { save: result.current, log, toast, onEdit };
}

describe("usePhotoQuickSave", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 19, 40, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("пише всі рядки і дає тост «Записав у вечерю…» зі «Змінити»", async () => {
    const { save, log, toast, onEdit } = setup();
    const file = new File(["img"], "a.png", { type: "image/png" });
    const ok = save(
      { meals: [meal("a", 300), meal("b", 186.4)], title: "Курка з рисом" },
      file,
    );
    expect(ok).toBe(true);
    expect(log.handleAddMeal).toHaveBeenCalledTimes(2);
    const [msg, , action] = vi.mocked(toast.success).mock.calls[0]!;
    expect(msg).toBe("Записав у вечерю: Курка з рисом, 486 ккал.");
    expect(action?.label).toBe("Змінити");
    action?.onClick();
    expect(onEdit).toHaveBeenCalledWith("dinner");
    await vi.waitFor(() =>
      expect(vi.mocked(saveMealThumbnail)).toHaveBeenCalledTimes(2),
    );
  });

  it("запис не в сьогоднішній день: «Скасувати» знімає всі рядки", () => {
    const { save, log, toast, onEdit } = setup("2026-11-10");
    save({ meals: [meal("a", 300), meal("b", 100)], title: "Обід" }, null);
    const [, , action] = vi.mocked(toast.success).mock.calls[0]!;
    expect(action?.label).toBe("Скасувати");
    action?.onClick();
    expect(log.handleRemoveMeal).toHaveBeenCalledWith("2026-11-10", "a");
    expect(log.handleRemoveMeal).toHaveBeenCalledWith("2026-11-10", "b");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("збій запису: відкочує вже записане, тост помилки, без «Записав»", () => {
    const { save, log, toast } = setup("2026-11-18", "b");
    const ok = save(
      { meals: [meal("a", 300), meal("b", 100)], title: "Обід" },
      null,
    );
    expect(ok).toBe(false);
    expect(log.handleRemoveMeal).toHaveBeenCalledWith("2026-11-18", "a");
    expect(toast.success).not.toHaveBeenCalled();
    const [msg, , retry] = vi.mocked(toast.error).mock.calls[0]!;
    expect(msg).toBe("Не вдалося записати страву. Спробуй ще раз.");
    expect(retry?.label).toBe("Повторити");
  });
});
