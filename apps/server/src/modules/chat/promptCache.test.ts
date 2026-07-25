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
  stripStrictModeForAnthropic,
  TOOLS_WITH_CACHE,
  type CacheableInputMessage,
} from "./promptCache.js";

/** 5-хвилинний (дефолтний) TTL — лишається на message-breakpoint-і. */
const EPHEMERAL = { type: "ephemeral" } as const;
/** 1-годинний TTL — стабільний префікс (tools + SYSTEM_PREFIX). */
const EPHEMERAL_1H = { type: "ephemeral", ttl: "1h" } as const;

describe("buildSystem", () => {
  it("без context повертає лише cached SYSTEM_PREFIX-блок", () => {
    const blocks = buildSystem("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[0]!.cache_control).toEqual(EPHEMERAL_1H);
    expect(blocks[0]!.text.length).toBeGreaterThan(0);
  });

  it("з context додає другий, НЕ кешований блок", () => {
    const blocks = buildSystem("[Профіль] Алергія на горіхи");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.cache_control).toEqual(EPHEMERAL_1H);
    expect(blocks[1]!.cache_control).toBeUndefined();
    expect(blocks[1]!.text).toContain("Алергія на горіхи");
  });
});

describe("applyToolsCacheBreakpoint", () => {
  it("додає cache_control лише до останнього tool", () => {
    expect(TOOLS_WITH_CACHE.length).toBeGreaterThan(0);
    const last = TOOLS_WITH_CACHE[TOOLS_WITH_CACHE.length - 1]!;
    expect(last.cache_control).toEqual(EPHEMERAL_1H);
    for (let i = 0; i < TOOLS_WITH_CACHE.length - 1; i++) {
      expect(TOOLS_WITH_CACHE[i]!.cache_control).toBeUndefined();
    }
  });

  it("НЕ ставить breakpoint на deferred tool — Anthropic на це віддає 400", () => {
    // Робить неможливим найдорожчий регрес цієї зміни: `cache_control`
    // разом із `defer_loading: true` — це не деградація кешу, це 400 на
    // КОЖЕН /api/chat (та сама форма, що інцидент 2026-05-16 зі strict).
    const out = applyToolsCacheBreakpoint([
      { name: "hot", input_schema: {} },
      { name: "cold", input_schema: {}, defer_loading: true },
    ]);
    expect(out[0]!.cache_control).toEqual(EPHEMERAL_1H);
    expect(out[1]!.cache_control).toBeUndefined();
  });

  it("усі tools deferred → breakpoint не ставиться взагалі", () => {
    const out = applyToolsCacheBreakpoint([
      { name: "a", input_schema: {}, defer_loading: true },
      { name: "b", input_schema: {}, defer_loading: true },
    ]);
    expect(out.every((t) => t.cache_control === undefined)).toBe(true);
  });

  it("порожній масив повертає порожній (без падіння)", () => {
    expect(applyToolsCacheBreakpoint([])).toEqual([]);
  });

  it("stripStrictModeForAnthropic (kill-switch helper) знімає strict з усіх tools, не мутуючи вхід", () => {
    const input = [
      { name: "strict_tool", strict: true, input_schema: { type: "object" } },
      { name: "regular_tool", input_schema: { type: "object" } },
    ];
    const snapshot = structuredClone(input);

    expect(stripStrictModeForAnthropic(input)).toEqual([
      { name: "strict_tool", input_schema: { type: "object" } },
      { name: "regular_tool", input_schema: { type: "object" } },
    ]);
    expect(input).toEqual(snapshot);
  });

  it("з CHAT_STRICT_TOOLS=true (default) у payload проходить strict:true, але НІКОЛИ strict:false", () => {
    // Anthropic приймає strict-прапор лише як `true` або як відсутній —
    // `strict: false` у схемі відхиляється. Тому в payload не може бути
    // жодного tool із strict:false, а strict:true — лише на курованому subset.
    const strictFalse = TOOLS_WITH_CACHE.filter(
      (tool) => (tool as { strict?: unknown }).strict === false,
    );
    expect(strictFalse).toHaveLength(0);

    const strictTrue = TOOLS_WITH_CACHE.filter(
      (tool) => (tool as { strict?: unknown }).strict === true,
    );
    // Subset активний (>0) і в межах Anthropic-ліміту 20 strict tools/запит.
    expect(strictTrue.length).toBeGreaterThan(0);
    expect(strictTrue.length).toBeLessThanOrEqual(20);
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
