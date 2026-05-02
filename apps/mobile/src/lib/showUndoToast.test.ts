/**
 * Mirror of `apps/web/src/shared/lib/undoToast.test.tsx` for the mobile
 * helper. We mock the haptic adapter so the test stays platform-pure
 * (no `expo-haptics` import is needed in the jest jsdom env).
 */

import { resetHapticAdapter, setHapticAdapter } from "@sergeant/shared";
import type { HapticAdapter } from "@sergeant/shared";

import type { ToastApi } from "@/components/ui/Toast";
import { showUndoToast } from "./showUndoToast";

interface CapturedAction {
  label: string;
  onPress: () => void;
}

function makeToast(): ToastApi & { _captured: { action?: CapturedAction } } {
  const captured: { action?: CapturedAction } = {};
  const api: ToastApi = {
    show: jest.fn((_msg, _type, _duration, action) => {
      if (action) captured.action = action;
      return 1;
    }),
    success: jest.fn(() => 1),
    error: jest.fn(() => 2),
    info: jest.fn(() => 1),
    warning: jest.fn(() => 1),
    dismiss: jest.fn(),
  };
  return Object.assign(api, { _captured: captured });
}

function makeHapticAdapter(): HapticAdapter {
  return {
    tap: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    cancel: jest.fn(),
    pattern: jest.fn(),
  };
}

describe("showUndoToast (mobile)", () => {
  let haptic: HapticAdapter;

  beforeEach(() => {
    haptic = makeHapticAdapter();
    setHapticAdapter(haptic);
  });

  afterEach(() => {
    resetHapticAdapter();
  });

  it("викликає onUndo один раз при натисканні", () => {
    const onUndo = jest.fn();
    const toast = makeToast();
    showUndoToast(toast, { msg: "Видалено", onUndo });

    toast._captured.action?.onPress();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(haptic.warning).toHaveBeenCalledTimes(1);
    expect(haptic.tap).toHaveBeenCalledTimes(1);
  });

  it("якщо onUndo кидає — показуємо error-toast (не silent)", () => {
    const onUndo = jest.fn(() => {
      throw new Error("storage quota exceeded");
    });
    const toast = makeToast();

    showUndoToast(toast, { msg: "Видалено", onUndo });
    expect(() => toast._captured.action?.onPress()).not.toThrow();

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Не вдалось повернути. Спробуй ще раз.",
    );
    expect(haptic.error).toHaveBeenCalledTimes(1);
  });

  it("дозволяє кастомне повідомлення для помилки undo", () => {
    const onUndo = jest.fn(() => {
      throw new Error("boom");
    });
    const toast = makeToast();

    showUndoToast(toast, {
      msg: "Видалено звичку",
      onUndo,
      onUndoErrorMsg: "Не вдалось повернути звичку",
    });
    toast._captured.action?.onPress();
    expect(toast.error).toHaveBeenCalledWith("Не вдалось повернути звичку");
  });

  it("використовує default duration=5000 і info-тип", () => {
    const toast = makeToast();
    showUndoToast(toast, { msg: "Видалено", onUndo: () => {} });

    expect(toast.show).toHaveBeenCalledTimes(1);
    const call = (toast.show as jest.Mock).mock.calls[0];
    expect(call[1]).toBe("info");
    expect(call[2]).toBe(5000);
  });

  it("дозволяє кастомний undoLabel", () => {
    const toast = makeToast();
    showUndoToast(toast, {
      msg: "Видалено",
      onUndo: () => {},
      undoLabel: "Скасувати",
    });

    expect(toast._captured.action?.label).toBe("Скасувати");
  });
});
