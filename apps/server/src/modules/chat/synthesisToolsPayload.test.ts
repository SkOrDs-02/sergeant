/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Tools на турі синтезу: під шлюзом — лише згадані в реплеї, на Anthropic —
 * як раніше.
 *
 * AI-CONTEXT: цей файл тримає рівно ту межу, яку легко зламати рефакторингом.
 * Різати payload можна ТІЛЬКИ там, де немає tool search і немає спільного
 * prompt-cache; на Anthropic та сама «оптимізація» фрагментує cross-user кеш
 * і робить гірше. Тест на Anthropic-гілку тут не менш важливий за тест на
 * економію.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  buildSynthesisToolsPayload,
  buildToolsPayload,
  toolNamesFromRawCalls,
  __resetToolsPayloadCache,
} from "./promptCache.js";
import { SYSTEM_PREFIX, TOOLS } from "./tools.js";

const GATEWAY_MODEL = "deepseek/deepseek-v4-flash";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const ENV = ["CHAT_SYNTHESIS_TRIM_TOOLS", "CHAT_TOOL_SEARCH"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  __resetToolsPayloadCache();
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetToolsPayloadCache();
});

const rawCalls = (...names: string[]) =>
  names.map((name, i) => ({
    type: "tool_use",
    id: `toolu_${i}`,
    name,
    input: {},
  }));

const names = (payload: ReadonlyArray<object>) =>
  payload.map((t) => (t as { name?: string }).name).filter(Boolean);

describe("toolNamesFromRawCalls", () => {
  it("витягує унікальні імена tool_use-блоків", () => {
    expect(
      toolNamesFromRawCalls([
        ...rawCalls("find_transaction", "find_transaction"),
        { type: "text", text: "не tool_use" },
      ]),
    ).toEqual(["find_transaction"]);
  });

  it("не падає на не-масиві й на сміттєвих блоках", () => {
    expect(toolNamesFromRawCalls(null)).toEqual([]);
    expect(toolNamesFromRawCalls([null, 42, { type: "tool_use" }])).toEqual([]);
  });
});

describe("buildSynthesisToolsPayload — шлюз (без tool search)", () => {
  it("лишає рівно згадані визначення", () => {
    const payload = buildSynthesisToolsPayload(
      GATEWAY_MODEL,
      toolNamesFromRawCalls(rawCalls("delete_transaction")),
    );
    expect(names(payload)).toEqual(["delete_transaction"]);
  });

  it("тримає всі згадані, коли реплей містить кілька tool_use", () => {
    const payload = buildSynthesisToolsPayload(
      GATEWAY_MODEL,
      toolNamesFromRawCalls(rawCalls("delete_transaction", "find_transaction")),
    );
    expect(new Set(names(payload))).toEqual(
      new Set(["delete_transaction", "find_transaction"]),
    );
  });

  /**
   * Головне число цієї зміни. Порівнюємо з ФАКТИЧНИМ повним payload-ом, а не з
   * записаною константою: реєстр росте, і зафіксоване число протухло б мовчки.
   */
  it("контекст синтезу під шлюзом падає щонайменше увосьмеро", () => {
    const before =
      JSON.stringify(buildToolsPayload(GATEWAY_MODEL)).length +
      SYSTEM_PREFIX.length;
    const after =
      JSON.stringify(
        buildSynthesisToolsPayload(
          GATEWAY_MODEL,
          toolNamesFromRawCalls(rawCalls("delete_transaction")),
        ),
      ).length + SYSTEM_PREFIX.length;

    expect(before / after).toBeGreaterThan(8);
    // І зайвих схем у контексті справді не лишилось.
    expect(names(buildToolsPayload(GATEWAY_MODEL)).length).toBe(TOOLS.length);
  });

  it("порожній реплей → повний payload (не лишаємо модель без інструментів)", () => {
    const payload = buildSynthesisToolsPayload(GATEWAY_MODEL, []);
    expect(names(payload).length).toBe(TOOLS.length);
  });

  it("невідоме імʼя (перейменували tool) → повний payload, а не порожній", () => {
    const payload = buildSynthesisToolsPayload(GATEWAY_MODEL, [
      "tool_that_no_longer_exists",
    ]);
    expect(names(payload).length).toBe(TOOLS.length);
  });

  /**
   * `CHAT_SYNTHESIS_TRIM_TOOLS` читається через валідований `env`, який
   * парситься один раз на імпорті — тому прапорець перевіряється канонічним
   * для репо патерном: `stubEnv` + `resetModules` + динамічний ре-імпорт.
   */
  it("kill-switch CHAT_SYNTHESIS_TRIM_TOOLS=false повертає повний payload", async () => {
    vi.stubEnv("CHAT_SYNTHESIS_TRIM_TOOLS", "false");
    vi.resetModules();
    try {
      const fresh = await import("./promptCache.js");
      const payload = fresh.buildSynthesisToolsPayload(GATEWAY_MODEL, [
        "delete_transaction",
      ]);
      expect(payload.length).toBe(TOOLS.length);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("buildSynthesisToolsPayload — Anthropic не змінюється", () => {
  it("на моделі з tool search payload ідентичний звичайному", () => {
    const trimmed = buildSynthesisToolsPayload(ANTHROPIC_MODEL, [
      "delete_transaction",
    ]);
    expect(trimmed).toBe(buildToolsPayload(ANTHROPIC_MODEL));
  });
});
