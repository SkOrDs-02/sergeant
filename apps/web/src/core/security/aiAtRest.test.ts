import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  __resetAtRestKeyForTests,
  chatSessionsSlot,
  hydrateAtRest,
  memoryBankSlot,
  sealAtRest,
} from "./aiAtRest";
import { bumpAtRestWipeEpoch } from "./aiAtRestEpoch";
import { safeReadStringLS, webKVStore } from "@shared/lib/storage/storage";

const KEY = "hub_chat_sessions_v1";
const PLAIN = JSON.stringify([{ id: "s1", note: "борг 12 000 грн" }]);

/** Дає асинхронному шифруванню і запису завершитись. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

async function freshProfile(): Promise<void> {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  await __resetAtRestKeyForTests();
  webKVStore.remove(KEY);
  webKVStore.remove("hub_user_profile_v1");
}

describe("aiAtRest", () => {
  beforeEach(async () => {
    await freshProfile();
    chatSessionsSlot.remove();
    memoryBankSlot.remove();
  });

  it("roundtrip: у сховищі конверт, а не відкритий текст; читання віддає оригінал", async () => {
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    // синхронне читання з кешу одразу після запису
    expect(chatSessionsSlot.read()).toBe(PLAIN);
    await flush();

    const stored = safeReadStringLS(KEY);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain("борг");
    const env = JSON.parse(stored as string);
    expect(env.v).toBe(1);
    expect(typeof env.iv).toBe("string");
    expect(typeof env.ct).toBe("string");
    expect(chatSessionsSlot.read()).toBe(PLAIN);
  });

  it("після «перезавантаження» (новий кеш) гідратація розшифровує збережене", async () => {
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    await flush();
    const stored = safeReadStringLS(KEY) as string;

    // імітуємо холодний старт: кеш слота порожній, сховище те саме
    chatSessionsSlot.remove();
    webKVStore.setString(KEY, stored);
    expect(chatSessionsSlot.read()).toBeNull(); // ще не гідратовано
    await hydrateAtRest();
    expect(chatSessionsSlot.read()).toBe(PLAIN);
  });

  it("міграція: відкритий легасі-текст читається і перезаписується конвертом", async () => {
    webKVStore.setString(KEY, PLAIN);
    await hydrateAtRest();
    await flush();
    expect(chatSessionsSlot.read()).toBe(PLAIN);
    const stored = safeReadStringLS(KEY) as string;
    expect(stored).not.toContain("борг");
    expect(JSON.parse(stored).v).toBe(1);
  });

  it("міграція також працює для читання без попередньої гідратації", async () => {
    await hydrateAtRest(); // ключ готовий
    webKVStore.setString("hub_user_profile_v1", '[{"id":"m1"}]');
    expect(memoryBankSlot.read()).toBe('[{"id":"m1"}]');
    await flush();
    expect(safeReadStringLS("hub_user_profile_v1")).not.toContain("m1");
  });

  it("нечитний шифртекст (ключ втрачено) → порожньо, без винятку", async () => {
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    await flush();
    const stored = safeReadStringLS(KEY) as string;

    // IDB очищено: новий профіль → новий ключ
    await freshProfile();
    chatSessionsSlot.remove();
    webKVStore.setString(KEY, stored);
    await expect(hydrateAtRest()).resolves.toBeUndefined();
    expect(chatSessionsSlot.read()).toBeNull();

    // і слот далі працює: новий запис перекриває сміття
    void chatSessionsSlot.write(PLAIN);
    await flush();
    expect(chatSessionsSlot.read()).toBe(PLAIN);
  });

  it("пошкоджений конверт → порожньо", async () => {
    webKVStore.setString(KEY, '{"v":1,"iv":"AAAA","ct":"AAAA"}');
    await hydrateAtRest();
    expect(chatSessionsSlot.read()).toBeNull();
  });

  it("різний IV на кожен запис однакового тексту", async () => {
    const a = JSON.parse((await sealAtRest("s", PLAIN)) as string);
    const b = JSON.parse((await sealAtRest("s", PLAIN)) as string);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("AAD привʼязує шифртекст до слота", async () => {
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    await flush();
    const stored = safeReadStringLS(KEY) as string;
    // підсовуємо конверт чату під ключ Memory Bank
    memoryBankSlot.remove();
    webKVStore.setString("hub_user_profile_v1", stored);
    await hydrateAtRest();
    expect(memoryBankSlot.read()).toBeNull();
  });

  it("remove синхронно стирає і не воскресає від запису, що летить", async () => {
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    chatSessionsSlot.remove();
    await flush();
    expect(chatSessionsSlot.read()).toBeNull();
    expect(safeReadStringLS(KEY)).toBeNull();
  });

  it("масове стирання поза слотом (епоха) не дає запису, що летить, воскреснути", async () => {
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    webKVStore.remove(KEY);
    bumpAtRestWipeEpoch();
    await flush();
    expect(chatSessionsSlot.read()).toBeNull();
    expect(safeReadStringLS(KEY)).toBeNull();
  });

  it("без IndexedDB слот працює відкритим текстом і не падає", async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    await __resetAtRestKeyForTests();
    await hydrateAtRest();
    void chatSessionsSlot.write(PLAIN);
    expect(chatSessionsSlot.read()).toBe(PLAIN);
    expect(safeReadStringLS(KEY)).toBe(PLAIN);
  });
});
