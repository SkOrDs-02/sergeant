/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToastApi } from "@shared/hooks/useToast";
import { showUndoToast } from "./undoToast";

function makeToast(): ToastApi & {
  _captured: { action?: { onClick: () => void } };
} {
  const captured: { action?: { onClick: () => void } } = {};
  const api: ToastApi = {
    show: vi.fn((_msg, _type, _duration, action) => {
      if (action) captured.action = action;
      return 1;
    }),
    success: vi.fn(() => 1),
    error: vi.fn(() => 2),
    info: vi.fn(() => 1),
    warning: vi.fn(() => 1),
    dismiss: vi.fn(),
  };
  return Object.assign(api, { _captured: captured });
}

describe("showUndoToast", () => {
  beforeEach(() => {
    // jsdom може не мати navigator.vibrate — підклеюємо noop щоб
    // хаптик не бив по undefined під час click.
    navigator.vibrate = vi.fn();
  });

  it("викликає onUndo один раз при кліку", () => {
    const onUndo = vi.fn();
    const toast = makeToast();
    showUndoToast(toast, { msg: "Видалено", onUndo });

    toast._captured.action?.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("якщо onUndo кидає помилку — показується error-toast (не silent)", () => {
    // Регресія: попередня реалізація ковтала виключення у `catch {}`,
    // і користувач ніколи не дізнавався, що restore не спрацював.
    const onUndo = vi.fn(() => {
      throw new Error("storage quota exceeded");
    });
    const toast = makeToast();

    showUndoToast(toast, { msg: "Видалено", onUndo });
    // Click не повинен пробросити виняток наверх (toast listener не має
    // шансу залогувати, якщо throw іде далі).
    expect(() => toast._captured.action?.onClick()).not.toThrow();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Не вдалось повернути. Спробуй ще раз.",
    );
  });

  it("дозволяє кастомне повідомлення для помилки undo", () => {
    const onUndo = vi.fn(() => {
      throw new Error("boom");
    });
    const toast = makeToast();

    showUndoToast(toast, {
      msg: "Видалено звичку",
      onUndo,
      onUndoErrorMsg: "Не вдалось повернути звичку",
    });
    toast._captured.action?.onClick();
    expect(toast.error).toHaveBeenCalledWith("Не вдалось повернути звичку");
  });

  it("використовує default duration=5000 і info-тип", () => {
    const toast = makeToast();
    showUndoToast(toast, { msg: "Видалено", onUndo: () => {} });

    expect(toast.show).toHaveBeenCalledTimes(1);
    const call = (toast.show as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("info");
    expect(call[2]).toBe(5000);
  });
});
