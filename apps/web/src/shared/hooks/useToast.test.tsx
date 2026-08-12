// @vitest-environment jsdom
import { type ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ToastProvider, useToast, type ToastAction } from "./useToast";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("requires ToastProvider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within <ToastProvider>",
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it("shows typed toasts with normalized actions and queues them FIFO", () => {
    vi.useFakeTimers();
    const actionClick = vi.fn();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success("saved", 10_000, {
        label: "",
        onClick: actionClick,
      });
      result.current.error("failed", 10_000, {
        label: "Retry",
        onClick: actionClick,
      });
      result.current.info("info", 10_000);
      result.current.warning("warning", 10_000);
      result.current.show("plain", undefined, 10_000, {
        label: "Ignored",
      } as unknown as ToastAction);
      result.current.show("latest", "info", 10_000);
    });

    // Нічого не втрачено — просто хвіст чекає у черзі (рендериться лише
    // перша трійка, це відповідальність `<ToastContainer>`).
    expect(result.current.toasts.map((toast) => toast.msg)).toEqual([
      "saved",
      "failed",
      "info",
      "warning",
      "plain",
      "latest",
    ]);
    expect(result.current.toasts[1]).toMatchObject({
      type: "error",
      action: { label: "Retry", onClick: actionClick },
      duration: 10_000,
    });
    // 4-й аргумент без `onClick` — не action, тост рендериться без кнопки.
    expect(result.current.toasts[4]?.action).toBeNull();
    // Порожній label нормалізується до дефолтного.
    expect(result.current.toasts[0]?.action?.label).toBe("Дія");

    unmount();
  });

  it("тримає таймер лише для видимого вікна; черга стартує після звільнення слота", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.info("a", 1000);
      result.current.info("b", 1000);
      result.current.info("c", 1000);
      result.current.info("d", 1000);
    });

    // "d" чекає — його відлік ще не почався.
    act(() => {
      vi.advanceTimersByTime(1000 + 200);
    });
    expect(result.current.toasts.map((t) => t.msg)).toEqual(["d"]);

    // …і тільки тепер "d" горить свою повну секунду.
    act(() => {
      vi.advanceTimersByTime(1000 + 200);
    });
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("коалесить однакові тости без action у лічильник замість нового аркуша", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let firstId = 0;
    let secondId = 0;
    act(() => {
      firstId = result.current.success("Збережено", 1000);
      vi.advanceTimersByTime(600);
      secondId = result.current.success("Збережено", 1000);
    });

    expect(secondId).toBe(firstId);
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.repeat).toBe(2);

    // Відлік перезапустився з нуля — 600 мс, що вже минули, не рахуються.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(400 + 200);
    });
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("НЕ коалесить тости з action — кожен несе власне undo-замикання", () => {
    vi.useFakeTimers();
    const undoA = vi.fn();
    const undoB = vi.fn();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.info("Операцію приховано", 5000, {
        label: "Повернути",
        onClick: undoA,
      });
      result.current.info("Операцію приховано", 5000, {
        label: "Повернути",
        onClick: undoB,
      });
    });

    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0]?.action?.onClick).toBe(undoA);
    expect(result.current.toasts[1]?.action?.onClick).toBe(undoB);

    unmount();
  });

  it("captures default durations by type", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success("success");
      result.current.info("info");
      result.current.warning("warning");
      result.current.error("error");
    });

    expect(result.current.toasts.map((toast) => toast.duration)).toEqual([
      3500, 3500, 5000, 5000,
    ]);

    unmount();
  });

  it("keeps a null-duration toast until the user dismisses it", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.info("Доступна нова версія", null, {
        label: "Оновити",
        dismissLabel: "Пізніше",
        onClick: vi.fn(),
      });
    });

    expect(result.current.toasts[0]).toMatchObject({
      duration: null,
      action: { label: "Оновити", dismissLabel: "Пізніше" },
    });

    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(result.current.toasts).toHaveLength(1);

    act(() => result.current.dismiss(id));
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("marks a toast as leaving before removing it on dismiss", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.info("dismiss me", 10_000);
    });
    act(() => result.current.dismiss(id));

    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => vi.advanceTimersByTime(199));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("auto-dismisses after the configured duration and exit transition", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.show("short lived", "success", 100);
    });

    act(() => vi.advanceTimersByTime(99));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("pauses and resumes the remaining auto-dismiss countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.warning("read me", 1000);
    });

    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.pause(id));
    act(() => result.current.pause(id));

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts).toHaveLength(1);

    act(() => result.current.resume(999));
    act(() => result.current.resume(id));
    act(() => result.current.resume(id));

    act(() => vi.advanceTimersByTime(599));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("keeps the exit timer alive when the leaving toast is hovered", () => {
    // Аркуш, що зникає, ще 200 мс на екрані — навести на нього мишу цілком
    // реально. `pause()` гасить auto-dismiss-таймери; якби exit-таймер лежав
    // у тому ж реєстрі, наведення вбило б його, `remove()` не викликався б, і
    // тост залишився б у списку привидом.
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.info("hover me while leaving", 10_000);
    });
    act(() => result.current.dismiss(id));
    expect(result.current.toasts).toMatchObject([{ leaving: true }]);

    act(() => result.current.pause(id));
    act(() => result.current.resume(id));

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.toasts).toHaveLength(0);

    unmount();
  });

  it("does not fire the exit timer after the provider unmounts", () => {
    // Регресія: «голий» `setTimeout` в `dismiss()` не потрапляв у реєстр, тож
    // cleanup його не гасив — через 200 мс він кликав `setToasts` на
    // розмонтованому дереві. У Vitest це валило весь прогін уже після
    // teardown-у jsdom («window is not defined»).
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useToast(), { wrapper });

    let id = 0;
    act(() => {
      id = result.current.info("unmount before exit", 10_000);
    });
    act(() => result.current.dismiss(id));

    unmount();

    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
