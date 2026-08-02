import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../push/send.js", () => ({ sendToUserQuietly: vi.fn() }));
vi.mock("../../obs/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serializeError: (e: unknown) => String(e),
}));

import {
  NUDGE_NEUTRAL_BODY,
  NUDGE_TITLE,
  buildNudgeBody,
  isQuietHour,
  runSergeantNudgeSweep,
  selectNudgeCandidates,
  type NudgeCandidate,
} from "./nudge.js";

/**
 * Довільна фіксована точка відліку: середа, 09:00 за Києвом (літній час,
 * UTC+3). Усі кейси рахуються від неї, щоб «доба відсутності» була явною
 * арифметикою, а не залежала від дня прогону.
 */
const NOON_KYIV = new Date("2026-08-05T06:00:00.000Z"); // 09:00 Kyiv
const DAY_MS = 24 * 60 * 60_000;

function daysAgo(n: number): Date {
  return new Date(NOON_KYIV.getTime() - n * DAY_MS);
}

function candidate(over: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    userId: "u1",
    lastSeenAt: daysAgo(2),
    cachedBody: "Цього тижня ти витратив менше на каву.",
    cachedGeneratedAt: new Date(NOON_KYIV.getTime() - 12 * 60 * 60_000),
    ...over,
  };
}

/** Мінімальний фейк `pg` — повертає підготовлені рядки, лічить INSERT-и. */
function makeDb(rows: Record<string, unknown>[]) {
  const claimed = new Set<string>();
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO push_reminder_log")) {
      const key = `${String(params?.[0])}|${String(params?.[1])}`;
      if (claimed.has(key)) return { rows: [], rowCount: 0 };
      claimed.add(key);
      return { rows: [], rowCount: 1 };
    }
    return { rows, rowCount: rows.length };
  });
  return { db: { query }, query };
}

describe("isQuietHour", () => {
  it("дозволяє ранковий слот і глушить ніч", () => {
    expect(isQuietHour(NOON_KYIV)).toBe(false); // 09:00 Kyiv
    expect(isQuietHour(new Date("2026-08-05T20:30:00.000Z"))).toBe(true); // 23:30
    expect(isQuietHour(new Date("2026-08-05T00:30:00.000Z"))).toBe(true); // 03:30
    expect(isQuietHour(new Date("2026-08-05T04:59:00.000Z"))).toBe(true); // 07:59
    expect(isQuietHour(new Date("2026-08-05T05:00:00.000Z"))).toBe(false); // 08:00
  });
});

describe("buildNudgeBody", () => {
  it("шле свіжу консерву як є", () => {
    expect(buildNudgeBody(candidate(), NOON_KYIV)).toBe(
      "Цього тижня ти витратив менше на каву.",
    );
  });

  it("викидає текст, старший за 48 годин", () => {
    const stale = candidate({ cachedGeneratedAt: daysAgo(10) });
    expect(buildNudgeBody(stale, NOON_KYIV)).toBe(NUDGE_NEUTRAL_BODY);
  });

  it("падає у нейтральну копію, коли консерви немає", () => {
    const empty = candidate({ cachedBody: null, cachedGeneratedAt: null });
    expect(buildNudgeBody(empty, NOON_KYIV)).toBe(NUDGE_NEUTRAL_BODY);
  });

  it("трактує пробільний текст як відсутній", () => {
    expect(buildNudgeBody(candidate({ cachedBody: "   " }), NOON_KYIV)).toBe(
      NUDGE_NEUTRAL_BODY,
    );
  });
});

describe("selectNudgeCandidates", () => {
  const row = (lastSeenDaysAgo: number) => ({
    user_id: `u${lastSeenDaysAgo}`,
    last_seen_at: daysAgo(lastSeenDaysAgo),
    cached_body: null,
    cached_generated_at: null,
  });

  it("будить лише на 2, 4 і 7 добу відсутності", async () => {
    const { db } = makeDb([1, 2, 3, 4, 5, 6, 7, 8, 12].map(row));
    const picked = await selectNudgeCandidates(db, NOON_KYIV);
    expect(picked.map((c) => c.userId).sort()).toEqual(["u2", "u4", "u7"]);
  });

  it("мовчить у першу добу відсутності", async () => {
    const { db } = makeDb([row(1)]);
    expect(await selectNudgeCandidates(db, NOON_KYIV)).toHaveLength(0);
  });

  it("замовкає після сьомої доби", async () => {
    const { db } = makeDb([row(8), row(30)]);
    expect(await selectNudgeCandidates(db, NOON_KYIV)).toHaveLength(0);
  });
});

describe("runSergeantNudgeSweep", () => {
  beforeEach(() => vi.clearAllMocks());

  const eligible = [
    {
      user_id: "u1",
      last_seen_at: daysAgo(2),
      cached_body: "Порада дня.",
      cached_generated_at: new Date(NOON_KYIV.getTime() - 3600_000),
    },
  ];

  it("надсилає рівно один пуш зі стабільним tag", async () => {
    const { db } = makeDb(eligible);
    const send = vi.fn(async () => {});
    const summary = await runSergeantNudgeSweep(db, { now: NOON_KYIV, send });

    expect(summary).toEqual({
      candidates: 1,
      sent: 1,
      skippedQuietHours: false,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("u1", {
      title: NUDGE_TITLE,
      body: "Порада дня.",
      tag: "sergeant-nudge-2026-08-05",
      url: "/",
    });
  });

  it("два проходи за ту саму добу шлють один пуш", async () => {
    const { db } = makeDb(eligible);
    const send = vi.fn(async () => {});
    await runSergeantNudgeSweep(db, { now: NOON_KYIV, send });
    await runSergeantNudgeSweep(db, { now: NOON_KYIV, send });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("у тихі години не шле нічого і не чіпає БД", async () => {
    const { db, query } = makeDb(eligible);
    const send = vi.fn(async () => {});
    const summary = await runSergeantNudgeSweep(db, {
      now: new Date("2026-08-05T20:30:00.000Z"), // 23:30 Kyiv
      send,
    });

    expect(summary.skippedQuietHours).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("збій відправки не зриває решту проходу", async () => {
    const { db } = makeDb([
      ...eligible,
      {
        user_id: "u2",
        last_seen_at: daysAgo(4),
        cached_body: null,
        cached_generated_at: null,
      },
    ]);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("push upstream 500"))
      .mockResolvedValueOnce(undefined);

    const summary = await runSergeantNudgeSweep(db, { now: NOON_KYIV, send });

    expect(send).toHaveBeenCalledTimes(2);
    expect(summary.sent).toBe(1);
  });
});
