import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadJson,
  resetFileDownloadAdapter,
  setFileDownloadAdapter,
  type FileDownloadAdapter,
} from "./fileDownload";

function makeMockAdapter(): FileDownloadAdapter {
  return {
    downloadJson: vi.fn().mockResolvedValue(undefined),
  };
}

describe("shared file-download contract", () => {
  beforeEach(() => {
    resetFileDownloadAdapter();
  });

  it("no-op default adapter resolves without throwing", async () => {
    // Silence the dev-mode warning emitted by the default no-op so the
    // test output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(downloadJson("x.json", { a: 1 })).resolves.toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("routes downloadJson calls to the registered adapter", async () => {
    const adapter = makeMockAdapter();
    setFileDownloadAdapter(adapter);

    await downloadJson("hub-backup.json", { ok: true });
    await downloadJson("fizruk-backup.json", [1, 2, 3]);

    expect(adapter.downloadJson).toHaveBeenCalledTimes(2);
    expect(adapter.downloadJson).toHaveBeenNthCalledWith(1, "hub-backup.json", {
      ok: true,
    });
    expect(adapter.downloadJson).toHaveBeenNthCalledWith(
      2,
      "fizruk-backup.json",
      [1, 2, 3],
    );
  });

  it("supports swapping adapters at runtime", async () => {
    const first = makeMockAdapter();
    const second = makeMockAdapter();

    setFileDownloadAdapter(first);
    await downloadJson("a.json", 1);

    setFileDownloadAdapter(second);
    await downloadJson("b.json", 2);

    expect(first.downloadJson).toHaveBeenCalledTimes(1);
    expect(first.downloadJson).toHaveBeenCalledWith("a.json", 1);
    expect(second.downloadJson).toHaveBeenCalledTimes(1);
    expect(second.downloadJson).toHaveBeenCalledWith("b.json", 2);
  });

  it("resetFileDownloadAdapter restores the no-op default", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const adapter = makeMockAdapter();
      setFileDownloadAdapter(adapter);
      await downloadJson("x.json", {});
      expect(adapter.downloadJson).toHaveBeenCalledTimes(1);

      resetFileDownloadAdapter();
      await downloadJson("y.json", {});
      // No further calls on the previously-registered adapter.
      expect(adapter.downloadJson).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("awaits adapter.downloadJson — rejections propagate to the caller", async () => {
    const boom = new Error("disk full");
    setFileDownloadAdapter({
      downloadJson: vi.fn().mockRejectedValue(boom),
    });

    await expect(downloadJson("x.json", {})).rejects.toBe(boom);
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
      await expect(downloadJson("x.json", {})).resolves.toBeUndefined();
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
