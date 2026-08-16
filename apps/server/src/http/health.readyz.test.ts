import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * Гарантія gated-readiness (review 2026-08-16).
 *
 * `MIGRATION_DRIFT_BLOCKS_READINESS=true` має означати «не пускати трафік,
 * поки схема не звірена». Найтонше місце — не сам дрейф, а вікно ДО того, як
 * перевірка завершилась: якщо трактувати «ще не знаємо» як «все добре», гейт
 * пропустить рівно той деплой, який мав відсіяти.
 */

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../obs/logger.js", () => ({ logger: loggerMock }));

// Решта health-модуля тягне Redis, circuit breaker-и й воркери — для readyz
// вони не потрібні, тож заглушаємо, щоб тест лишався юнітом.
vi.mock("../lib/redis.js", () => ({
  getRedisStats: () => ({ connected: true, reconnectAttempts: 0 }),
  pingRedis: async () => true,
}));
// `db.js` створює pg-Pool на етапі eval модуля, тож справжній імпорт тут
// небажаний. Але заглушка мусить віддавати і те, що читає `schemaDrift`:
// інакше звірка тихо падає у `failed`, і тест «зеленіє після звірки» проходив
// би зовсім іншим шляхом, ніж перевіряє.
vi.mock("../db.js", () => ({
  getPoolStats: () => ({}),
  MIGRATIONS_DIR: new URL("../migrations", import.meta.url).pathname,
  listShippedMigrations: async () => [],
}));
vi.mock("../lib/circuitBreaker.js", () => ({
  anthropicCircuitBreaker: { getStats: () => ({ state: "closed" }) },
}));
vi.mock("../modules/ai-memory/ingestQueue.js", () => ({
  getMemoryIngestWorkerStats: async () => ({}),
}));
vi.mock("../modules/mono/enrichmentWorker.js", () => ({
  getMonoEnrichmentWorkerStatus: async () => ({}),
}));

import { createReadyzHandler } from "./health.js";
import {
  markSchemaDriftCheckStarted,
  reportSchemaDriftAtBoot,
  __resetSchemaDriftCacheForTests,
} from "../lib/schemaDrift.js";

function fakeRes() {
  const res = {
    statusCode: 0,
    body: "",
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(payload: string) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: string };
}

const okPool = { query: async () => ({ rows: [{ reg: null }] }) };

async function callReadyz(pool = okPool) {
  const res = fakeRes();
  await createReadyzHandler(pool as never)({} as Request, res, () => {});
  return res;
}

beforeEach(() => {
  __resetSchemaDriftCacheForTests();
  loggerMock.error.mockReset();
  delete process.env["MIGRATION_DRIFT_BLOCKS_READINESS"];
});

afterEach(() => {
  delete process.env["MIGRATION_DRIFT_BLOCKS_READINESS"];
});

describe("createReadyzHandler — гейт дрейфу схеми", () => {
  it("з вимкненим гейтом лишається зеленим навіть до перевірки", async () => {
    markSchemaDriftCheckStarted();
    const res = await callReadyz();
    expect(res.statusCode).toBe(200);
  });

  it("з увімкненим гейтом віддає 503, поки перевірка не завершилась", async () => {
    process.env["MIGRATION_DRIFT_BLOCKS_READINESS"] = "true";
    markSchemaDriftCheckStarted();
    const res = await callReadyz();
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("unhealthy");
  });

  it("з увімкненим гейтом зеленіє після успішної звірки", async () => {
    process.env["MIGRATION_DRIFT_BLOCKS_READINESS"] = "true";
    // Порожній образ + порожня база: `to_regclass` віддає null, pending немає.
    // Каталог міграцій реальний, тож `migrationsDirMissing: false`.
    const report = await reportSchemaDriftAtBoot(okPool as never, vi.fn());
    // Пін на те, що ми пройшли саме успішним шляхом, а не через `failed`:
    // інакше тест зеленів би з протилежної причини.
    expect(report?.inSync).toBe(true);
    const res = await callReadyz();
    expect(res.statusCode).toBe(200);
  });

  // Свідоме рішення, а не недогляд. Перевірка виконується один раз на буті,
  // тож якби `failed` блокував, разовий мережевий збій у момент старту
  // назавжди лишив би контейнер не-ready і відкотив би цілком справний
  // деплой. Реально недоступну БД у цьому ж хендлері вже ловить `SELECT 1`.
  it("не блокує readiness, коли сама звірка не вдалась", async () => {
    process.env["MIGRATION_DRIFT_BLOCKS_READINESS"] = "true";
    const flakyPool = {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    await reportSchemaDriftAtBoot(flakyPool as never, vi.fn());
    const res = await callReadyz();
    expect(res.statusCode).toBe(200);
  });

  it("падає на 503, коли БД не відповідає, незалежно від гейта", async () => {
    const deadPool = {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    const res = await callReadyz(deadPool as never);
    expect(res.statusCode).toBe(503);
  });
});
