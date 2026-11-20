// Гонки aiAtRest (рев'ю CodeRabbit на PR #1698): шифрування і розшифровка
// керуються вручну через мок криптоядра, щоб відтворити порядок завершень.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const h = vi.hoisted(() => ({
  keyGate: null as null | Promise<unknown>,
  /** `true` — ключ є в IDB, але зараз не завантажується. */
  keyFails: false,
  seals: [] as Array<{
    slot: string;
    plain: string;
    resolve: (v: string) => void;
    reject: (e: unknown) => void;
  }>,
  opens: [] as Array<{
    ct: string;
    resolve: (v: string) => void;
    reject: (e: unknown) => void;
  }>,
}));

vi.mock("./aiAtRestCrypto", () => ({
  ensureKey: () =>
    (h.keyGate ?? Promise.resolve({})).then(() => (h.keyFails ? null : {})),
  resetKey: () => undefined,
  seal: (slot: string, plain: string) =>
    new Promise<string>((resolve, reject) =>
      h.seals.push({ slot, plain, resolve, reject }),
    ),
  open: (_slot: string, env: { ct: string }) =>
    new Promise<string>((resolve, reject) =>
      h.opens.push({ ct: env.ct, resolve, reject }),
    ),
}));

import {
  __resetAtRestKeyForTests,
  chatLegacyHistorySlot,
  chatSessionsSlot,
  memoryBankSlot,
} from "./aiAtRest";
import { bumpAtRestWipeEpoch, holdAtRestWrites } from "./aiAtRestEpoch";
import { safeReadStringLS, webKVStore } from "@shared/lib/storage/storage";
import {
  readMemoryBankMeta,
  subscribeLocalMemoryEdit,
  writeMemoryEntries,
  MEMORY_BANK_META_EPOCH,
} from "../profile/memoryBank";

const KEY = "hub_chat_sessions_v1";
const envOf = (ct: string) => JSON.stringify({ v: 1, iv: "iv", ct });

async function tick(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Завершує шифрування: конверт несе відкритий текст у `ct` (мок). */
function resolveSeal(plain: string): void {
  const i = h.seals.findIndex((s) => s.plain === plain);
  if (i < 0) throw new Error(`no pending seal for ${plain}`);
  const [s] = h.seals.splice(i, 1);
  s!.resolve(envOf(s!.plain));
}

const originalIDB = (globalThis as { indexedDB?: unknown }).indexedDB;

beforeEach(async () => {
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
  h.keyGate = null;
  h.keyFails = false;
  h.seals.length = 0;
  h.opens.length = 0;
  await __resetAtRestKeyForTests();
  chatSessionsSlot.remove();
  memoryBankSlot.remove();
  chatLegacyHistorySlot.remove();
  webKVStore.remove("hub_user_profile_meta_v1");
  await tick();
});

afterEach(() => {
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIDB;
});

describe("aiAtRest: гонки", () => {
  it("#2/#19 запис до розбору шифртексту не замінює його; розбір не губиться", async () => {
    webKVStore.setString(KEY, envOf("B"));
    expect(chatSessionsSlot.read()).toBeNull(); // розшифровка B летить
    expect(chatSessionsSlot.isReady()).toBe(false);
    await tick();
    expect(h.opens).toHaveLength(1);

    // Холодний бут: споживач побачив «порожньо» і пише нове.
    expect(await chatSessionsSlot.write("C")).toBe(false);
    expect(h.seals).toHaveLength(0);
    expect(safeReadStringLS(KEY)).toBe(envOf("B"));

    h.opens[0]!.resolve("B");
    await tick();
    expect(chatSessionsSlot.isReady()).toBe(true);
    expect(chatSessionsSlot.read()).toBe("B");

    // Після розбору запис іде звичайно.
    const p = chatSessionsSlot.write("C");
    await tick();
    resolveSeal("C");
    expect(await p).toBe(true);
    expect(safeReadStringLS(KEY)).toBe(envOf("C"));
  });

  it("#3 міграція легасі не перезаписує запис, зроблений під час await ключа", async () => {
    const gate = deferred<void>();
    h.keyGate = gate.promise;
    webKVStore.setString(KEY, "P");

    const hydrating = chatSessionsSlot.hydrate(); // чекає ключ
    void chatSessionsSlot.write("Q");
    gate.resolve();
    await tick();
    await hydrating;

    expect(h.seals.map((s) => s.plain)).toEqual(["Q"]);
    resolveSeal("Q");
    await tick();
    expect(safeReadStringLS(KEY)).toBe(envOf("Q"));
    expect(chatSessionsSlot.read()).toBe("Q");
  });

  it("#4 гідратація після зміни епохи не губиться на першому read", async () => {
    bumpAtRestWipeEpoch();
    webKVStore.setString(KEY, envOf("X"));
    const hydrating = chatSessionsSlot.hydrate();
    await tick();
    h.opens[0]!.resolve("X");
    await hydrating;
    expect(chatSessionsSlot.read()).toBe("X");
  });

  it("#4 епоха, що змінилась ПІД ЧАС гідратації, відкидає результат", async () => {
    webKVStore.setString(KEY, envOf("X"));
    const hydrating = chatSessionsSlot.hydrate();
    await tick();
    bumpAtRestWipeEpoch();
    webKVStore.remove(KEY);
    h.opens[0]!.resolve("X");
    await hydrating;
    expect(chatSessionsSlot.read()).toBeNull();
  });

  it("#5 проміс write резолвиться лише після фізичного запису", async () => {
    let settled = false;
    const p = chatSessionsSlot.write("H").then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false);
    expect(safeReadStringLS(KEY)).toBeNull();
    resolveSeal("H");
    await p;
    expect(safeReadStringLS(KEY)).toBe(envOf("H"));
  });

  it("#7 барʼєр тримає фізичний запис до відпускання", async () => {
    const release = holdAtRestWrites();
    void chatSessionsSlot.write("A");
    await tick();
    resolveSeal("A");
    await tick();
    expect(safeReadStringLS(KEY)).toBeNull();
    expect(chatSessionsSlot.read()).toBe("A"); // кеш уже знає
    release();
    await chatSessionsSlot.flush();
    expect(safeReadStringLS(KEY)).toBe(envOf("A"));
  });

  it("#7 стирання під час барʼєра скасовує запис, що чекав", async () => {
    const release = holdAtRestWrites();
    void chatSessionsSlot.write("A");
    await tick();
    resolveSeal("A");
    await tick();
    bumpAtRestWipeEpoch();
    release();
    await chatSessionsSlot.flush();
    expect(safeReadStringLS(KEY)).toBeNull();
  });
});

