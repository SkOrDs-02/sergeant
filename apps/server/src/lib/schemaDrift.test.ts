import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Регресія на три серпневі інциденти 2026 (`is_jar`, `last_token_check_at`,
 * `active_modules`): міграція лежить у релізі, у базі її немає, прод віддає
 * 500, і ніхто про це не знає, поки не поскаржаться користувачі.
 */

// `vi.mock` піднімається на верх файлу, тож фабрики не бачать звичайних
// `const` — моки мусять жити у `vi.hoisted`.
const { listShippedMigrationsMock, loggerMock, migrationsDirRef } = vi.hoisted(
  () => ({
    listShippedMigrationsMock: vi.fn<() => Promise<string[]>>(),
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    // Мутабельний, бо `access(MIGRATIONS_DIR)` читає його на кожен виклик:
    // дефолт — реальний каталог репо (він існує), а кейс зламаного артефакта
    // підміняє шлях на неіснуючий.
    migrationsDirRef: { current: "" },
  }),
);

vi.mock("../db.js", () => ({
  listShippedMigrations: () => listShippedMigrationsMock(),
  get MIGRATIONS_DIR() {
    return migrationsDirRef.current;
  },
}));
vi.mock("../obs/logger.js", () => ({ logger: loggerMock }));

const REAL_MIGRATIONS_DIR = new URL("../migrations", import.meta.url).pathname;

import {
  checkSchemaDrift,
  driftBlocksReadiness,
  getLastSchemaDriftReport,
  getSchemaDriftCheckState,
  markSchemaDriftCheckStarted,
  reportSchemaDriftAtBoot,
  __resetSchemaDriftCacheForTests,
} from "./schemaDrift.js";

/**
 * Мінімальний фейк pg-пулу: перший запит — `to_regclass`, другий — вибірка
 * імен. `tableExists: false` емулює базу, в яку pre-deploy не сходив жодного
 * разу (тоді `SELECT ... FROM schema_migrations` упав би ще на плануванні).
 */
function fakePool(applied: string[] | null) {
  const tableExists = applied !== null;
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass")) {
        return { rows: [{ reg: tableExists ? "schema_migrations" : null }] };
      }
      if (!tableExists) throw new Error("relation does not exist");
      return { rows: (applied ?? []).map((name) => ({ name })) };
    }),
  } as never;
}

beforeEach(() => {
  migrationsDirRef.current = REAL_MIGRATIONS_DIR;
  __resetSchemaDriftCacheForTests();
  listShippedMigrationsMock.mockReset();
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
  delete process.env["MIGRATION_DRIFT_BLOCKS_READINESS"];
});

afterEach(() => {
  delete process.env["MIGRATION_DRIFT_BLOCKS_READINESS"];
});

describe("checkSchemaDrift", () => {
  it("рапортує inSync, коли база наздогнала образ", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql", "002_b.sql"]);
    const report = await checkSchemaDrift(fakePool(["001_a.sql", "002_b.sql"]));
    expect(report).toMatchObject({
      shipped: 2,
      applied: 2,
      pending: [],
      unknown: [],
      inSync: true,
    });
  });

  // Точний зліпок інциденту `sergeant@29a02d3`.
  it("ловить міграцію, що поїхала в образі, але не застосована", async () => {
    listShippedMigrationsMock.mockResolvedValue([
      "116_user_preferences_active_modules.sql",
      "119_mono_account_is_jar.sql",
      "120_mono_connection_token_check.sql",
    ]);
    const report = await checkSchemaDrift(
      fakePool(["116_user_preferences_active_modules.sql"]),
    );
    expect(report.inSync).toBe(false);
    expect(report.pending).toEqual([
      "119_mono_account_is_jar.sql",
      "120_mono_connection_token_check.sql",
    ]);
  });

  it("трактує відсутню schema_migrations як «не застосовано нічого»", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    const report = await checkSchemaDrift(fakePool(null));
    expect(report.applied).toBe(0);
    expect(report.pending).toEqual(["001_a.sql"]);
    expect(report.inSync).toBe(false);
  });

  // Порожній список від зламаного артефакта невідрізнимий від справді
  // синхронної схеми: на свіжій базі обидва дають shipped:0/applied:0. Без
  // окремої позначки детектор мовчки рапортував би «здорово» і не підняв би
  // алерту — тобто гарантія, заради якої він існує, тихо зникла б.
  it("не вважає відсутній каталог міграцій синхронною схемою", async () => {
    migrationsDirRef.current = "/nonexistent/migrations-dir";
    listShippedMigrationsMock.mockResolvedValue([]);
    const report = await checkSchemaDrift(fakePool([]));
    expect(report.migrationsDirMissing).toBe(true);
    expect(report.inSync).toBe(false);
  });

  it("не піднімає прапорець, коли каталог на місці", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    const report = await checkSchemaDrift(fakePool(["001_a.sql"]));
    expect(report.migrationsDirMissing).toBe(false);
    expect(report.inSync).toBe(true);
  });

  it("позначає відкат на старіший образ через unknown, не через pending", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    const report = await checkSchemaDrift(fakePool(["001_a.sql", "002_b.sql"]));
    expect(report.unknown).toEqual(["002_b.sql"]);
    expect(report.pending).toEqual([]);
    expect(report.inSync).toBe(true);
  });
});

