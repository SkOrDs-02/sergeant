// @vitest-environment jsdom
/**
 * Юніт-тести хука useCompletionNoteDrafts.
 *
 * Хук управляє debounced-чернетками нотаток до відміток звичок.
 * Нижче перевіряємо:
 *  - scheduleNoteFlush записує чернетку і скидає її через 300 мс (fake timers)
 *  - flushNoteDraft очищає чернетку та викликає setRoutine негайно
 *  - при анмаунті всі незбережені чернетки флашаться синхронно
 *  - повторний scheduleNoteFlush скасовує попередній таймер (debounce reset)
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useCompletionNoteDrafts } from "./useCompletionNoteDrafts";
import type { RoutineState } from "../lib/types";

// Мінімальний stub для defaultRoutineState — completionNotes достатньо
function stubState(): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: false,
    },
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    pushupsByDate: {},
    habitOrder: [],
    completionNotes: {},
  } as unknown as RoutineState;
}

describe("useCompletionNoteDrafts", () => {
  let setRoutine: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    setRoutine = vi.fn((updater) => {
      // Симулюємо React `setRoutine`: якщо функція — викликаємо з поточним стейтом
      if (typeof updater === "function") {
        updater(stubState());
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("scheduleNoteFlush записує чернетку в noteDrafts відразу", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.scheduleNoteFlush("h1", "2025-06-04", "Перший запис");
    });

    expect(Object.keys(result.current.noteDrafts)).toHaveLength(1);
  });

  it("scheduleNoteFlush флашить через 300 мс (debounce)", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.scheduleNoteFlush("h1", "2025-06-04", "Test note");
    });

    expect(setRoutine).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(setRoutine).toHaveBeenCalledOnce();
    // Після флашу чернетка зникає
    expect(Object.keys(result.current.noteDrafts)).toHaveLength(0);
  });

  it("повторний scheduleNoteFlush скидає debounce і не флашить двічі", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.scheduleNoteFlush("h1", "2025-06-04", "First");
    });
    act(() => {
      vi.advanceTimersByTime(200); // ще не 300 мс
    });
    expect(setRoutine).not.toHaveBeenCalled();

    // Ще один keystroke — скидає таймер
    act(() => {
      result.current.scheduleNoteFlush("h1", "2025-06-04", "Second");
    });
    act(() => {
      vi.advanceTimersByTime(300); // тепер 300 мс від другого виклику
    });

    expect(setRoutine).toHaveBeenCalledOnce(); // тільки один раз
  });

  it("flushNoteDraft флашить негайно і видаляє чернетку", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.scheduleNoteFlush("h2", "2025-06-05", "Immediate flush");
    });

    expect(Object.keys(result.current.noteDrafts)).toHaveLength(1);

    act(() => {
      result.current.flushNoteDraft("h2", "2025-06-05");
    });

    expect(setRoutine).toHaveBeenCalledOnce();
    expect(Object.keys(result.current.noteDrafts)).toHaveLength(0);
  });

  it("flushNoteDraft без чернетки — no-op (не кидає, не викликає setRoutine)", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.flushNoteDraft("nonexistent", "2025-06-04");
    });

    expect(setRoutine).not.toHaveBeenCalled();
  });

  it("анмаунт флашить усі незбережені чернетки синхронно", () => {
    const { result, unmount } = renderHook(() =>
      useCompletionNoteDrafts(setRoutine),
    );

    act(() => {
      result.current.scheduleNoteFlush("h1", "2025-06-04", "Note 1");
      result.current.scheduleNoteFlush("h2", "2025-06-04", "Note 2");
    });

    expect(setRoutine).not.toHaveBeenCalled();

    unmount();

    // setRoutine повинен бути викликаний під час анмаунту
    expect(setRoutine).toHaveBeenCalled();
  });

  it("setNoteExpanded та noteExpanded синхронізуються", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    expect(result.current.noteExpanded).toEqual({});

    act(() => {
      result.current.setNoteExpanded({ "h1||2025-06-04": true });
    });

    expect(result.current.noteExpanded).toEqual({ "h1||2025-06-04": true });
  });

  it("noteDraftsRef відображає актуальні чернетки після scheduleNoteFlush", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.scheduleNoteFlush("h3", "2025-06-06", "Ref check");
    });

    // ref повинен синхронно відображати поточний стан
    const refKeys = Object.keys(result.current.noteDraftsRef.current);
    expect(refKeys.length).toBe(1);
  });

  it("різні habitId+dateKey — незалежні чернетки і таймери", () => {
    const { result } = renderHook(() => useCompletionNoteDrafts(setRoutine));

    act(() => {
      result.current.scheduleNoteFlush("h1", "2025-06-04", "Note A");
      result.current.scheduleNoteFlush("h2", "2025-06-04", "Note B");
    });

    expect(Object.keys(result.current.noteDrafts)).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Обидві чернетки флашаться
    expect(setRoutine).toHaveBeenCalledTimes(2);
  });
});
