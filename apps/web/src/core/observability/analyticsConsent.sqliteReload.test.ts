// @vitest-environment jsdom
/**
 * Регресія аудиту 2026-10-01 (`data-49`): рішення про згоду на аналітику не
 * переживало перезавантаження, коли SQLite KV уже піднято, і банер питав знову.
 *
 * Причина: `analyticsConsent` читає рішення один раз при імпорті модуля, ще до
 * `bootstrapKvStore()` (з localStorage-фолбека), а запис після бута йшов лише в
 * SQLite warm-cache, тож у localStorage ключа не було.
 *
 * Тут реальні `storage.ts`, `kvStoreBoot.ts` і справжня SQLite-WASM у памʼяті;
 * підмінено лише OPFS/воркер (як у `core/db/__tests__/kvStoreBoot.test.ts`).
 * «Перезавантаження» = `vi.resetModules()` + свіжий імпорт; localStorage при
 * цьому лишається, як у браузері.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("crossOriginIsolated", true);

type KvBoot = typeof import("../db/kvStoreBoot");
type Consent = typeof import("./analyticsConsent");
type Sqlite = typeof import("../db/sqlite");

/** Один «життєвий цикл сторінки»: свіжі модулі, localStorage спільний. */
async function loadPage(): Promise<{
  kv: KvBoot;
  consent: Consent;
  sqlite: Sqlite;
}> {
  vi.resetModules();
  const kv = await import("../db/kvStoreBoot");
  const sqlite = await import("../db/sqlite");
  // Порядок як у `main.tsx`: модуль згоди імпортується ЕАГЕРНО, до бута сховища.
  const consent = await import("./analyticsConsent");
  return { kv, consent, sqlite };
}

async function bootSqliteKv(page: { kv: KvBoot }): Promise<void> {
  const result = await page.kv.bootstrapKvStore({ broadcastChannel: null });
  expect(result.loaded).toBe(true);
  // Доказ, що тест справді йде SQLite-шляхом, а не LS-фолбеком.
  expect(page.kv.getActiveSqliteKvStore()).not.toBeNull();
}

beforeEach(() => {
  localStorage.clear();
  // Ховаємо персистентні VFS, щоб `openDb()` упав у памʼять.
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "FileSystemFileHandle", {
    value: undefined,
    configurable: true,
  });
});

afterEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("analyticsConsent: вибір → перезавантаження (SQLite KV увімкнено)", () => {
  it.each([
    ["denied", false],
    ["granted", true],
  ] as const)(
    "рішення %s переживає reload, банер не повертається",
    async (expected, value) => {
      const first = await loadPage();
      await bootSqliteKv(first);
      first.consent.setAnalyticsConsent(value);
      expect(first.consent.getAnalyticsDecision()).toBe(expected);

      // reload: нові модулі, SQLite ще не піднято (як на старті сторінки).
      const second = await loadPage();
      expect(second.kv.getActiveSqliteKvStore()).toBeNull();
      // Це рівно та умова, за якою `AnalyticsConsentGate` ховає банер.
      expect(second.consent.getAnalyticsDecision()).toBe(expected);
      expect(second.consent.getAnalyticsConsent()).toBe(value);

      // Після бута SQLite рішення нікуди не дівається.
      await bootSqliteKv(second);
      expect(second.consent.getAnalyticsDecision()).toBe(expected);
    },
  );

  it("згода fail-closed: без збереженого рішення аналітика вимкнена", async () => {
    const page = await loadPage();
    await bootSqliteKv(page);
    expect(page.consent.getAnalyticsDecision()).toBeNull();
    expect(page.consent.getAnalyticsConsent()).toBe(false);
  });

  it("«Дозволити» гостя з позначкою pendingServerSync переживає reload", async () => {
    const first = await loadPage();
    await bootSqliteKv(first);
    first.consent.setAnalyticsConsent(true, { pendingServerSync: true });

    const second = await loadPage();
    expect(second.consent.getAnalyticsDecision()).toBe("granted");
    expect(second.consent.getPendingAnalyticsSync()).toBe("granted");
  });
});
