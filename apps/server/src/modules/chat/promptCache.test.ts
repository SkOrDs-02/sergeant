/**
 * Unit tests для чистих prompt-caching хелперів (`promptCache.ts`), винесених
 * із chat-handler-а. Поведінкові інтеграційні перевірки (через handler) живуть
 * у `chat.test.ts`; тут — прямі property-тести на pure-функції.
 */
import { describe, it, expect } from "vitest";
import {
  applyMessagesCacheBreakpoint,
  applyToolsCacheBreakpoint,
  buildSystem,
  TOOLS_WITH_CACHE,
  type CacheableInputMessage,
} from "./promptCache.js";

const EPHEMERAL = { type: "ephemeral" } as const;

describe("buildSystem", () => {
  it("без context повертає лише cached SYSTEM_PREFIX-блок", () => {
    const blocks = buildSystem("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[0]!.cache_control).toEqual(EPHEMERAL);
    expect(blocks[0]!.text.length).toBeGreaterThan(0);
  });

  it("з context додає другий, НЕ кешований блок", () => {
    const blocks = buildSystem("[Профіль] Алергія на горіхи");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.cache_control).toEqual(EPHEMERAL);
    expect(blocks[1]!.cache_control).toBeUndefined();
    expect(blocks[1]!.text).toContain("Алергія на горіхи");
  });
});

describe("applyToolsCacheBreakpoint", () => {
  it("додає cache_control лише до останнього tool", () => {
    expect(TOOLS_WITH_CACHE.length).toBeGreaterThan(0);
    const last = TOOLS_WITH_CACHE[TOOLS_WITH_CACHE.length - 1]!;
    expect(last.cache_control).toEqual(EPHEMERAL);
    for (let i = 0; i < TOOLS_WITH_CACHE.length - 1; i++) {
      expect(TOOLS_WITH_CACHE[i]!.cache_control).toBeUndefined();
    }
  });

  it("порожній масив повертає порожній (без падіння)", () => {
    expect(applyToolsCacheBreakpoint([])).toEqual([]);
  });
});

describe("applyMessagesCacheBreakpoint", () => {
  it("порожній масив → порожній", () => {
    expect(applyMessagesCacheBreakpoint([])).toEqual([]);
  });

  it("обгортає ОСТАННЄ повідомлення в cached text-блок, попередні лишає string", () => {
    const input: CacheableInputMessage[] = [
      { role: "user", content: "перше" },
      { role: "assistant", content: "відповідь" },
      { role: "user", content: "останнє" },
    ];
    const out = applyMessagesCacheBreakpoint(input);

    const last = out[out.length - 1]!;
    expect(Array.isArray(last.content)).toBe(true);
    const block = (
      last.content as Array<{ text?: string; cache_control?: { type: string } }>
    )[0]!;
    expect(block).toMatchObject({
      type: "text",
      text: "останнє",
      cache_control: EPHEMERAL,
    });
    for (let i = 0; i < out.length - 1; i++) {
      expect(typeof out[i]!.content).toBe("string");
    }
  });

  it("не мутує вхідний масив (чиста функція)", () => {
    const input: CacheableInputMessage[] = [{ role: "user", content: "x" }];
    const snapshot = structuredClone(input);
    applyMessagesCacheBreakpoint(input);
    expect(input).toEqual(snapshot);
  });

  it("повідомлення з одного елемента кешує саме його", () => {
    const out = applyMessagesCacheBreakpoint([
      { role: "user", content: "тільки одне" },
    ]);
    expect(out).toHaveLength(1);
    const block = (
      out[0]!.content as Array<{
        text?: string;
        cache_control?: { type: string };
      }>
    )[0]!;
    expect(block.text).toBe("тільки одне");
    expect(block.cache_control).toEqual(EPHEMERAL);
  });
});
