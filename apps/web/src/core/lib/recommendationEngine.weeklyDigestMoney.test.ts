// @vitest-environment jsdom
/**
 * Гроші в понеділковій картці «Підсумок минулого тижня» (`weekly_digest_*`) —
 * за київськими добами (рішення власника 2026-10-01, `METRICS_VERSION` 17;
 * ADR-0078). Тиждень називає понеділок пристрою (той самий ключ у id картки,
 * звички й тренування в ній — за годинником телефона), а до його семи дат
 * гроші відносить КИЇВСЬКИЙ день транзакції — так само рахує тижневий
 * дайджест, тож «витрати N ₴» тут збігаються з його підсумком.
 *
 * Пояс пристрою перемикається прямо в тесті (Node перечитує `process.env.TZ` на
 * льоту); «зараз» — понеділок 09:00 ЗА ЧАСОМ ПРИСТРОЮ (локальний конструктор
 * після перемикання поясу), щоб пройти вікно показу 07:00–12:00.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFinykSqliteCache } from "@finyk/lib/sqliteReader";
import { generateRecommendations } from "./recommendationEngine";

const mockMirrorTxs: Array<Record<string, unknown>> = [];
vi.mock("../../modules/finyk/lib/monoMirrorReader", () => {
  const state = () => ({
    transactions: mockMirrorTxs,
    accounts: [],
    refreshedAt: mockMirrorTxs.length > 0 ? new Date().toISOString() : null,
  });
  return {
    getCachedFinykMonoMirrorState: state,
    getVisibleFinykMonoMirrorState: state,
  };
});

const ORIGINAL_TZ = process.env["TZ"];

/** Київ — еталон; решта — пристрої на різних боках від нього. */
const DEVICE_TZS = [
  "Europe/Kyiv",
  "UTC",
  "America/New_York", // позаду Києва на 7 год
  "Asia/Tokyo", // попереду на 6 год
] as const;

const sec = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

// Минулий тиждень — 20–26 квітня 2026; київські межі [19.04 21:00Z, 26.04
// 21:00Z) (квітень: Київ = UTC+3).
const TXS = [
  // Нд 19.04 23:30 Київ — ще позаминулий тиждень. У Токіо (пн 00:00 JST =
  // 19.04 15:00Z) стара межа брала її в минулий.
  { id: "before", amount: -11_100, time: sec("2026-04-19T20:30:00Z") },
  { id: "mid", amount: -30_000, time: sec("2026-04-22T12:00:00Z") },
  // Нд 26.04 23:30 Київ — минулий тиждень. У Токіо (кінець вікна = 26.04
  // 15:00Z) стара межа її губила.
  { id: "sun-late", amount: -22_200, time: sec("2026-04-26T20:30:00Z") },
  // Пн 27.04 00:30 Київ — уже ЦЕЙ тиждень. У Нью-Йорку (кінець вікна =
  // 27.04 04:00Z) стара межа брала її в минулий.
  { id: "mon-after", amount: -44_400, time: sec("2026-04-26T21:30:00Z") },
];

function digestBodyOn(tz: string): string | undefined {
  process.env["TZ"] = tz;
  vi.setSystemTime(new Date(2026, 3, 27, 9, 0, 0, 0)); // пн 09:00 за пристроєм
  const digest = generateRecommendations().find((r) =>
    r.id?.startsWith("weekly_digest_"),
  );
  return digest?.body;
}

describe("weekly_digest_*: «витрати минулого тижня» — пн–нд за Києвом", () => {
  beforeEach(() => {
    localStorage.clear();
    clearFinykSqliteCache();
    mockMirrorTxs.length = 0;
    mockMirrorTxs.push(...TXS);
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    mockMirrorTxs.length = 0;
    if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
    else process.env["TZ"] = ORIGINAL_TZ;
  });

  it.each(DEVICE_TZS)(
    "пристрій %s: 300 + 222 = 522 ₴ (нд 19.04 23:30 і пн 27.04 00:30 за Києвом — сусідні тижні)",
    (tz) => {
      const body = digestBodyOn(tz);
      expect(body, `пояс пристрою: ${tz}`).toContain("витрати 522 ₴");
    },
  );
});
