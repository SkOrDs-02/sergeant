import { describe, expect, it, vi } from "vitest";

const createModuleStorageMock = vi.fn((config: { name: string }) => ({
  config,
}));

vi.mock("@shared/lib/storage/createModuleStorage", () => ({
  createModuleStorage: createModuleStorageMock,
}));

describe("routineStorage singleton", () => {
  it("creates the shared module storage instance for routine", async () => {
    const { routineStorage } = await import("./routineStorageInstance");

    expect(createModuleStorageMock).toHaveBeenCalledWith({ name: "routine" });
    expect(routineStorage).toEqual({ config: { name: "routine" } });
  });
});
