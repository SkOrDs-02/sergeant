/**
 * Юніт-тести push Фініка (Ф-4 (б)): гейт, тексти, час проходу, тригер синку.
 * Поведінку з базою (дедуп, стеля, перегони) тримає
 * `finykPush.integration.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../push/send.js", () => ({
  sendToUserQuietly: vi.fn(),
}));

import { userClockFromRow } from "../../../lib/reminders/userClock.js";
import { finykLimitPushNeeded } from "../../sync/finyk/limitPushTrigger.js";
import { finykLimitGateOutcome, type FinykPushGate } from "./gate.js";
import { finykDueAtHm, finykQuietEndHm, isDueThisMinute } from "./sweep.js";
import {
  FINYK_PLANNING_URL,
  buildFinykDuePush,
  buildFinykLimitPush,
} from "./texts.js";

// 2026-11-19 12:00 за Києвом (UTC+2).
const NOON_KYIV = new Date("2026-11-19T10:00:00.000Z");
// 2026-11-19 23:30 за Києвом: у дефолтних тихих годинах 22:00-08:00.
const NIGHT_KYIV = new Date("2026-11-19T21:30:00.000Z");

const LIMIT = {
  id: "b1",
  type: "limit" as const,
  categoryId: "food",
  limit: 1000,
  period: "month" as const,
};

function gate(over: Partial<FinykPushGate> = {}): FinykPushGate {
  return {
    enabled: true,
    hasTarget: true,
    clock: userClockFromRow(undefined, NOON_KYIV, null),
    budgets: [LIMIT],
    ...over,
  };
}

describe("finykLimitGateOutcome", () => {
  it("ok, коли тумблер увімкнений, є куди слати й місячний ліміт", () => {
    expect(finykLimitGateOutcome(gate())).toBe("ok");
  });

  it("тумблер вимкнено: disabled раніше за все інше", () => {
    expect(
      finykLimitGateOutcome(gate({ enabled: false, hasTarget: false })),
    ).toBe("disabled");
  });

  it("немає підписки чи пристрою: no_target", () => {
    expect(finykLimitGateOutcome(gate({ hasTarget: false }))).toBe("no_target");
  });

  it("разовий ліміт push не отримує: no_limits", () => {
    expect(
      finykLimitGateOutcome(
        gate({ budgets: [{ ...LIMIT, period: "one_time" }] }),
      ),
    ).toBe("no_limits");
    expect(finykLimitGateOutcome(gate({ budgets: [] }))).toBe("no_limits");
  });

  it("тиха година відкладає, а не скасовує", () => {
    expect(
      finykLimitGateOutcome(
        gate({ clock: userClockFromRow(undefined, NIGHT_KYIV, null) }),
      ),
    ).toBe("quiet_deferred");
  });

  it("вимкнені тихі години вночі не гейтять", () => {
    const clock = userClockFromRow(
      { user_id: "u", quiet_hours_enabled: false },
      NIGHT_KYIV,
      null,
    );
    expect(finykLimitGateOutcome(gate({ clock }))).toBe("ok");
  });
});

describe("тексти push", () => {
  it("80 %: «майже вичерпано», суми й відсоток, Планування", () => {
    const p = buildFinykLimitPush({
      budgetId: "b1",
      label: "Продукти",
      threshold: 80,
      spentMinor: 85_000,
      limitMinor: 100_000,
      pctRaw: 85,
      periodKey: "2026-11",
    });
    expect(p.title).toBe("Ліміт «Продукти» майже вичерпано");
    expect(p.body).toBe("850 ₴ з 1 000 ₴, 85% використано");
    expect(p.url).toBe(FINYK_PLANNING_URL);
    expect(p.tag).toBe("finyk-limit-b1-2026-11");
  });

  it("100 %: «перевищено», той самий тег, що й 80 %", () => {
    const p = buildFinykLimitPush({
      budgetId: "b1",
      label: "Продукти",
      threshold: 100,
      spentMinor: 105_000,
      limitMinor: 100_000,
      pctRaw: 105,
      periodKey: "2026-11",
    });
    expect(p.title).toBe("Ліміт «Продукти» перевищено");
    expect(p.tag).toBe("finyk-limit-b1-2026-11");
  });

  it("один платіж: назва в заголовку, невідома сума чесно", () => {
    const one = buildFinykDuePush(
      [
        {
          flowId: "sub-1",
          kind: "subscription",
          name: "Netflix",
          amountMinor: 29_900,
          currency: "₴",
          dueDayKey: "2026-11-20",
        },
      ],
      "2026-11-20",
    );
    expect(one.title).toBe("Завтра спишеться «Netflix»");
    expect(one.body).toBe("Сума 299 ₴");
    expect(one.url).toBe(FINYK_PLANNING_URL);

    const unknown = buildFinykDuePush(
      [
        {
          flowId: "debt-1",
          kind: "debt",
          name: null,
          amountMinor: null,
          currency: "₴",
          dueDayKey: "2026-11-20",
        },
      ],
      "2026-11-20",
    );
    expect(unknown.title).toBe("Завтра спишеться «Борг»");
    expect(unknown.body).toBe("Сума поки невідома");
  });

  it("кілька платежів: кількість із плюралем, перші три й «ще N»", () => {
    const charges = ["A", "B", "C", "D"].map((name, i) => ({
      flowId: `sub-${i}`,
      kind: "subscription" as const,
      name,
      amountMinor: 10_000,
      currency: "₴",
      dueDayKey: "2026-11-20",
    }));
    const p = buildFinykDuePush(charges, "2026-11-20");
    expect(p.title).toBe("Завтра спишеться 4 платежі");
    expect(p.body).toBe("«A» 100 ₴, «B» 100 ₴, «C» 100 ₴, ще 1");
    expect(buildFinykDuePush(charges.slice(0, 2), "x").title).toBe(
      "Завтра спишеться 2 платежі",
    );
  });
});

describe("час проходу", () => {
  it("«завтра спишеться» о 09:00, у тихих годинах на їх кінці", () => {
    expect(finykDueAtHm({ quiet: null })).toBe("09:00");
    expect(finykDueAtHm({ quiet: { startMin: 1320, endMin: 480 } })).toBe(
      "09:00",
    );
    expect(finykDueAtHm({ quiet: { startMin: 1320, endMin: 600 } })).toBe(
      "10:00",
    );
  });

  it("досилання порогів лише за увімкнених тихих годин", () => {
    expect(finykQuietEndHm({ quiet: null })).toBeNull();
    expect(finykQuietEndHm({ quiet: { startMin: 1320, endMin: 480 } })).toBe(
      "08:00",
    );
  });

  it("хвилина збігається або наздоганяється, але не повторюється", () => {
    expect(isDueThisMinute("09:00", { hm: "09:00", fromHm: "08:59" })).toBe(
      true,
    );
    expect(isDueThisMinute("09:00", { hm: "09:03", fromHm: "08:58" })).toBe(
      true,
    );
    expect(isDueThisMinute("09:00", { hm: "09:01", fromHm: "09:00" })).toBe(
      false,
    );
  });
});

describe("finykLimitPushNeeded", () => {
  it("ручні записи, категорії й спліти перераховують; видалення запису ні", () => {
    expect(
      finykLimitPushNeeded([{ table: "finyk_manual_expenses", op: "upsert" }]),
    ).toBe(true);
    expect(
      finykLimitPushNeeded([{ table: "finyk_tx_categories", op: "delete" }]),
    ).toBe(true);
    expect(
      finykLimitPushNeeded([{ table: "finyk_manual_expenses", op: "delete" }]),
    ).toBe(false);
    expect(
      finykLimitPushNeeded([{ table: "routine_habits", op: "upsert" }]),
    ).toBe(false);
  });
});
