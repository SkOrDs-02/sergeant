// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_EVENT, SYNC_STATUS_EVENT } from "../config";
import { emitStatusEvent, emitSyncEvent } from "./events";

let dispatched: string[];
let listener: (e: Event) => void;

beforeEach(() => {
  dispatched = [];
  listener = (e: Event) => dispatched.push(e.type);
  window.addEventListener(SYNC_EVENT, listener);
  window.addEventListener(SYNC_STATUS_EVENT, listener);
});

afterEach(() => {
  window.removeEventListener(SYNC_EVENT, listener);
  window.removeEventListener(SYNC_STATUS_EVENT, listener);
});

describe("emitSyncEvent", () => {
  it("dispatches a SYNC_EVENT on window", () => {
    emitSyncEvent();
    expect(dispatched).toEqual([SYNC_EVENT]);
  });

  it("can be called multiple times", () => {
    emitSyncEvent();
    emitSyncEvent();
    expect(dispatched.filter((t) => t === SYNC_EVENT)).toHaveLength(2);
  });
});

describe("emitStatusEvent", () => {
  it("dispatches a SYNC_STATUS_EVENT on window", () => {
    emitStatusEvent();
    expect(dispatched).toEqual([SYNC_STATUS_EVENT]);
  });

  it("swallows synchronous errors from dispatchEvent", () => {
    const originalDispatch = window.dispatchEvent;
    const spy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("CustomEvent not patched");
    });
    expect(() => emitStatusEvent()).not.toThrow();
    spy.mockRestore();
    // Sanity: original behaviour is restored.
    expect(window.dispatchEvent).toBe(originalDispatch);
  });
});
