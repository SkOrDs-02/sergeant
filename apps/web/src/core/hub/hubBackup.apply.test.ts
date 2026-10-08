/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the per-module backup adapters so this suite exercises the Hub
// routing/branch logic in isolation (which module fn is invoked, with
// what), independent of each module's own (separately tested) restore.
const normalizeFinykBackup = vi.fn((v: unknown) => v);
const readFinykBackupFromStorage = vi.fn(() => ({}));
const persistFinykNormalizedToStorage = vi.fn();
const APPLIED = {
  status: "applied" as const,
  result: { applied: 1, errored: 0, skipped: 0 },
};
type TestOutcome =
  | typeof APPLIED
  | { status: "skipped"; reason: string }
  | {
      status: "applied";
      result: { applied: number; errored: number; skipped: number };
    };
const persistFinykNormalizedToSqlite = vi.fn(
  async (_v: unknown, _mode?: unknown): Promise<TestOutcome> => APPLIED,
);
vi.mock("../../modules/finyk/lib/finykBackup", () => ({
  normalizeFinykBackup: (v: unknown) => normalizeFinykBackup(v),
  readFinykBackupFromStorage: () => readFinykBackupFromStorage(),
  persistFinykNormalizedToStorage: (v: unknown) =>
    persistFinykNormalizedToStorage(v),
  persistFinykNormalizedToSqlite: (v: unknown, mode: unknown) =>
    persistFinykNormalizedToSqlite(v, mode),
}));

const buildFizrukFullBackupPayload = vi.fn(() => ({ fizruk: true }));
const validateFizrukFullBackupPayload = vi.fn((_v: unknown) => ({}));
const applyFizrukFullBackupPayload = vi.fn(
  async (_v: unknown, _mode?: unknown): Promise<TestOutcome> => APPLIED,
);
vi.mock("../../modules/fizruk/lib/fizrukStorage", () => ({
  buildFizrukFullBackupPayload: () => buildFizrukFullBackupPayload(),
  validateFizrukFullBackupPayload: (v: unknown) =>
    validateFizrukFullBackupPayload(v),
  applyFizrukFullBackupPayload: (v: unknown, mode: unknown) =>
    applyFizrukFullBackupPayload(v, mode),
}));

const buildRoutineBackupPayload = vi.fn(() => ({ routine: true }));
const validateRoutineBackupPayload = vi.fn();
const applyRoutineBackupPayload = vi.fn();
vi.mock("../../modules/routine/lib/routineStorage", () => ({
  buildRoutineBackupPayload: () => buildRoutineBackupPayload(),
  validateRoutineBackupPayload: (v: unknown) => validateRoutineBackupPayload(v),
  applyRoutineBackupPayload: (v: unknown, mode: unknown) =>
    applyRoutineBackupPayload(v, mode),
}));

const buildNutritionBackupPayload = vi.fn(() => ({ nutrition: true }));
const validateNutritionBackupPayload = vi.fn();
const applyNutritionBackupPayload = vi.fn();
vi.mock("../../modules/nutrition/domain/nutritionBackup", () => ({
  buildNutritionBackupPayload: () => buildNutritionBackupPayload(),
  validateNutritionBackupPayload: (v: unknown) =>
    validateNutritionBackupPayload(v),
  applyNutritionBackupPayload: (v: unknown, mode: unknown) =>
    applyNutritionBackupPayload(v, mode),
}));

// Готовність керується тестом: за замовчуванням усе готове.
const isHubRestoreModuleReady = vi.fn((_m: string) => true);
let blockKind: "loading" | "sync" = "loading";
vi.mock("./hubBackupReadiness", () => ({
  isHubRestoreModuleReady: (m: string) => isHubRestoreModuleReady(m),
  getHubRestoreModuleBlock: (m: string) =>
    isHubRestoreModuleReady(m) ? null : blockKind,
  isHubRestoreReady: () => true,
}));

import {
  HUB_BACKUP_KIND,
  HUB_BACKUP_SCHEMA_VERSION,
  applyHubBackupPayload,
  buildHubBackupPayload,
} from "./hubBackup";

