import { afterEach, describe, expect, it } from "vitest";
import { OpenClawSessionStore } from "./session.js";

describe("OpenClawSessionStore", () => {
  let store: OpenClawSessionStore | undefined;

  afterEach(() => {
    store?.dispose();
    store = undefined;
  });

  it("creates a fresh session on first access", () => {
    const now = 1_000;
    store = new OpenClawSessionStore(60_000, () => now);
    const s = store.getOrInit(42);
    expect(s.userId).toBe(42);
    expect(s.turnCount).toBe(0);
    expect(s.updatedAt).toBe(1_000);
  });

  it("recordTurn bumps turnCount and updatedAt", () => {
    let now = 1_000;
    store = new OpenClawSessionStore(60_000, () => now);
    store.getOrInit(42);
    now = 2_000;
    const after = store.recordTurn(42, { lastInvocationId: 5 });
    expect(after.turnCount).toBe(1);
    expect(after.updatedAt).toBe(2_000);
    expect(after.lastInvocationId).toBe(5);
  });

  it("expires session after TTL", () => {
    let now = 1_000;
    store = new OpenClawSessionStore(10_000, () => now);
    store.recordTurn(42, { lastInvocationId: 5 });
    expect(store.getOrInit(42).turnCount).toBe(1);

    now = 100_000;
    const fresh = store.getOrInit(42);
    expect(fresh.turnCount).toBe(0);
    expect(fresh.lastInvocationId).toBeUndefined();
  });

  it("reset() forgets state immediately", () => {
    const now = 1_000;
    store = new OpenClawSessionStore(60_000, () => now);
    store.recordTurn(42, { lastInvocationId: 5 });
    store.reset(42);
    const fresh = store.getOrInit(42);
    expect(fresh.turnCount).toBe(0);
  });

  it("isolates state between users", () => {
    const now = 1_000;
    store = new OpenClawSessionStore(60_000, () => now);
    store.recordTurn(42, { lastInvocationId: 1 });
    store.recordTurn(99, { lastInvocationId: 2 });
    expect(store.getOrInit(42).lastInvocationId).toBe(1);
    expect(store.getOrInit(99).lastInvocationId).toBe(2);
  });
});
