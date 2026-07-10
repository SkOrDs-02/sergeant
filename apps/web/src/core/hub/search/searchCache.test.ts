/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedParse, safeParseLS, scoreLru } from "./searchCache";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(),
}));

import { safeReadStringLS } from "@shared/lib/storage/storage";

const readMock = vi.mocked(safeReadStringLS);

describe("searchCache.cachedParse", () => {
  beforeEach(() => {
    readMock.mockReset();
  });

  it("returns fallback when raw is null", () => {
    const parse = vi.fn();
    expect(cachedParse("k", "p", null, parse, [])).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it("reuses the cached value when raw and parserId are unchanged", () => {
    const parse = vi.fn((raw: string) => JSON.parse(raw) as number[]);
    const first = cachedParse("k", "p", "[1]", parse, []);
    const second = cachedParse("k", "p", "[1]", parse, []);
    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("reparses when the raw string changes", () => {
    const parse = vi.fn((raw: string) => JSON.parse(raw) as number[]);
    cachedParse("k-reparse-a", "p", "[1]", parse, []);
    const next = cachedParse("k-reparse-a", "p", "[2]", parse, []);
    expect(next).toEqual([2]);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("falls back when JSON.parse throws", () => {
    const result = cachedParse("k", "json", "{bad", (raw) => JSON.parse(raw), {
      ok: false,
    });
    expect(result).toEqual({ ok: false });
  });
});

describe("searchCache.safeParseLS", () => {
  beforeEach(() => {
    readMock.mockReset();
  });

  it("reads and parses JSON from localStorage via cachedParse", () => {
    readMock.mockReturnValue('{"a":1}');
    expect(safeParseLS("hub-key", {})).toEqual({ a: 1 });
    expect(readMock).toHaveBeenCalledWith("hub-key", null);
  });
});

describe("searchCache.scoreLru", () => {
  it("stores and retrieves scored hits", () => {
    const hits = [{ id: "x" }];
    scoreLru.set("q1", hits);
    expect(scoreLru.get("q1")).toBe(hits);
  });

  it("evicts the least-recently-used entry when capacity is exceeded", () => {
    for (let i = 0; i < 20; i++) {
      scoreLru.set(`key-${i}`, { i });
    }
    expect(scoreLru.get("key-0")).toBeUndefined();
    expect(scoreLru.get("key-19")).toEqual({ i: 19 });
  });
});
