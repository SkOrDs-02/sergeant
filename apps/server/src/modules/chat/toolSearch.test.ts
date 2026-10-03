/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Tool search + `defer_loading` payload.
 *
 * AI-CONTEXT: кожен асерт тут націлений на конкретну 400-ку від Anthropic
 * або на тиху втрату кешу — а не на «функція повертає масив». Формулювання
 * «що саме цей асерт робить неможливим» винесене в коментар до кожного,
 * бо в цьому репо вже двічі зелений тест закріплював баг замість ловити
 * його.
 */
import { describe, it, expect } from "vitest";

import {
  buildToolSearchPayload,
  isCacheable,
  modelSupportsToolSearch,
  HOT_TOOL_NAMES,
  TOOL_SEARCH_TOOL,
  type DeferrableTool,
} from "./toolSearch.js";
import { buildToolsPayload } from "./promptCache.js";
import { TOOLS } from "./tools.js";

describe("modelSupportsToolSearch", () => {
  it("покриває всі моделі, що реально можуть потрапити в chat-payload", () => {
    // Дефолти `CHAT_MODEL_FIRST_TURN` / `CHAT_MODEL_SYNTHESIS` /
    // `AI_PRO_{STANDARD,FLOOR}_CHAT_MODEL`. Якщо котрийсь дефолт зміняють на
    // модель без підтримки — цей асерт впаде, і зміну доведеться зробити
    // свідомо (а не виявити 400-кою у проді).
    expect(modelSupportsToolSearch("claude-haiku-4-5-20251001")).toBe(true);
    expect(modelSupportsToolSearch("claude-sonnet-4-6")).toBe(true);
    expect(modelSupportsToolSearch("claude-opus-5")).toBe(true);
  });

  it("моделі без підтримки відсікає — allowlist, не denylist", () => {
    // Робить неможливим 400 `tool_search_tool_* is not supported` після
    // того, як ops ре-тирить чат на стару модель через env.
    expect(modelSupportsToolSearch("claude-3-haiku-20240307")).toBe(false);
    expect(modelSupportsToolSearch("claude-opus-4-1")).toBe(false);
    expect(modelSupportsToolSearch("gpt-5.1")).toBe(false);
    expect(modelSupportsToolSearch("")).toBe(false);
  });
});

describe("buildToolSearchPayload", () => {
  const payload = buildToolSearchPayload(TOOLS);

  it("перший елемент — сам tool-search, і він НЕ deferred", () => {
    // 400 `At least one tool must have defer_loading=false` — найпростіший
    // спосіб покласти весь чат. Search-tool деферити не можна ніколи.
    expect(payload[0]).toEqual(TOOL_SEARCH_TOOL);
    expect((payload[0] as DeferrableTool).defer_loading).toBeUndefined();
  });

  it("несе ВСІ дефініції, а не лише гарячі", () => {
    // Найспокусливіша хибна «оптимізація»: викинути deferred-tools із
    // масиву, бо вони «все одно не в контексті». API потрібні їхні повні
    // схеми server-side, щоб розгорнути `tool_reference` — без них буде
    // 400 `Tool reference '…' not found in available tools`, і то лише
    // ТОДІ, коли модель щось знайде (тобто не на кожному запиті —
    // непомітно в smoke-тесті, боляче в проді).
    expect(payload).toHaveLength(TOOLS.length + 1);
    const names = new Set(payload.map((t) => t.name));
    for (const tool of TOOLS) expect(names.has(tool.name)).toBe(true);
  });

  it("рівно гарячий набір лишається не-deferred", () => {
    const undeferred = payload
      .filter((t) => t.name !== TOOL_SEARCH_TOOL.name)
      .filter((t) => (t as DeferrableTool).defer_loading !== true)
      .map((t) => t.name);
    expect(new Set(undeferred)).toEqual(new Set(HOT_TOOL_NAMES));
  });

  it("гарячі стоять ПЕРЕД deferred — інакше breakpoint не закриє суцільний блок", () => {
    const firstDeferred = payload.findIndex(
      (t) => (t as DeferrableTool).defer_loading === true,
    );
    const lastHot = payload.reduce(
      (acc, t, i) => (isCacheable(t as DeferrableTool) ? i : acc),
      -1,
    );
    expect(firstDeferred).toBeGreaterThan(-1);
    expect(lastHot).toBeLessThan(firstDeferred);
  });

  it("кожне імʼя з HOT_TOOL_NAMES існує в реєстрі", () => {
    // Дрейф: інструмент перейменували в `toolDefs/*`, а список забули. Тоді
    // гарячий набір мовчки порожніє, модель мусить шукати навіть `remember`
    // (який SYSTEM_PREFIX наказує викликати рефлекторно), і деградацію
    // видно тільки як «асистент перестав запамʼятовувати».
    const registry = new Set(TOOLS.map((t) => t.name));
    const missing = HOT_TOOL_NAMES.filter((n) => !registry.has(n));
    expect(missing).toEqual([]);
  });

  it("не мутує вхідний реєстр", () => {
    expect(
      TOOLS.some((t) => (t as DeferrableTool).defer_loading !== undefined),
    ).toBe(false);
  });

  it("порожній гарячий набір → перший tool лишається не-deferred (fallback без 400)", () => {
    const out = buildToolSearchPayload([
      { name: "нема_такого_в_HOT", input_schema: {} },
      { name: "теж_нема", input_schema: {} },
    ]);
    expect(out).toHaveLength(3);
    expect((out[1] as DeferrableTool).defer_loading).toBeUndefined();
    expect((out[2] as DeferrableTool).defer_loading).toBe(true);
  });
});

describe("buildToolsPayload", () => {
  it("підтримана модель → tool-search payload", () => {
    const out = buildToolsPayload("claude-sonnet-4-6");
    expect(out).toHaveLength(TOOLS.length + 1);
    expect(out[0]).toMatchObject({ type: TOOL_SEARCH_TOOL.type });
  });

  it("непідтримана модель → legacy payload без search-tool і без defer_loading", () => {
    // Робить неможливим 400 на ре-тиреній моделі: деградуємо в старий
    // (дорожчий, але робочий) payload, а не падаємо.
    const out = buildToolsPayload("claude-3-haiku-20240307");
    expect(out).toHaveLength(TOOLS.length);
    expect(out.some((t) => (t as DeferrableTool).defer_loading === true)).toBe(
      false,
    );
  });

  it("жоден tool у payload не має cache_control разом із defer_loading", () => {
    // Інваріант, що покриває ОБИДВА шляхи одразу: це та сама пара, яку
    // Anthropic відхиляє 400-кою, і саме її легко відтворити, змінивши
    // порядок у `buildToolSearchPayload`.
    for (const model of ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]) {
      for (const tool of buildToolsPayload(model) as Array<
        DeferrableTool & { cache_control?: unknown }
      >) {
        if (tool.defer_loading === true) {
          expect(tool.cache_control).toBeUndefined();
        }
      }
    }
  });

  it("рівно один cache_control на payload", () => {
    const marked = (
      buildToolsPayload("claude-sonnet-4-6") as Array<{
        cache_control?: unknown;
      }>
    ).filter((t) => t.cache_control !== undefined);
    expect(marked).toHaveLength(1);
  });
});
