import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  pickJson,
  resetFileImportAdapter,
  setFileImportAdapter,
  type FileImportAdapter,
} from "./fileImport";

function makeMockAdapter(): FileImportAdapter {
  return {
    pickJson: vi.fn().mockResolvedValue({ filename: "a.json", data: { a: 1 } }),
  };
}

describe("shared file-import contract", () => {
  beforeEach(() => {
    resetFileImportAdapter();
  });

  it("no-op default adapter returns null without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(pickJson()).resolves.toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("routes pickJson calls to the registered adapter", async () => {
    const adapter = makeMockAdapter();
    setFileImportAdapter(adapter);

    const result = await pickJson();

    expect(adapter.pickJson).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ filename: "a.json", data: { a: 1 } });
  });

  it("supports swapping adapters at runtime", async () => {
    const first = makeMockAdapter();
    const second: FileImportAdapter = {
      pickJson: vi.fn().mockResolvedValue(null),
    };

    setFileImportAdapter(first);
    await pickJson();

    setFileImportAdapter(second);
    const result = await pickJson();

    expect(first.pickJson).toHaveBeenCalledTimes(1);
    expect(second.pickJson).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it("resetFileImportAdapter restores the no-op default", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const adapter = makeMockAdapter();
      setFileImportAdapter(adapter);
      await pickJson();
      expect(adapter.pickJson).toHaveBeenCalledTimes(1);

      resetFileImportAdapter();
      const result = await pickJson();
      expect(adapter.pickJson).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("adapter rejections propagate to the caller", async () => {
    const boom = new Error("access denied");
    setFileImportAdapter({
      pickJson: vi.fn().mockRejectedValue(boom),
    });

    await expect(pickJson()).rejects.toBe(boom);
  });

  it("keeps the no-op adapter silent if process env detection throws", async () => {
    const originalProcess = Object.getOwnPropertyDescriptor(
      globalThis,
      "process",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      get() {
        throw new Error("blocked process access");
      },
    });
    try {
      await expect(pickJson()).resolves.toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      if (originalProcess) {
        Object.defineProperty(globalThis, "process", originalProcess);
      } else {
        Reflect.deleteProperty(globalThis, "process");
      }
    }
  });
});
