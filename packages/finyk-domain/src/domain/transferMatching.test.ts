import { describe, expect, it } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import type { Transaction } from "./types";
import {
  filterTransferSuggestions,
  findInternalTransferSuggestions,
  transferSuggestionPairKey,
} from "./transferMatching";

function tx(
  id: string,
  amount: number,
  accountId: string,
  time: number,
  description = "Переказ між картками",
  currencyCode = 980,
): Transaction {
  return {
    id,
    amount,
    time,
    date: new Date(time * 1000).toISOString(),
    description,
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "mono",
    accountId,
    manual: false,
    _source: "mono",
    _accountId: accountId,
    _manual: false,
    currencyCode,
  };
}

describe("findInternalTransferSuggestions", () => {
  it("finds an unambiguous opposite-sign pair between different own accounts", () => {
    const out = tx("out", -125_000, "black", 1_000);
    const incoming = tx("in", 125_000, "white", 1_060, "З картки на картку");

    expect(findInternalTransferSuggestions([out, incoming])).toEqual([
      {
        outgoing: out,
        incoming,
        amountMinor: 125_000,
        timeDeltaSeconds: 60,
      },
    ]);
  });

  it("does not guess from amount and time alone without a transfer marker", () => {
    const out = tx("out", -50_000, "black", 1_000, "Сільпо");
    const incoming = tx("in", 50_000, "white", 1_010, "Повернення товару");

    expect(findInternalTransferSuggestions([out, incoming])).toEqual([]);
  });

  it("rejects pairs on the same account, with different currency, or outside six hours", () => {
    const base = tx("out", -10_000, "black", 1_000);
    const sameAccount = tx("same", 10_000, "black", 1_010);
    const otherCurrency = tx(
      "currency",
      10_000,
      "white",
      1_020,
      "Переказ",
      840,
    );
    const tooLate = tx("late", 10_000, "white", 1_000 + 6 * 60 * 60 + 1);

    expect(
      findInternalTransferSuggestions([
        base,
        sameAccount,
        otherCurrency,
        tooLate,
      ]),
    ).toEqual([]);
  });

  it("never turns cashback, interest, or salary into a transfer suggestion", () => {
    const outgoing = tx("out", -20_000, "black", 1_000, "Переказ");

    for (const description of ["Кешбек", "Нарахування відсотків", "Зарплата"]) {
      expect(
        findInternalTransferSuggestions([
          outgoing,
          tx(`in-${description}`, 20_000, "white", 1_010, description),
        ]),
      ).toEqual([]);
    }
  });

  it("stays silent when one transaction has two equally plausible partners", () => {
    const outgoing = tx("out", -30_000, "black", 1_000, "Переказ");
    const first = tx("in-a", 30_000, "white", 1_100, "Переказ");
    const second = tx("in-b", 30_000, "jar", 900, "Переказ у банку");

    expect(findInternalTransferSuggestions([outgoing, first, second])).toEqual(
      [],
    );
  });

  it("can complete a half-marked pair but does not repeat a confirmed pair", () => {
    const outgoing = tx("out", -70_000, "black", 1_000);
    const incoming = tx("in", 70_000, "white", 1_020);

    expect(
      findInternalTransferSuggestions([outgoing, incoming], {
        txCategories: { out: INTERNAL_TRANSFER_ID },
      }),
    ).toHaveLength(1);
    expect(
      findInternalTransferSuggestions([outgoing, incoming], {
        txCategories: {
          out: INTERNAL_TRANSFER_ID,
          in: INTERNAL_TRANSFER_ID,
        },
      }),
    ).toEqual([]);
  });
});

describe("transferSuggestionPairKey", () => {
  it("joins outgoing and incoming ids with a colon", () => {
    const outgoing = tx("out", -10_000, "black", 1_000);
    const incoming = tx("in", 10_000, "white", 1_010);
    expect(transferSuggestionPairKey({ outgoing, incoming })).toBe("out:in");
  });
});

describe("filterTransferSuggestions", () => {
  const outgoing = tx("out", -10_000, "black", 1_000);
  const incoming = tx("in", 10_000, "white", 1_010);
  const suggestions = findInternalTransferSuggestions([outgoing, incoming]);

  it("keeps a suggestion with no reject/snooze state", () => {
    expect(
      filterTransferSuggestions(suggestions, { todayKey: "2026-06-15" }),
    ).toEqual(suggestions);
  });

  it("drops a permanently rejected pair regardless of the day key", () => {
    expect(
      filterTransferSuggestions(suggestions, {
        rejectedPairKeys: ["out:in"],
        todayKey: "2026-06-15",
      }),
    ).toEqual([]);
    expect(
      filterTransferSuggestions(suggestions, {
        rejectedPairKeys: new Set(["out:in"]),
        todayKey: "2099-01-01",
      }),
    ).toEqual([]);
  });

  it("drops a pair snoozed for today but keeps it once the day advances", () => {
    expect(
      filterTransferSuggestions(suggestions, {
        snoozedPairKeys: { "out:in": "2026-06-15" },
        todayKey: "2026-06-15",
      }),
    ).toEqual([]);
    expect(
      filterTransferSuggestions(suggestions, {
        snoozedPairKeys: { "out:in": "2026-06-15" },
        todayKey: "2026-06-16",
      }),
    ).toEqual(suggestions);
  });
});
