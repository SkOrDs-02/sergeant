/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(),
  safeWriteLS: vi.fn(),
  safeRemoveLS: vi.fn(),
  webKVStore: {},
}));

import {
  safeReadLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import {
  loadDashboardOrder,
  resetDashboardOrder,
  saveDashboardOrder,
} from "./dashboardStore";

const readMock = vi.mocked(safeReadLS);
const writeMock = vi.mocked(safeWriteLS);
const removeMock = vi.mocked(safeRemoveLS);

describe("dashboardStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes dashboard order from localStorage", () => {
    readMock.mockReturnValue(["nutrition", "finyk", "bogus"]);
    const order = loadDashboardOrder();
    expect(order).toContain("finyk");
    expect(order).toContain("nutrition");
    expect(order).not.toContain("bogus");
    expect(readMock).toHaveBeenCalledWith(STORAGE_KEYS.DASHBOARD_ORDER, null);
  });

  it("persists dashboard order via safeWriteLS", () => {
    saveDashboardOrder(["routine", "fizruk"]);
    expect(writeMock).toHaveBeenCalledWith(STORAGE_KEYS.DASHBOARD_ORDER, [
      "routine",
      "fizruk",
    ]);
  });

  it("clears persisted order on reset", () => {
    resetDashboardOrder();
    expect(removeMock).toHaveBeenCalledWith(STORAGE_KEYS.DASHBOARD_ORDER);
  });
});
