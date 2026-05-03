// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectQueuedModules } from "./collectQueued";

const payload = (data: Record<string, unknown>) => ({
  data,
  clientUpdatedAt: "2026-04-15T10:30:00.000Z",
});

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
          finyk: payload({ a: 1 }),
          fizruk: payload({ b: 2 }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result).sort()).toEqual(["finyk", "fizruk"]);
    expect(result.finyk.data).toEqual({ a: 1 });
  });

  it("later entries overwrite earlier ones for the same module", () => {
    const queue = [
      { type: "push", modules: { finyk: payload({ v: 1 }) } },
      { type: "push", modules: { finyk: payload({ v: 2 }) } },
    ];
    expect(collectQueuedModules(queue).finyk.data).toEqual({ v: 2 });
  });

  it("ignores entries that are not push", () => {
    const queue = [
      { type: "noop", modules: { finyk: payload({ ignored: true }) } },
      { type: "push", modules: { finyk: payload({ kept: true }) } },
    ];
    expect(collectQueuedModules(queue).finyk.data).toEqual({ kept: true });
  });

  it("ignores entries without modules object", () => {
    const queue = [
      { type: "push" },
      { type: "push", modules: null },
      { type: "push", modules: "no" },
      { type: "push", modules: { finyk: payload({ ok: true }) } },
    ];
    expect(collectQueuedModules(queue).finyk.data).toEqual({ ok: true });
  });

  it("rejects unknown module names", () => {
    const queue = [
      {
        type: "push",
        modules: { unknown: payload({ x: 1 }), finyk: payload({ y: 2 }) },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["finyk"]);
  });

  it("rejects non-object payloads", () => {
    const queue = [
      {
        type: "push",
        modules: {
          finyk: null,
          fizruk: "string",
          routine: 0,
          nutrition: payload({ ok: true }),
        },
      },
    ];
    const result = collectQueuedModules(queue);
    expect(Object.keys(result)).toEqual(["nutrition"]);
  });

  it("skips garbage queue entries entirely", () => {
    const queue = [
      null,
      undefined,
      "not-an-entry",
      42,
      { type: "push", modules: { finyk: payload({ ok: true }) } },
    ];
    expect(collectQueuedModules(queue)).toEqual({
      finyk: payload({ ok: true }),
    });
  });
});