describe("reportSchemaDriftAtBoot", () => {
  it("шле алерт і кешує звіт при дрейфі", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql", "002_b.sql"]);
    const captureMessage = vi.fn();

    const report = await reportSchemaDriftAtBoot(
      fakePool(["001_a.sql"]),
      captureMessage,
    );

    expect(report?.inSync).toBe(false);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "schema_drift_detected" }),
    );
    expect(getLastSchemaDriftReport()?.pending).toEqual(["002_b.sql"]);
  });

  it("мовчить у Sentry, коли схема зійшлась", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    const captureMessage = vi.fn();
    await reportSchemaDriftAtBoot(fakePool(["001_a.sql"]), captureMessage);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  // Обсервабіліті не має права завалити бут — ні недоступною базою, ні
  // власним транспортом алерту.
  it("не кидає, коли база недоступна", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as never;
    await expect(reportSchemaDriftAtBoot(pool, vi.fn())).resolves.toBeNull();
    expect(getLastSchemaDriftReport()).toBeNull();
  });

  it("не кидає, коли падає сам транспорт алерту", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql", "002_b.sql"]);
    const captureMessage = vi.fn(() => {
      throw new Error("sentry down");
    });
    await expect(
      reportSchemaDriftAtBoot(fakePool([]), captureMessage),
    ).resolves.toMatchObject({ inSync: false });
  });
});

describe("стан стартової перевірки", () => {
  it("починає з idle і переходить у done після успіху", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    expect(getSchemaDriftCheckState()).toBe("idle");
    await reportSchemaDriftAtBoot(fakePool(["001_a.sql"]), vi.fn());
    expect(getSchemaDriftCheckState()).toBe("done");
  });

  it("переходить у failed, коли база недоступна", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as never;
    await reportSchemaDriftAtBoot(pool, vi.fn());
    expect(getSchemaDriftCheckState()).toBe("failed");
  });

  // Ключове вікно: між `app.listen` і резолвом запиту в `schema_migrations`
  // звіту ще немає. Якби цей стан читався як «дрейфу немає», увімкнений гейт
  // пропустив би трафік на контейнер із неперевіреною схемою.
  it("тримає стан checking, поки запит не завершився", async () => {
    listShippedMigrationsMock.mockResolvedValue(["001_a.sql"]);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pool = {
      query: vi.fn(async (sql: string) => {
        await gate;
        if (sql.includes("to_regclass")) return { rows: [{ reg: null }] };
        return { rows: [] };
      }),
    } as never;

    const inFlight = reportSchemaDriftAtBoot(pool, vi.fn());
    expect(getSchemaDriftCheckState()).toBe("checking");
    expect(getLastSchemaDriftReport()).toBeNull();

    release?.();
    await inFlight;
    expect(getSchemaDriftCheckState()).toBe("done");
  });

  it("markSchemaDriftCheckStarted виставляє checking синхронно", () => {
    expect(getSchemaDriftCheckState()).toBe("idle");
    markSchemaDriftCheckStarted();
    expect(getSchemaDriftCheckState()).toBe("checking");
  });
});

describe("driftBlocksReadiness", () => {
  // Дефолт свідомо неблокуючий: хибне спрацювання коштувало б повного
  // простою (Coolify відкотив би справний деплой).
  it("за замовчуванням не блокує readiness", () => {
    expect(driftBlocksReadiness()).toBe(false);
  });

  it("вмикається лише явним true", () => {
    process.env["MIGRATION_DRIFT_BLOCKS_READINESS"] = "true";
    expect(driftBlocksReadiness()).toBe(true);
    process.env["MIGRATION_DRIFT_BLOCKS_READINESS"] = "1";
    expect(driftBlocksReadiness()).toBe(false);
  });
});
