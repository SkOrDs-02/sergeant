/**
 * Last validated: 2026-07-21
 * Status: Active
 */
import { describe, expect, it, vi } from "vitest";

const createModuleStorageMock = vi.hoisted(() =>
  vi.fn(() => ({ moduleName: "nutrition" })),
);

vi.mock("@shared/lib/storage/createModuleStorage", () => ({
  createModuleStorage: createModuleStorageMock,
}));

import { nutritionStorage } from "./nutritionStorageInstance";

describe("nutritionStorageInstance", () => {
  it("creates the nutrition module storage singleton", () => {
    expect(createModuleStorageMock).toHaveBeenCalledWith({ name: "nutrition" });
    expect(nutritionStorage).toEqual({ moduleName: "nutrition" });
  });
});
