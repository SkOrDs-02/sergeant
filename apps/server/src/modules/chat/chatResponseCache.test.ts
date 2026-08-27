/**
 * Unit-тести для short-TTL response-cache першого туру `/api/chat`
 * (`chatResponseCache.ts`). `env` парситься один раз при import, тож TTL/ємність
 * патчимо прямо на обʼєкті `env` із save/restore (як у ai-memory/service.test).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "../../env.js";
import {
  buildChatCacheKey,
  getCachedChatResponse,
  setCachedChatResponse,
  __chatResponseCacheSize,
  __resetChatResponseCache,
} from "./chatResponseCache.js";

const savedTtl = env.CHAT_RESPONSE_CACHE_TTL_MS;
const savedMax = env.CHAT_RESPONSE_CACHE_MAX_ENTRIES;

beforeEach(() => {
  __resetChatResponseCache();
  env.CHAT_RESPONSE_CACHE_TTL_MS = 60_000;
  env.CHAT_RESPONSE_CACHE_MAX_ENTRIES = 500;
});
afterEach(() => {
  __resetChatResponseCache();
  env.CHAT_RESPONSE_CACHE_TTL_MS = savedTtl;
  env.CHAT_RESPONSE_CACHE_MAX_ENTRIES = savedMax;
});

const KEY_INPUT = {
  userId: "user-1",
  model: "claude-haiku",
  system: "SYSTEM снапшот балансу=100",
  messages: [{ role: "user", content: "скільки я витратив?" }],
};

describe("buildChatCacheKey", () => {
  it("детермінований для однакового входу", () => {
    expect(buildChatCacheKey(KEY_INPUT)).toBe(buildChatCacheKey(KEY_INPUT));
  });

  it("зміна system (нові дані) дає інший ключ — авто-інвалідація", () => {
    const a = buildChatCacheKey(KEY_INPUT);
    const b = buildChatCacheKey({ ...KEY_INPUT, system: "SYSTEM балансу=200" });
    expect(a).not.toBe(b);
  });

  it("різні userId → різні ключі (без крос-юзерного змішування)", () => {
    const a = buildChatCacheKey(KEY_INPUT);
    const b = buildChatCacheKey({ ...KEY_INPUT, userId: "user-2" });
    expect(a).not.toBe(b);
  });

  it("system як масив блоків серіалізується стабільно", () => {
    const arr = { ...KEY_INPUT, system: [{ type: "text", text: "x" }] };
    expect(buildChatCacheKey(arr)).toBe(buildChatCacheKey(arr));
  });
});

describe("get/set", () => {
  it("round-trip: збережене повертається", () => {
    const key = buildChatCacheKey(KEY_INPUT);
    setCachedChatResponse(key, { status: 200, body: { text: "ok" } });
    expect(getCachedChatResponse(key)).toEqual({
      status: 200,
      body: { text: "ok" },
    });
  });

  it("miss повертає null", () => {
    expect(getCachedChatResponse("no-such-key")).toBeNull();
  });

  it("прострочений запис не віддається і видаляється", () => {
    const key = buildChatCacheKey(KEY_INPUT);
    setCachedChatResponse(key, { status: 200, body: { text: "old" } });
    // Симулюємо протермінування: TTL у минуле не покласти напряму, тож
    // ставимо TTL=1мс і чекаємо тик.
    env.CHAT_RESPONSE_CACHE_TTL_MS = 1;
    const k2 = buildChatCacheKey({ ...KEY_INPUT, model: "m2" });
    setCachedChatResponse(k2, { status: 200, body: { text: "soon" } });
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(getCachedChatResponse(k2)).toBeNull();
        resolve();
      }, 5);
    });
  });

  it("TTL<=0 повністю вимикає кеш (get і set — no-op)", () => {
    env.CHAT_RESPONSE_CACHE_TTL_MS = 0;
    const key = buildChatCacheKey(KEY_INPUT);
    setCachedChatResponse(key, { status: 200, body: { text: "x" } });
    expect(__chatResponseCacheSize()).toBe(0);
    expect(getCachedChatResponse(key)).toBeNull();
  });

  it("eviction: при переповненні витісняється найстаріший", () => {
    env.CHAT_RESPONSE_CACHE_MAX_ENTRIES = 2;
    const k1 = buildChatCacheKey({ ...KEY_INPUT, model: "m1" });
    const k2 = buildChatCacheKey({ ...KEY_INPUT, model: "m2" });
    const k3 = buildChatCacheKey({ ...KEY_INPUT, model: "m3" });
    setCachedChatResponse(k1, { status: 200, body: 1 });
    setCachedChatResponse(k2, { status: 200, body: 2 });
    setCachedChatResponse(k3, { status: 200, body: 3 }); // виштовхує k1
    expect(getCachedChatResponse(k1)).toBeNull();
    expect(getCachedChatResponse(k2)).not.toBeNull();
    expect(getCachedChatResponse(k3)).not.toBeNull();
    expect(__chatResponseCacheSize()).toBe(2);
  });

  it("LRU touch: використаний запис не витісняється першим", () => {
    env.CHAT_RESPONSE_CACHE_MAX_ENTRIES = 2;
    const k1 = buildChatCacheKey({ ...KEY_INPUT, model: "m1" });
    const k2 = buildChatCacheKey({ ...KEY_INPUT, model: "m2" });
    const k3 = buildChatCacheKey({ ...KEY_INPUT, model: "m3" });
    setCachedChatResponse(k1, { status: 200, body: 1 });
    setCachedChatResponse(k2, { status: 200, body: 2 });
    getCachedChatResponse(k1); // torkаємось k1 → тепер найстаріший k2
    setCachedChatResponse(k3, { status: 200, body: 3 }); // виштовхує k2
    expect(getCachedChatResponse(k1)).not.toBeNull();
    expect(getCachedChatResponse(k2)).toBeNull();
  });
});
