import { afterEach, describe, expect, it } from "vitest";
import { __resetAiMemoryForTest, getAiMemory } from "./bootstrap.js";
import type { AiMemoryService } from "./service.js";

afterEach(() => {
  __resetAiMemoryForTest(undefined);
});

describe("getAiMemory (lazy singleton bootstrap)", () => {
  it("returns an AiMemoryService with remember/recall", () => {
    const service = getAiMemory();
    expect(typeof service.remember).toBe("function");
    expect(typeof service.recall).toBe("function");
  });

  it("returns the SAME instance across repeated calls (singleton)", () => {
    const first = getAiMemory();
    const second = getAiMemory();
    expect(second).toBe(first);
  });

  it("__resetAiMemoryForTest(undefined) forces a fresh instance on next getAiMemory()", () => {
    const first = getAiMemory();
    __resetAiMemoryForTest(undefined);
    const second = getAiMemory();
    expect(second).not.toBe(first);
  });

  it("__resetAiMemoryForTest(service) injects a specific mock instance", () => {
    const mock = {
      remember: async () => undefined,
      recall: async () => [],
    } as unknown as AiMemoryService;

    __resetAiMemoryForTest(mock);

    expect(getAiMemory()).toBe(mock);
  });
});
