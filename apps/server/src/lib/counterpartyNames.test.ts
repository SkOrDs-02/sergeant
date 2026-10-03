import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тестовий plan:
 *   1. Кеш віддає TTL-попадання без повторного запиту в БД.
 *   2. Прострочений запис не віддається і знімається з `Map`.
 *   3. Розмір кешу НЕ росте понад стелю — це суть фіксу.
 *   4. Fail-open при недоступній базі зберігається.
 *
 * Чому пункт 3 важливий: TTL сам собою пам'ять не звільняє. Запис із
 * простроченим `expiresAt` лежав у `Map` доти, доки той самий `userId` не
 * прийде знову — sweep-у тут немає. На гарячому шляху чату це монотонне
 * зростання з кожним новим користувачем, тобто OOM на 4 ГБ VPS.
 */

const { poolMock, loggerMock, normalizeKnownValuesMock } = vi.hoisted(() => ({
  poolMock: { query: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  // Нормалізацію не тестуємо тут — вона має власний сьют у `llmRedaction`.
  normalizeKnownValuesMock: vi.fn((v: (string | null)[]) =>
    v.filter((x): x is string => typeof x === "string"),
  ),
}));

vi.mock("../db.js", () => ({ default: poolMock, pool: poolMock }));
vi.mock("../obs/logger.js", () => ({ logger: loggerMock }));
vi.mock("./llmRedaction.js", () => ({
  normalizeKnownValues: normalizeKnownValuesMock,
}));

const {
  getCounterpartyNames,
  __resetCounterpartyNamesCache,
  __counterpartyNamesCacheSize,
} = await import("./counterpartyNames.js");

beforeEach(() => {
  poolMock.query.mockReset();
  loggerMock.warn.mockReset();
  __resetCounterpartyNamesCache();
  vi.useRealTimers();
});

describe("getCounterpartyNames", () => {
  it("serves a fresh entry from cache without hitting the DB twice", async () => {
    poolMock.query.mockResolvedValue({ rows: [{ counter_name: "Петро" }] });

    expect(await getCounterpartyNames("u1")).toEqual(["Петро"]);
    expect(await getCounterpartyNames("u1")).toEqual(["Петро"]);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list for a missing user id without querying", async () => {
    expect(await getCounterpartyNames(null)).toEqual([]);
    expect(await getCounterpartyNames(undefined)).toEqual([]);
    expect(await getCounterpartyNames("")).toEqual([]);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it("refetches and drops the row once the TTL expires", async () => {
    vi.useFakeTimers();
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ counter_name: "Стара" }] })
      .mockResolvedValueOnce({ rows: [{ counter_name: "Нова" }] });

    expect(await getCounterpartyNames("u1")).toEqual(["Стара"]);
    // TTL — 5 хвилин; перескакуємо його з запасом.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await getCounterpartyNames("u1")).toEqual(["Нова"]);
    expect(poolMock.query).toHaveBeenCalledTimes(2);
  });

  it("caps the cache instead of growing once per user forever", async () => {
    poolMock.query.mockResolvedValue({ rows: [{ counter_name: "X" }] });

    // 600 різних користувачів при стелі 500. До фіксу тут лишалось би 600 —
    // і далі стільки, скільки людей колись відкривали чат.
    for (let i = 0; i < 600; i++) {
      await getCounterpartyNames(`user_${i}`);
    }

    expect(__counterpartyNamesCacheSize()).toBeLessThanOrEqual(500);
  });

  it("evicts the oldest insertion, keeping the newest users", async () => {
    poolMock.query.mockResolvedValue({ rows: [{ counter_name: "X" }] });
    for (let i = 0; i < 600; i++) {
      await getCounterpartyNames(`user_${i}`);
    }

    poolMock.query.mockClear();
    // Найсвіжіший користувач мусить лишитись у кеші — запиту в БД не буде.
    await getCounterpartyNames("user_599");
    expect(poolMock.query).not.toHaveBeenCalled();

    // Найстаріший — витіснений, тож його читання знову йде в БД.
    await getCounterpartyNames("user_0");
    expect(poolMock.query).toHaveBeenCalledTimes(1);
  });

  it("stays fail-open and does not cache a failure", async () => {
    poolMock.query
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ rows: [{ counter_name: "Петро" }] });

    // Обвалити розмову через недоступний список маскування було б гірше за
    // один незамаскований тур — але факт мусить бути видимим у логах.
    expect(await getCounterpartyNames("u1")).toEqual([]);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "counterparty_names_lookup_failed" }),
    );

    // Провал не кешується: наступний виклик пробує знову.
    expect(await getCounterpartyNames("u1")).toEqual(["Петро"]);
  });
});
