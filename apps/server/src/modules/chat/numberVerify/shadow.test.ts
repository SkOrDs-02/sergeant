/**
 * Тіньовий режим верифікації чисел (ADR-0097): метрики, лог без чисел,
 * режим `off`, поведінка `enforce` до PR3, парсинг `CHAT_NUMBER_VERIFY`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock("../../../obs/logger.js", () => ({
  logger: {
    warn: warnMock,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

import {
  chatNumberHoldMs,
  chatNumberTokensTotal,
  chatNumberVerifyTotal,
} from "../../../obs/metrics.js";
import { realCase } from "./fixtures/index.js";
import { effectiveNumberVerifyMode, shadowVerifyNumbers } from "./shadow.js";

async function series(counter: {
  get(): Promise<{
    values: Array<{ value: number; labels: Record<string, unknown> }>;
  }>;
}): Promise<Array<[Record<string, unknown>, number]>> {
  const { values } = await counter.get();
  return values.map((v) => [v.labels, v.value]);
}

const verifyTotals = async () => series(chatNumberVerifyTotal);
const tokenTotals = async () => series(chatNumberTokensTotal);

beforeEach(() => {
  warnMock.mockReset();
  chatNumberVerifyTotal.reset();
  chatNumberTokensTotal.reset();
  chatNumberHoldMs.reset();
});

describe("effectiveNumberVerifyMode", () => {
  it("off лишається off, shadow лишається shadow", () => {
    expect(effectiveNumberVerifyMode("off")).toBe("off");
    expect(effectiveNumberVerifyMode("shadow")).toBe("shadow");
  });

  it("enforce до PR3 серії поводиться як shadow", () => {
    expect(effectiveNumberVerifyMode("enforce")).toBe("shadow");
  });
});

describe("shadowVerifyNumbers: метрики", () => {
  it("відповідь з усіма поясненими числами: outcome ok, токени за поясненістю", async () => {
    const c = realCase("eval-L2635");
    shadowVerifyNumbers(
      { turn: "first", model: "m", answer: c.answer, given: c.given },
      "shadow",
    );
    expect(await verifyTotals()).toEqual([
      [{ turn: "first", mode: "shadow", outcome: "ok" }, 1],
    ]);
    const tokens = Object.fromEntries(
      (await tokenTotals()).map(([l, v]) => [
        `${l["kind"]}/${l["explained"]}`,
        v,
      ]),
    );
    // 6 дослівних (5 категорій + дохід), 3 виведені (сума, залишок, їжа).
    expect(tokens).toEqual({ "money/given": 6, "money/derived": 3 });
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("справжня помилка в сумі: outcome mismatch, один токен none", async () => {
    const c = realCase("eval-L3765");
    shadowVerifyNumbers(
      { turn: "synthesis", model: "m", answer: c.answer, given: c.given },
      "shadow",
    );
    expect(await verifyTotals()).toEqual([
      [{ turn: "synthesis", mode: "shadow", outcome: "mismatch" }, 1],
    ]);
    const tokens = Object.fromEntries(
      (await tokenTotals()).map(([l, v]) => [
        `${l["kind"]}/${l["explained"]}`,
        v,
      ]),
    );
    expect(tokens).toEqual({ "money/given": 4, "money/none": 1 });
  });

  it("відповідь без перевірюваних чисел: no_scoped, дрібні числа лише рахуються", async () => {
    shadowVerifyNumbers(
      {
        turn: "first",
        model: "m",
        answer: "Це 56% із 8 транзакцій, остання на 95 грн.",
        given: { contexts: ["дані"] },
      },
      "shadow",
    );
    expect(await verifyTotals()).toEqual([
      [{ turn: "first", mode: "shadow", outcome: "no_scoped" }, 1],
    ]);
    expect(await tokenTotals()).toEqual([
      [{ kind: "unscoped", explained: "na" }, 3],
    ]);
  });

  it("час звірки йде у chat_number_hold_ms по ходу", async () => {
    const c = realCase("eval-L2635");
    shadowVerifyNumbers(
      { turn: "first", model: "m", answer: c.answer, given: c.given },
      "shadow",
    );
    const { values } = await chatNumberHoldMs.get();
    const count = values.find(
      (v) =>
        v.metricName === "chat_number_hold_ms_count" &&
        v.labels["turn"] === "first",
    );
    expect(count?.value).toBe(1);
  });

  it("enforce рахується як shadow: мітка mode несе виконаний режим", async () => {
    const c = realCase("eval-L3765");
    shadowVerifyNumbers(
      { turn: "first", model: "m", answer: c.answer, given: c.given },
      "enforce",
    );
    const labels = (await verifyTotals()).map(([l]) => l["mode"]);
    expect(labels).toEqual(["shadow"]);
  });
});

describe("shadowVerifyNumbers: off не робить нічого", () => {
  it("не збирає подане, не рахує, не логує", async () => {
    const given = vi.fn(() => ({ contexts: ["борг 5200 грн"] }));
    shadowVerifyNumbers(
      { turn: "first", model: "m", answer: "Борг 9999 грн", given },
      "off",
    );
    expect(given).not.toHaveBeenCalled();
    expect(await verifyTotals()).toEqual([]);
    expect(await tokenTotals()).toEqual([]);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("порожня відповідь теж нічого не рахує", async () => {
    const given = vi.fn(() => ({}));
    shadowVerifyNumbers(
      { turn: "first", model: "m", answer: "  \n", given },
      "shadow",
    );
    expect(given).not.toHaveBeenCalled();
    expect(await verifyTotals()).toEqual([]);
  });
});

describe("shadowVerifyNumbers: лог без чисел і тексту", () => {
  it("розбіжність пише один warn лише з ходом, моделлю й видами", () => {
    const c = realCase("eval-L3765");
    shadowVerifyNumbers(
      {
        turn: "synthesis",
        model: "z-ai/glm-5.2",
        answer: c.answer,
        given: c.given,
      },
      "shadow",
    );
    expect(warnMock).toHaveBeenCalledTimes(1);
    const entry = warnMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry).toEqual({
      msg: "chat_number_mismatch",
      turn: "synthesis",
      model: "z-ai/glm-5.2",
      kinds: ["money"],
    });
    // Жодного числа чи слова з відповіді або поданого.
    const serialized = JSON.stringify(warnMock.mock.calls);
    expect(serialized).not.toMatch(/45050|47050|12000|34000|оренда|спортзал/i);
  });

  it("ok-відповідь нічого не логує", () => {
    const c = realCase("eval-L2635");
    shadowVerifyNumbers(
      { turn: "first", model: "m", answer: c.answer, given: c.given },
      "shadow",
    );
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("збій звірки: лічильник error, лог без тексту винятку, виняток не виходить", async () => {
    const secret = "Борг 7777 грн у Олега";
    expect(() =>
      shadowVerifyNumbers(
        {
          turn: "first",
          model: "m",
          answer: "Борг 7777 грн",
          given: () => {
            throw new TypeError(secret);
          },
        },
        "shadow",
      ),
    ).not.toThrow();
    expect(await verifyTotals()).toEqual([
      [{ turn: "first", mode: "shadow", outcome: "error" }, 1],
    ]);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0]![0]).toEqual({
      msg: "chat_number_verify_failed",
      turn: "first",
      model: "m",
      reason: "TypeError",
    });
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain("7777");
  });
});

describe("CHAT_NUMBER_VERIFY: парсинг змінної оточення", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function parsed(value: string | undefined) {
    vi.stubEnv("CHAT_NUMBER_VERIFY", value);
    vi.resetModules();
    return (await import("../../../env/env.js")).env.CHAT_NUMBER_VERIFY;
  }

  it("незадана й порожня змінна дають shadow", async () => {
    expect(await parsed(undefined)).toBe("shadow");
    expect(await parsed("")).toBe("shadow");
    expect(await parsed("   ")).toBe("shadow");
  });

  it("приймає off, shadow, enforce; регістр і пробіли не важливі", async () => {
    expect(await parsed("off")).toBe("off");
    expect(await parsed("shadow")).toBe("shadow");
    expect(await parsed("enforce")).toBe("enforce");
    expect(await parsed(" Enforce ")).toBe("enforce");
    expect(await parsed("OFF")).toBe("off");
  });

  it("будь-що інше валить старт, а не вгадується", async () => {
    vi.stubEnv("CHAT_NUMBER_VERIFY", "of");
    vi.resetModules();
    await expect(import("../../../env/env.js")).rejects.toThrow(
      /CHAT_NUMBER_VERIFY/,
    );
  });

  it("у юніт-прогоні vitest.config вимикає звірку, щоб чужі чат-тести не залежали від неї", async () => {
    const { env } = await import("../../../env/env.js");
    expect(env.CHAT_NUMBER_VERIFY).toBe("off");
  });
});