const HUB_MODULE_KEY = "hub_last_module";
const HUB_CHAT_KEY = "hub_chat_history";

function validPayload(over: Record<string, unknown> = {}) {
  return {
    kind: HUB_BACKUP_KIND,
    schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    finyk: {},
    fizruk: { fizruk: true },
    routine: { routine: true },
    nutrition: { nutrition: true },
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  persistFinykNormalizedToSqlite.mockImplementation(async () => APPLIED);
  applyFizrukFullBackupPayload.mockImplementation(async () => APPLIED);
  isHubRestoreModuleReady.mockImplementation(() => true);
  blockKind = "loading";
});
afterEach(() => vi.clearAllMocks());

describe("buildHubBackupPayload — hub / chat branches", () => {
  it("includes lastModule when present and omits chatHistory by default", () => {
    localStorage.setItem(HUB_MODULE_KEY, "finyk");
    localStorage.setItem(HUB_CHAT_KEY, "[]");
    const payload = buildHubBackupPayload();
    expect(payload.hub).toEqual({ lastModule: "finyk" });
    expect(payload.hub?.chatHistory).toBeUndefined();
  });

  it("includes chatHistory when includeChat is true", () => {
    localStorage.setItem(HUB_CHAT_KEY, '[{"role":"user"}]');
    const payload = buildHubBackupPayload({ includeChat: true });
    expect(payload.hub?.chatHistory).toBe('[{"role":"user"}]');
  });

  it("leaves hub undefined when no hub keys are stored", () => {
    const payload = buildHubBackupPayload({ includeChat: true });
    expect(payload.hub).toBeUndefined();
  });

  it("falls back to {} for finyk when normalize throws", () => {
    normalizeFinykBackup.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const payload = buildHubBackupPayload();
    expect(payload.finyk).toEqual({});
  });
});

