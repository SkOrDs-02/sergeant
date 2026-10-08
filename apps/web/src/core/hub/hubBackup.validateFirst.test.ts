/**
 * Last validated: 2026-10-05
 * Status: Active
 *
 * Аудит 2026-10-01, data-34: імпорт бекапу спершу перевіряє ВСІ секції без
 * запису і лише потім пише. Тут Рутина і Фізрук справжні (їхні перевірки й
 * форма файлу), замоковані лише точки запису: `persistFinykNormalizedToSqlite`
 * і `dualWriteFizrukState`. Сестра `hubBackup.apply.test.ts` мокає самі
 * перевірки, тож не бачить, чи справжні модулі відхиляють битий файл.
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistFinykNormalizedToSqlite = vi.fn(async () => ({
  status: "applied" as const,
  result: { applied: 1, errored: 0, skipped: 0 },
}));
vi.mock("../../modules/finyk/lib/finykBackup", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../modules/finyk/lib/finykBackup")
    >();
  return {
    ...actual,
    persistFinykNormalizedToStorage: vi.fn(),
    persistFinykNormalizedToSqlite: (v: unknown, m: unknown) =>
      (persistFinykNormalizedToSqlite as (...a: unknown[]) => unknown)(v, m),
  };
});

const dualWriteFizrukState = vi.fn(async () => ({
  status: "applied" as const,
  result: { applied: 1, errored: 0, skipped: 0 },
}));
vi.mock(
  "../../modules/fizruk/lib/sqliteWriter/index",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../modules/fizruk/lib/sqliteWriter/index")
      >();
    return {
      ...actual,
      dualWriteFizrukState: (...a: unknown[]) =>
        (dualWriteFizrukState as (...x: unknown[]) => unknown)(...a),
    };
  },
);

// Теплий кеш Фізрука: без нього старий код упирався б у «ще завантажуються»
// ще до розбору зрізів, і тест не відрізнив би «є перевірка» від «немає кешу».
vi.mock("../../modules/fizruk/lib/sqliteReader", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../modules/fizruk/lib/sqliteReader")
    >();
  return {
    ...actual,
    getCachedFizrukSqliteState: () => ({
      ...actual.getCachedFizrukSqliteState(),
      refreshedAt: 1,
    }),
  };
});

vi.mock("./hubBackupReadiness", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hubBackupReadiness")>();
  return {
    ...actual,
    getHubRestoreModuleBlock: () => null,
  };
});

import { HUB_BACKUP_KIND, applyHubBackupPayload } from "./hubBackup";

const MEASUREMENTS_KEY = "fizruk_measurements_v1";

function payload(over: Record<string, unknown> = {}) {
  return {
    kind: HUB_BACKUP_KIND,
    schemaVersion: 1,
    finyk: {
      version: 3,
      manualExpenses: [{ id: "e1", amount: 100, description: "Кава" }],
    },
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe("applyHubBackupPayload — validate-all до першого запису (data-34)", () => {
  it("битий зріз Рутини кидає ДО запису Фініка", async () => {
    await expect(
      applyHubBackupPayload(
        payload({
          routine: { kind: "hub-routine-backup", data: { habits: [null] } },
        }),
      ),
    ).rejects.toThrow(/Рутини/);
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("помилка Рутини людська, а не сирий TypeError", async () => {
    const err = await applyHubBackupPayload(
      payload({
        routine: { kind: "hub-routine-backup", data: { habits: [null] } },
      }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/Cannot read properties/);
    expect((err as Error).message).toMatch(/[А-Яа-я]/);
  });

  it("обрізаний зріз заміру Фізрука у replace кидає, нічого не записавши", async () => {
    await expect(
      applyHubBackupPayload(
        payload({
          fizruk: {
            kind: "fizruk-full-backup",
            schemaVersion: 1,
            data: { [MEASUREMENTS_KEY]: '{"truncated' },
          },
        }),
        { mode: "replace" },
      ),
    ).rejects.toThrow(/Пошкоджений файл: розділ Фізрука «заміри»/);
    expect(dualWriteFizrukState).not.toHaveBeenCalled();
    // Фінік іде раніше за Фізрук у фазі запису: він теж не мав записатись.
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("зріз Фізрука не тієї форми (обʼєкт замість масиву) теж помилка", async () => {
    await expect(
      applyHubBackupPayload(
        payload({
          fizruk: {
            kind: "fizruk-full-backup",
            schemaVersion: 1,
            data: { [MEASUREMENTS_KEY]: '{"a":1}' },
          },
        }),
        { mode: "replace" },
      ),
    ).rejects.toThrow(/розділ Фізрука/);
    expect(dualWriteFizrukState).not.toHaveBeenCalled();
  });

  it("секція Фізрука з чужим kind або новішою schemaVersion відхиляється", async () => {
    await expect(
      applyHubBackupPayload(payload({ fizruk: { kind: "other", data: {} } })),
    ).rejects.toThrow(/Фізрука/);
    await expect(
      applyHubBackupPayload(
        payload({
          fizruk: { kind: "fizruk-full-backup", schemaVersion: 2, data: {} },
        }),
      ),
    ).rejects.toThrow("Файл з новішої версії застосунку, онови сторінку");
    expect(dualWriteFizrukState).not.toHaveBeenCalled();
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("секція Їжі з чужим kind кидає ДО запису Фініка", async () => {
    await expect(
      applyHubBackupPayload(
        payload({ nutrition: { kind: "other", schemaVersion: 1, data: {} } }),
      ),
    ).rejects.toThrow("Некоректний тип бекапу харчування.");
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("schemaVersion:2 кореня відхиляється ДО будь-якого запису", async () => {
    await expect(
      applyHubBackupPayload(payload({ schemaVersion: 2 })),
    ).rejects.toThrow("Файл з новішої версії застосунку, онови сторінку");
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("валідний файл і далі застосовується: Фінік і Фізрук пишуться", async () => {
    await applyHubBackupPayload(
      payload({
        fizruk: {
          kind: "fizruk-full-backup",
          schemaVersion: 1,
          data: {
            [MEASUREMENTS_KEY]: JSON.stringify([
              { id: "m1", at: "2026-09-01T08:00:00.000Z", weightKg: 80 },
            ]),
          },
        },
      }),
      { mode: "replace" },
    );
    expect(persistFinykNormalizedToSqlite).toHaveBeenCalledTimes(1);
    expect(dualWriteFizrukState).toHaveBeenCalledTimes(1);
  });
});
