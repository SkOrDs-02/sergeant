import { describe, expect, it, vi, beforeEach } from "vitest";

const { safeReadStringLSMock, safeRemoveLSMock } = vi.hoisted(() => ({
  safeReadStringLSMock: vi.fn(),
  safeRemoveLSMock: vi.fn(),
}));

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: safeReadStringLSMock,
  safeRemoveLS: safeRemoveLSMock,
}));

import { consumePwaAction, PWA_ACTION_KEY } from "./pwaAction";

describe("pwaAction — consumePwaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no pending action is stored", () => {
    safeReadStringLSMock.mockReturnValue(null);
    expect(consumePwaAction()).toBeNull();
    expect(safeRemoveLSMock).not.toHaveBeenCalled();
  });

  it("returns the stored action and clears the key", () => {
    safeReadStringLSMock.mockReturnValue("add-expense");
    expect(consumePwaAction()).toBe("add-expense");
    expect(safeReadStringLSMock).toHaveBeenCalledWith(PWA_ACTION_KEY);
    expect(safeRemoveLSMock).toHaveBeenCalledWith(PWA_ACTION_KEY);
  });

  it("treats empty strings as absent", () => {
    safeReadStringLSMock.mockReturnValue("");
    expect(consumePwaAction()).toBeNull();
    expect(safeRemoveLSMock).not.toHaveBeenCalled();
  });
});