describe("aiAtRest: ключ недоступний vs нечитний шифртекст (#12)", () => {
  it("ключ не завантажився: слот замкнений, шифртекст цілий, потім відмикається", async () => {
    webKVStore.setString(KEY, envOf("history"));
    h.keyFails = true;
    await chatSessionsSlot.hydrate();
    expect(chatSessionsSlot.isLocked()).toBe(true);
    expect(chatSessionsSlot.read()).toBeNull();

    // Споживач, що побачив «порожньо», пише нове — історію це не затирає.
    expect(await chatSessionsSlot.write("new-only")).toBe(false);
    await chatSessionsSlot.flush();
    expect(safeReadStringLS(KEY)).toBe(envOf("history"));
    expect(h.seals).toHaveLength(0);

    h.keyFails = false;
    const hydrating = chatSessionsSlot.hydrate();
    await tick();
    h.opens[0]!.resolve("history");
    await hydrating;
    expect(chatSessionsSlot.isLocked()).toBe(false);
    expect(chatSessionsSlot.read()).toBe("history");
  });

  it("ключ є, а шифртекст не відкривається: порожньо, наступний запис замінює", async () => {
    webKVStore.setString(KEY, envOf("garbage"));
    const hydrating = chatSessionsSlot.hydrate();
    await tick();
    h.opens[0]!.reject(new DOMException("bad tag", "OperationError"));
    await hydrating;
    expect(chatSessionsSlot.isLocked()).toBe(false);
    expect(chatSessionsSlot.read()).toBeNull();

    const p = chatSessionsSlot.write("fresh");
    await tick();
    resolveSeal("fresh");
    expect(await p).toBe(true);
    expect(safeReadStringLS(KEY)).toBe(envOf("fresh"));
  });

  it("ключ пропав між гідратацією і записом: запис не пише відкритий текст", async () => {
    await chatSessionsSlot.hydrate();
    h.keyFails = true;
    await __resetAtRestKeyForTests();
    expect(await chatSessionsSlot.write("secret")).toBe(false);
    expect(safeReadStringLS(KEY)).toBeNull();
  });
});

