// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectQueuedModules } from "./collectQueued";

const payload = (data: Record<string, unknown>) => ({
  data,
  clientUpdatedAt: "2026-04-15T10:30:00.000Z",
});

// PR #030 retired `fizruk`, PR #034 retired `nutrition` and PR #039
// retired `finyk` from SYNC_MODULES (storage-roadmap Stage 4); only
// `profile` remains. collectQueuedModules filters against
// SYNC_MODULES, so any retired module name in a queue entry is
// dropped — fixtures here use `profile` as the live module.
describe("collectQueuedModules", () => {
  it("returns empty object for non-array input", () => {
    expect(collectQueuedModules(null)).toEqual({});
    expect(collectQueuedModules(undefined)).toEqual({});
    expect(collectQueuedModules({})).toEqual({});
    expect(collectQueuedModules("queue")).toEqual({});
  });

  it("returns empty object for empty queue", () => {
    expect(collectQueuedModules([])).toEqual({});
  });

  it("collects payloads from a single push entry", () => {
    const queue = [
      {
        type: "push",
        modules: {
          profile: payload({ a: 1 }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result).sort()).toEqual(["profile"]);
    expect(result.profile!.data!).toEqual({ a: 1 });
  });

  it("drops the retired fizruk module entries (PR #030)", () => {
    const queue = [
      {
        type: "push",
        modules: {
          profile: payload({ a: 1 }),
          fizruk: payload({ b: 2 }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["profile"]);
  });

  it("drops the retired nutrition module entries (PR #034)", () => {
    const queue = [
      {
        type: "push",
        modules: {
          profile: payload({ a: 1 }),
          nutrition: payload({ b: 2 }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["profile"]);
  });

  it("drops the retired finyk module entries (PR #039)", () => {
    const queue = [
      {
        type: "push",
        modules: {
          profile: payload({ a: 1 }),
          finyk: payload({ b: 2 }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["profile"]);
  });

  it("later entries overwrite earlier ones for the same module", () => {
    const queue = [
      { type: "push", modules: { profile: payload({ v: 1 }) } },
      { type: "push", modules: { profile: payload({ v: 2 }) } },
    ];
    expect(collectQueuedModules!(queue).profile!.data!).toEqual({ v: 2 });
  });

  it("ignores entries that are not push", () => {
    const queue = [
      { type: "noop", modules: { profile: payload({ ignored: true }) } },
      { type: "push", modules: { profile: payload({ kept: true }) } },
    ];
    expect(collectQueuedModules!(queue).profile!.data!).toEqual({ kept: true });
  });

  it("ignores entries without modules object", () => {
    const queue = [
      { type: "push" },
      { type: "push", modules: null },
      { type: "push", modules: "no" },
      { type: "push", modules: { profile: payload({ ok: true }) } },
    ];
    expect(collectQueuedModules!(queue).profile!.data!).toEqual({ ok: true });
  });

  it("rejects unknown module names", () => {
    const queue = [
      {
        type: "push",
        modules: { unknown: payload({ x: 1 }), profile: payload({ y: 2 }) },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["profile"]);
  });

  it("rejects non-object payloads", () => {
    const queue = [
      {
        type: "push",
        modules: {
          // fizruk, routine, nutrition and finyk are all retired
          // modules — they are dropped by the SYNC_MODULES filter
          // before the non-object check fires, but listing them here
          // keeps the fixture realistic.
          finyk: null,
          fizruk: "string",
          routine: 0,
          nutrition: payload({ ignored: true }),
          profile: payload({ ok: true }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["profile"]);
  });

  it("skips garbage queue entries entirely", () => {
    const queue = [
      null,
      undefined,
      "not-an-entry",
      42,
      { type: "push", modules: { profile: payload({ ok: true }) } },
    ];
    expect(collectQueuedModules(queue)).toEqual({
      profile: payload({ ok: true }),
    });
  });
});
