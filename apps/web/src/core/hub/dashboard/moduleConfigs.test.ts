/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(() => null),
}));

import { safeReadStringLS } from "@shared/lib/storage/storage";
import { MODULE_CONFIGS } from "./moduleConfigs";

const readMock = vi.mocked(safeReadStringLS);

describe("moduleConfigs", () => {
  beforeEach(() => {
    readMock.mockReset();
    readMock.mockReturnValue(null);
  });

  it("exposes a config entry for every dashboard module accent", () => {
    expect(Object.keys(MODULE_CONFIGS).sort()).toEqual(
      ["finyk", "fizruk", "nutrition", "routine"].sort(),
    );
  });

  it("reads quick-stats snapshots from the module storage keys", () => {
    readMock.mockImplementation((key: string) =>
      key === STORAGE_KEYS.FINYK_QUICK_STATS ? '{"main":"1 ₴"}' : null,
    );

    const preview = MODULE_CONFIGS.finyk.getPreview();
    expect(preview).toBeDefined();
    expect(readMock).toHaveBeenCalledWith(STORAGE_KEYS.FINYK_QUICK_STATS);
  });

  it("returns a preview object when storage is missing", () => {
    const preview = MODULE_CONFIGS.routine.getPreview();
    expect(preview).toBeDefined();
    expect(typeof preview).toBe("object");
  });
});