describe("applyHubBackupPayload", () => {
  it("throws on a non-hub-backup object", async () => {
    await expect(applyHubBackupPayload({ kind: "other" })).rejects.toThrow(
      /резервної копії/,
    );
  });

  it("routes each module section to its apply fn", async () => {
    await applyHubBackupPayload(
      validPayload({ finyk: { accounts: [], version: 1 } }),
    );
    // Канонічний запис імпорту — SQLite, не LS: без нього відновлене
    // не видно жодному читанню Фініка (див. hubBackup.roundtrip.test.ts).
    expect(persistFinykNormalizedToSqlite).toHaveBeenCalledTimes(1);
    expect(persistFinykNormalizedToSqlite.mock.calls[0]?.[1]).toBe("merge");
    expect(applyRoutineBackupPayload).toHaveBeenCalledWith(
      { routine: true },
      "merge",
    );
    expect(applyFizrukFullBackupPayload).toHaveBeenCalledWith(
      { fizruk: true },
      "merge",
    );
    expect(applyNutritionBackupPayload).toHaveBeenCalledWith(
      { nutrition: true },
      "merge",
    );
  });

  it("injects version:1 into finyk when missing before persisting", async () => {
    await applyHubBackupPayload(
      validPayload({ finyk: { accounts: [{ id: "a" }] } }),
    );
    expect(persistFinykNormalizedToSqlite).toHaveBeenCalledTimes(1);
    const normalizeArg = normalizeFinykBackup.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(normalizeArg["version"]).toBe(1);
  });

  it("skips finyk persist when only a version key is present (no real data)", async () => {
    await applyHubBackupPayload(validPayload({ finyk: { version: 1 } }));
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("skips finyk persist when finyk is empty object", async () => {
    await applyHubBackupPayload(validPayload({ finyk: {} }));
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });

  it("restores a valid hub.lastModule but ignores an unknown module", async () => {
    await applyHubBackupPayload(validPayload({ hub: { lastModule: "finyk" } }));
    expect(localStorage.getItem(HUB_MODULE_KEY)).toBe("finyk");

    localStorage.clear();
    await applyHubBackupPayload(
      validPayload({ hub: { lastModule: "bogus-module" } }),
    );
    expect(localStorage.getItem(HUB_MODULE_KEY)).toBeNull();
  });

  it("restores hub.chatHistory when it is a string", async () => {
    await applyHubBackupPayload(
      validPayload({ hub: { chatHistory: '[{"role":"user"}]' } }),
    );
    expect(localStorage.getItem(HUB_CHAT_KEY)).toBe('[{"role":"user"}]');
  });

  it("hub: у режимі merge не перебиває наявний останній розділ і чат, у replace перебиває", async () => {
    localStorage.setItem(HUB_MODULE_KEY, "routine");
    localStorage.setItem(HUB_CHAT_KEY, "[1]");
    const hub = { lastModule: "finyk", chatHistory: "[2]" };

    await applyHubBackupPayload(validPayload({ hub }));
    expect(localStorage.getItem(HUB_MODULE_KEY)).toBe("routine");
    expect(localStorage.getItem(HUB_CHAT_KEY)).toBe("[1]");

    await applyHubBackupPayload(validPayload({ hub }), { mode: "replace" });
    expect(localStorage.getItem(HUB_MODULE_KEY)).toBe("finyk");
    expect(localStorage.getItem(HUB_CHAT_KEY)).toBe("[2]");
  });

  it("does not call module apply fns for absent sections", async () => {
    await applyHubBackupPayload({
      kind: HUB_BACKUP_KIND,
      schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
      finyk: null,
      routine: null,
      fizruk: null,
      nutrition: null,
    });
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
    expect(applyRoutineBackupPayload).not.toHaveBeenCalled();
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
    expect(applyNutritionBackupPayload).not.toHaveBeenCalled();
  });
});

// Аудит 2026-10-01, data-06 / data-07.
describe("applyHubBackupPayload — режими і чесний результат", () => {
  const finykPayload = (over: Record<string, unknown> = {}) =>
    validPayload({
      finyk: { accounts: [], version: 1 },
      fizruk: null,
      routine: null,
      nutrition: null,
      ...over,
    });

  it("дефолт — merge: LS Фініка не чіпається, режим доходить до модулів", async () => {
    await applyHubBackupPayload(
      validPayload({ finyk: { version: 1, budgets: [] } }),
    );
    expect(persistFinykNormalizedToStorage).not.toHaveBeenCalled();
    expect(persistFinykNormalizedToSqlite.mock.calls[0]?.[1]).toBe("merge");
  });

  it("replace: пише і в LS, і в SQLite, режим доходить до всіх модулів", async () => {
    await applyHubBackupPayload(
      validPayload({ finyk: { accounts: [], version: 1 } }),
      { mode: "replace" },
    );
    expect(persistFinykNormalizedToStorage).toHaveBeenCalledTimes(1);
    expect(persistFinykNormalizedToSqlite.mock.calls[0]?.[1]).toBe("replace");
    expect(applyRoutineBackupPayload).toHaveBeenCalledWith(
      { routine: true },
      "replace",
    );
    expect(applyFizrukFullBackupPayload).toHaveBeenCalledWith(
      { fizruk: true },
      "replace",
    );
    expect(applyNutritionBackupPayload).toHaveBeenCalledWith(
      { nutrition: true },
      "replace",
    );
  });

  it("skipped (контекст не зареєстровано) Фініка — помилка, а не тихий успіх", async () => {
    persistFinykNormalizedToSqlite.mockResolvedValueOnce({
      status: "skipped",
      reason: "context-unset",
    });
    await expect(applyHubBackupPayload(finykPayload())).rejects.toThrow(
      /Не вдалось записати дані Фініка/,
    );
  });

  it("skipped (контекст не зареєстровано) Фізрука — помилка, а не тихий успіх", async () => {
    applyFizrukFullBackupPayload.mockResolvedValueOnce({
      status: "skipped",
      reason: "context-unset",
    });
    await expect(
      applyHubBackupPayload(validPayload({ finyk: {} })),
    ).rejects.toThrow(/Не вдалось записати дані Фізрука/);
  });

  it("applied з errored > 0 — теж помилка (частину записів SQL не прийняв)", async () => {
    persistFinykNormalizedToSqlite.mockResolvedValueOnce({
      status: "applied",
      result: { applied: 3, errored: 1, skipped: 0 },
    });
    await expect(applyHubBackupPayload(finykPayload())).rejects.toThrow(
      /Частина даних Фініка не записалась/,
    );
  });

  it("skipped no-ops (файл нічого не додає) — не помилка", async () => {
    persistFinykNormalizedToSqlite.mockResolvedValueOnce({
      status: "skipped",
      reason: "no-ops",
    });
    await expect(
      applyHubBackupPayload(finykPayload()),
    ).resolves.toBeUndefined();
  });

  it("модуль не готовий: кидає ДО будь-якого запису", async () => {
    isHubRestoreModuleReady.mockImplementation((m) => m !== "fizruk");
    await expect(
      applyHubBackupPayload(validPayload({ finyk: {} })),
    ).rejects.toThrow(/ще завантажуються/);
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
  });

  it("локально готово, але повного pull з акаунта ще не було: кидає про синхронізацію, нічого не пишучи", async () => {
    isHubRestoreModuleReady.mockImplementation(() => false);
    blockKind = "sync";
    await expect(
      applyHubBackupPayload(validPayload({ finyk: {} })),
    ).rejects.toThrow(/Чекаю на синхронізацію з акаунтом/);
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
  });

  it("готовність перевіряється лише для секцій, які є у файлі", async () => {
    isHubRestoreModuleReady.mockImplementation((m) => m === "finyk");
    await expect(
      applyHubBackupPayload(finykPayload()),
    ).resolves.toBeUndefined();
  });
});

// Аудит 2026-10-01, data-34: спершу перевірка всіх секцій, потім записи.
describe("applyHubBackupPayload — validate-all до першого запису", () => {
  const withFinyk = (over: Record<string, unknown> = {}) =>
    validPayload({ finyk: { accounts: [], version: 1 }, ...over });

  it("відхилений зріз Рутини, Фізрука чи Їжі кидає ДО запису Фініка", async () => {
    validateRoutineBackupPayload.mockImplementationOnce(() => {
      throw new Error("routine bad");
    });
    await expect(applyHubBackupPayload(withFinyk())).rejects.toThrow(
      "routine bad",
    );

    validateFizrukFullBackupPayload.mockImplementationOnce(() => {
      throw new Error("fizruk bad");
    });
    await expect(applyHubBackupPayload(withFinyk())).rejects.toThrow(
      "fizruk bad",
    );

    validateNutritionBackupPayload.mockImplementationOnce(() => {
      throw new Error("nutrition bad");
    });
    await expect(applyHubBackupPayload(withFinyk())).rejects.toThrow(
      "nutrition bad",
    );

    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
    expect(applyRoutineBackupPayload).not.toHaveBeenCalled();
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
    expect(applyNutritionBackupPayload).not.toHaveBeenCalled();
  });

  it("битий Фінік кидає, не зачепивши інших модулів", async () => {
    normalizeFinykBackup.mockImplementationOnce(() => {
      throw new Error("finyk bad");
    });
    await expect(applyHubBackupPayload(withFinyk())).rejects.toThrow(
      "finyk bad",
    );
    expect(applyRoutineBackupPayload).not.toHaveBeenCalled();
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
  });

  it("не готовий пізніший модуль кидає ДО запису Фініка", async () => {
    isHubRestoreModuleReady.mockImplementation((m) => m !== "nutrition");
    await expect(applyHubBackupPayload(withFinyk())).rejects.toThrow(
      /ще завантажуються/,
    );
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
    expect(applyRoutineBackupPayload).not.toHaveBeenCalled();
    expect(applyFizrukFullBackupPayload).not.toHaveBeenCalled();
  });

  it("schemaVersion новіший за підтримуваний відхиляється людським текстом", async () => {
    await expect(
      applyHubBackupPayload(withFinyk({ schemaVersion: 2 })),
    ).rejects.toThrow("Файл з новішої версії застосунку, онови сторінку");
    expect(persistFinykNormalizedToSqlite).not.toHaveBeenCalled();
  });
});
