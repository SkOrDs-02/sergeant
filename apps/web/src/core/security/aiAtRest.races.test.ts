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
  seals: [] as Array<{
    slot: string;
    plain: string;
    resolve: (v: string) => void;
  }>,
  opens: [] as Array<{ ct: string; resolve: (v: string) => void }>,
}));

vi.mock("./aiAtRestCrypto", () => ({
  ensureKey: () => (h.keyGate ?? Promise.resolve({})).then(() => ({})),
  resetKey: () => undefined,
  seal: (slot: string, plain: string) =>
    new Promise<string>((resolve) => h.seals.push({ slot, plain, resolve })),
  open: (_slot: string, env: { ct: string }) =>
    new Promise<string>((resolve) => h.opens.push({ ct: env.ct, resolve })),
}));

import {
  __resetAtRestKeyForTests,
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
  h.seals.length = 0;
  h.opens.length = 0;
  await __resetAtRestKeyForTests();
  chatSessionsSlot.remove();
  memoryBankSlot.remove();
  webKVStore.remove("hub_user_profile_meta_v1");
  await tick();
});

afterEach(() => {
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIDB;
});

describe("aiAtRest: гонки", () => {
  it("#2 розшифровка старого конверта не перетирає новіший запис", async () => {
    webKVStore.setString(KEY, envOf("B"));
    expect(chatSessionsSlot.read()).toBeNull(); // розшифровка B летить
    await tick();
    expect(h.opens).toHaveLength(1);

    void chatSessionsSlot.write("C");
    await tick();
    resolveSeal("C");
    await tick();
    expect(safeReadStringLS(KEY)).toBe(envOf("C"));

    h.opens[0]!.resolve("B"); // запізніла розшифровка
    await tick();
    expect(chatSessionsSlot.read()).toBe("C");
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
