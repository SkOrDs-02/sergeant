// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetOpfsWipeGuardForTests,
  opfsDirectoryExists,
  watchOpfsWipe,
} from "./opfsWipeGuard";

type Dir = { getDirectoryHandle: (name: string) => Promise<Dir> };

function stubOpfs(existing: string[], error?: DOMException): void {
  const dir = (path: string): Dir => ({
    getDirectoryHandle: async (name) => {
      const next = `${path}/${name}`;
      if (error) throw error;
      if (!existing.includes(next)) {
        throw new DOMException("missing", "NotFoundError");
      }
      return dir(next);
    },
  });
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => dir("") },
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("opfsWipeGuard", () => {
  afterEach(() => {
    __resetOpfsWipeGuardForTests();
  });

  it("reports the pool directory as present or wiped", async () => {
    stubOpfs(["/sergeant", "/sergeant/sqlite"]);
    expect(await opfsDirectoryExists("/sergeant/sqlite")).toBe(true);
    stubOpfs([]);
    expect(await opfsDirectoryExists("/sergeant/sqlite")).toBe(false);
  });

  it("treats errors other than NotFoundError as present", async () => {
    stubOpfs([], new DOMException("busy", "InvalidStateError"));
    expect(await opfsDirectoryExists("/sergeant/sqlite")).toBe(true);
  });

  it("recovers when the tab regains focus after site data was cleared", async () => {
    const onWiped = vi.fn();
    stubOpfs(["/sergeant", "/sergeant/sqlite"]);
    watchOpfsWipe("/sergeant/sqlite", onWiped);

    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(onWiped).not.toHaveBeenCalled();

    stubOpfs([]);
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(onWiped).toHaveBeenCalledTimes(1);
  });
});
