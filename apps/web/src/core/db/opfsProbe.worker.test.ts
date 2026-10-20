// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerHarness = {
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
};

async function installProbe(
  navigatorValue: object,
  handleConstructor?: object,
) {
  const worker: WorkerHarness = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", worker);
  vi.stubGlobal("navigator", navigatorValue);
  vi.stubGlobal("FileSystemFileHandle", handleConstructor);
  vi.resetModules();
  await import("./opfsProbe.worker");
  await worker.onmessage?.(new MessageEvent("message"));
  return worker.postMessage.mock.calls[0]?.[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("OPFS probe worker", () => {
  it.each([
    [{}, "no navigator.storage.getDirectory"],
    [{ storage: {} }, "no navigator.storage.getDirectory"],
  ])(
    "reports unavailable when the storage directory API is missing",
    async (storage, reason) => {
      await expect(installProbe(storage)).resolves.toMatchObject({
        kind: "unavailable",
        reason,
      });
    },
  );

  it("reports missing FileSystemFileHandle and missing synchronous access support", async () => {
    const storage = { storage: { getDirectory: vi.fn() } };
    await expect(installProbe(storage)).resolves.toMatchObject({
      kind: "unavailable",
      reason: "no FileSystemFileHandle",
    });

    class HandleWithoutSync {}
    await expect(
      installProbe(storage, HandleWithoutSync),
    ).resolves.toMatchObject({
      kind: "unavailable",
      reason: "no createSyncAccessHandle",
    });
    expect(storage.storage.getDirectory).not.toHaveBeenCalled();
  });

  it("opens and closes a synchronous handle, then removes the probe file", async () => {
    const close = vi.fn();
    const createSyncAccessHandle = vi.fn(async () => ({ close }));
    function Handle() {}
    Object.assign(Handle.prototype, { createSyncAccessHandle });
    const removeEntry = vi.fn(async () => {});
    const getFileHandle = vi.fn(async () => ({ createSyncAccessHandle }));
    const getDirectory = vi.fn(async () => ({ getFileHandle, removeEntry }));

    await expect(
      installProbe({ storage: { getDirectory } }, Handle),
    ).resolves.toEqual({ kind: "ok" });
    expect(getFileHandle).toHaveBeenCalledWith(".sergeant-opfs-probe", {
      create: true,
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(removeEntry).toHaveBeenCalledWith(".sergeant-opfs-probe");
  });

  it("cleans up when a handle lacks its advertised sync-open method", async () => {
    function Handle() {}
    Object.assign(Handle.prototype, {
      createSyncAccessHandle: vi.fn(),
    });
    const removeEntry = vi.fn(async () => {});
    const getDirectory = vi.fn(async () => ({
      getFileHandle: async () => ({}),
      removeEntry,
    }));

    await expect(
      installProbe({ storage: { getDirectory } }, Handle),
    ).resolves.toMatchObject({
      kind: "unavailable",
      reason: "no createSyncAccessHandle",
    });
    expect(removeEntry).toHaveBeenCalledWith(".sergeant-opfs-probe");
  });

  it("rejects an asynchronous close and cleans up even when opening fails", async () => {
    function Handle() {}
    Object.assign(Handle.prototype, {
      createSyncAccessHandle: vi.fn(),
    });
    const removeEntry = vi.fn(async () => {});
    const asyncClose = vi.fn(async () => ({ close: () => Promise.resolve() }));
    const getDirectory = vi.fn(async () => ({
      getFileHandle: async () => ({ createSyncAccessHandle: asyncClose }),
      removeEntry,
    }));
    await expect(
      installProbe({ storage: { getDirectory } }, Handle),
    ).resolves.toMatchObject({
      kind: "unavailable",
      reason: "async close() — OPFS API too old",
    });
    expect(removeEntry).toHaveBeenCalled();

    const failedRemove = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const failOpen = vi.fn(async () => {
      throw new Error("OPFS denied");
    });
    const failingDirectory = vi.fn(async () => ({
      getFileHandle: async () => ({ createSyncAccessHandle: failOpen }),
      removeEntry: failedRemove,
    }));
    await expect(
      installProbe({ storage: { getDirectory: failingDirectory } }, Handle),
    ).resolves.toMatchObject({ kind: "unavailable", reason: "OPFS denied" });
    expect(failedRemove).toHaveBeenCalled();
  });
});