describe("aiAtRest: барʼєр без вікна (#13) і відкритий фолбек (#14)", () => {
  it("#13 нове утримання одразу після відпускання теж тримає запис", async () => {
    const release1 = holdAtRestWrites();
    void chatSessionsSlot.write("A");
    await tick();
    resolveSeal("A");
    await tick();
    release1();
    const release2 = holdAtRestWrites(); // синхронно, як у перевірці на виході
    await tick();
    expect(safeReadStringLS(KEY)).toBeNull();
    release2();
    await chatSessionsSlot.flush();
    expect(safeReadStringLS(KEY)).toBe(envOf("A"));
  });

  it("#14 без WebCrypto/IDB відкритий запис теж чекає барʼєра", async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    await __resetAtRestKeyForTests();
    const release = holdAtRestWrites();
    const p = chatSessionsSlot.write("P");
    expect(safeReadStringLS(KEY)).toBeNull();
    release();
    expect(await p).toBe(true);
    expect(safeReadStringLS(KEY)).toBe("P");
  });

  it("#14 стирання під час барʼєра скасовує відкритий запис", async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    await __resetAtRestKeyForTests();
    const release = holdAtRestWrites();
    const p = chatSessionsSlot.write("P");
    chatSessionsSlot.remove();
    release();
    await p;
    expect(safeReadStringLS(KEY)).toBeNull();
  });

  it("#14 без барʼєра відкритий запис синхронний", async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    await __resetAtRestKeyForTests();
    void chatSessionsSlot.write("P");
    expect(safeReadStringLS(KEY)).toBe("P");
  });
});

describe("aiAtRest: результат запису (#15)", () => {
  it("відмова шифрування → false", async () => {
    const p = chatLegacyHistorySlot.write("x");
    await tick();
    h.seals[0]!.reject(new Error("boom"));
    expect(await p).toBe(false);
  });

  it("перекритий новішим записом → true", async () => {
    const p1 = chatSessionsSlot.write("1");
    const p2 = chatSessionsSlot.write("2");
    await tick();
    resolveSeal("2");
    resolveSeal("1");
    expect(await p1).toBe(true);
    expect(await p2).toBe(true);
    expect(safeReadStringLS(KEY)).toBe(envOf("2"));
  });

  it("memoryBank: відмова запису не рухає мітку і не штовхає на сервер", async () => {
    const pushed = vi.fn();
    const off = subscribeLocalMemoryEdit(pushed);
    writeMemoryEntries([{ id: "m1", fact: "x", category: "other" } as never]);
    await tick();
    h.seals[0]!.reject(new Error("quota"));
    await memoryBankSlot.flush();
    await tick();
    expect(readMemoryBankMeta().updatedAt).toBe(MEMORY_BANK_META_EPOCH);
    expect(pushed).not.toHaveBeenCalled();
    off();
  });

  it("memoryBank: замкнений слот (ключ недоступний) — так само", async () => {
    webKVStore.setString("hub_user_profile_v1", envOf("[]"));
    h.keyFails = true;
    await memoryBankSlot.hydrate();
    expect(memoryBankSlot.isLocked()).toBe(true);
    const pushed = vi.fn();
    const off = subscribeLocalMemoryEdit(pushed);
    // Банк не розібраний: локальна правка падає, а не робить вигляд.
    expect(() =>
      writeMemoryEntries([{ id: "m1", fact: "x", category: "other" } as never]),
    ).toThrow(/завантажується/);
    await tick();
    expect(readMemoryBankMeta().updatedAt).toBe(MEMORY_BANK_META_EPOCH);
    expect(pushed).not.toHaveBeenCalled();
    expect(safeReadStringLS("hub_user_profile_v1")).toBe(envOf("[]"));
    off();
  });
});

describe("memoryBank: мітка часу після шифрованого запису (#6)", () => {
  it("meta і push-сповіщення лише після того, як записи лягли", async () => {
    const pushed = vi.fn();
    const off = subscribeLocalMemoryEdit(pushed);
    writeMemoryEntries([
      { id: "m1", fact: "Не їм арахіс", category: "allergy" } as never,
    ]);
    await tick();
    expect(readMemoryBankMeta().updatedAt).toBe(MEMORY_BANK_META_EPOCH);
    expect(pushed).not.toHaveBeenCalled();

    h.seals[0]!.resolve(envOf(h.seals[0]!.plain));
    await memoryBankSlot.flush();
    await tick();
    expect(readMemoryBankMeta().updatedAt).not.toBe(MEMORY_BANK_META_EPOCH);
    expect(pushed).toHaveBeenCalledTimes(1);
    off();
  });

  it("стирання у вікні шифрування не воскрешає мітку", async () => {
    writeMemoryEntries([{ id: "m1", fact: "x", category: "other" } as never]);
    await tick();
    bumpAtRestWipeEpoch();
    h.seals[0]!.resolve(envOf(h.seals[0]!.plain));
    await memoryBankSlot.flush();
    await tick();
    expect(readMemoryBankMeta().updatedAt).toBe(MEMORY_BANK_META_EPOCH);
  });
});
