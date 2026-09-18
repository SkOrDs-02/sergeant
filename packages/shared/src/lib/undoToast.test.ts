import { describe, expect, it } from "vitest";

import {
  UNDO_TOAST_DEFAULT_DURATION_MS,
  UNDO_TOAST_DEFAULT_ERROR_MSG,
  UNDO_TOAST_DEFAULT_LABEL,
} from "./undoToast";

describe("undo toast defaults", () => {
  it("pins the shared duration and copy used by platform-specific toasts", () => {
    expect(UNDO_TOAST_DEFAULT_DURATION_MS).toBe(5_000);
    expect(UNDO_TOAST_DEFAULT_LABEL).toBe("Повернути");
    expect(UNDO_TOAST_DEFAULT_ERROR_MSG).toBe(
      "Не вдалось повернути. Спробуй ще раз.",
    );
  });
});
