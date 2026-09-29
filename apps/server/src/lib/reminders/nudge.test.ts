import { describe, expect, it, vi } from "vitest";

import {
  NUDGE_AT_HM,
  NUDGE_NEUTRAL_BODY,
  NUDGE_TITLE,
  buildNudgeBody,
  nudgeReason,
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

/** Мінімальний фейк `pg`: повертає підготовлені рядки. */
function makeDb(rows: Record<string, unknown>[]) {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  return { db: { query }, query };
}

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

describe("nudgeReason", () => {
  it("стає приводом о 09:00 зі стабільним tag доби", () => {
    const reason = nudgeReason(
      candidate({ cachedBody: "Порада дня." }),
      "2026-08-05",
      NOON_KYIV,
    );
    expect(reason).toMatchObject({
      userId: "u1",
      module: "sergeant",
      dedupKey: "sergeant-nudge-2026-08-05",
      title: NUDGE_TITLE,
      body: "Порада дня.",
      url: "/",
      at: NUDGE_AT_HM,
    });
  });
});
