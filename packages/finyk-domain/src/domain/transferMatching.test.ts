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

describe("findInternalTransferSuggestions — real Monobank card↔jar phrasings", () => {
  // Виписка власника, одна доба: банка віддала на білу картку 400 і 700.
  // Рахунок ноги з банки в Mono не підписаний, а описи — «На білу картку» і
  // «Часткове зняття банки «просто»» — без слова «переказ».
  const base = 1_700_000_000;
  const jarToCard400 = tx("jar-400", -40_000, "jar-1", base, "На білу картку");
  const cardFromJar400 = tx(
    "card-400",
    40_000,
    "white",
    base + 4,
    "Часткове зняття банки «просто»",
  );
  const jarToCard700 = tx(
    "jar-700",
    -70_000,
    "jar-1",
    base + 3_600,
    "На білу картку",
  );
  const cardFromJar700 = tx(
    "card-700",
    70_000,
    "white",
    base + 3_605,
    "Часткове зняття банки «просто»",
  );

  it("pairs «На білу картку» with «Часткове зняття банки» (adjective before «картку», no preposition before «банки»)", () => {
    const result = findInternalTransferSuggestions([
      jarToCard400,
      cardFromJar400,
      jarToCard700,
      cardFromJar700,
    ]);

    expect(result.map((s) => `${s.outgoing.id}:${s.incoming.id}`)).toEqual([
      "jar-700:card-700",
      "jar-400:card-400",
    ]);
    expect(result.map((s) => s.amountMinor)).toEqual([70_000, 40_000]);
  });

  it("one phrase alone is enough: «На білу картку» against a neutral card leg", () => {
    const neutralLeg = tx(
      "card-neutral",
      40_000,
      "white",
      base + 4,
      "Надходження",
    );

    expect(
      findInternalTransferSuggestions([jarToCard400, neutralLeg]),
    ).toHaveLength(1);
  });

  it.each([
    "На білу картку",
    "На чорну картку",
    "З Чорної картки",
    "із білої картки",
    "На мою білу картку",
    "Часткове зняття банки «просто»",
    "Зняття банки",
    "Поповнення банки «на машину»",
    "Закриття банки",
  ])("treats «%s» as a transfer marker", (description) => {
    const out = tx("out", -10_000, "black", base, description);
    const incoming = tx("in", 10_000, "jar-9", base + 10, "Надходження");

    expect(findInternalTransferSuggestions([out, incoming])).toHaveLength(1);
  });

  it.each([
    "Сільпо",
    "Кава на вулицю",
    "Оплата з розрахунковим рахунком",
    "Зняття готівки",
    "Поповнення мобільного",
    "Поповнення «Київстар»",
    "Закриття кредиту",
  ])("does not treat «%s» as a transfer marker", (description) => {
    const out = tx("out", -10_000, "black", base, description);
    const incoming = tx("in", 10_000, "white", base + 10, "Надходження");

    expect(findInternalTransferSuggestions([out, incoming])).toEqual([]);
  });

  it("keeps every other guard for the extended phrases", () => {
    const candidates = [
      tx("same-account", 40_000, "jar-1", base + 4, "З білої картки"),
      tx("wrong-amount", 40_001, "white", base + 4, "З білої картки"),
      tx("same-sign", -40_000, "white", base + 4, "З білої картки"),
      tx("too-late", 40_000, "white", base + 6 * 60 * 60 + 1, "З білої картки"),
      tx("cashback", 40_000, "white", base + 4, "Кешбек на картку"),
    ];

    // По одному кандидату проти ноги з банки: кандидати між собою теж
    // утворювали б пари й маскували б, який саме запобіжник спрацював.
    for (const candidate of candidates) {
      expect(
        findInternalTransferSuggestions([jarToCard400, candidate]),
        candidate.id,
      ).toEqual([]);
    }
  });

  it("stays silent on a lone «Поповнення «На закриття боргів🙏»» without a matching leg", () => {
    const lone = tx(
      "lone",
      -7_235,
      "black",
      base,
      "Поповнення «На закриття боргів🙏»",
    );
    // Усі «сусіди» не збігаються з лоном хоча б одним запобіжником: інша
    // сума, той самий рахунок, той самий знак, поза шістьма годинами.
    const unrelated = [
      tx("other-1", 7_234, "white", base + 5, "Надходження"),
      tx("other-2", 7_235, "black", base + 5, "Надходження"),
      tx("other-3", -7_235, "white", base + 5, "Надходження"),
      tx("other-4", 7_235, "white", base + 8 * 60 * 60, "Надходження"),
      tx("other-jar", 5_000, "jar-1", base + 5, "Надходження"),
    ];

    expect(findInternalTransferSuggestions([lone])).toEqual([]);
    expect(findInternalTransferSuggestions([lone, ...unrelated])).toEqual([]);
    // Навіть якщо банка відома: без другої ноги нічого пропонувати.
    expect(
      findInternalTransferSuggestions([lone, ...unrelated], {
        jarAccountIds: ["jar-1"],
      }),
    ).toEqual([]);
  });

  describe("jarAccountIds", () => {
    // Жоден опис не несе маркера: єдиний доказ — що одна нога лежить на банці.
    const topUp = tx(
      "top-up",
      -7_235,
      "black",
      base,
      "Поповнення «На закриття боргів🙏»",
    );
    const jarLeg = tx("jar-leg", 7_235, "jar-1", base + 2, "Надходження");

    it("without the jar list neither description is a marker", () => {
      expect(findInternalTransferSuggestions([topUp, jarLeg])).toEqual([]);
    });

    it("counts a leg on a known jar as a marker (array or Set)", () => {
      for (const jarAccountIds of [["jar-1"], new Set(["jar-1"])]) {
        expect(
          findInternalTransferSuggestions([topUp, jarLeg], { jarAccountIds }),
        ).toEqual([
          {
            outgoing: topUp,
            incoming: jarLeg,
            amountMinor: 7_235,
            timeDeltaSeconds: 2,
          },
        ]);
      }
    });

    it("a jar id on its own never overrides the amount/sign/time guards", () => {
      const donation = tx("donation", 7_236, "jar-1", base + 2, "Надходження");
      const late = tx(
        "late",
        7_235,
        "jar-1",
        base + 7 * 60 * 60,
        "Надходження",
      );

      expect(
        findInternalTransferSuggestions([topUp, donation, late], {
          jarAccountIds: ["jar-1"],
        }),
      ).toEqual([]);
    });

    it("stays silent when two own legs are equally plausible partners of the jar leg", () => {
      const first = tx("c-1", -7_235, "black", base, "Витрата");
      const second = tx("c-2", -7_235, "white", base, "Витрата");

      expect(
        findInternalTransferSuggestions([first, second, jarLeg], {
          jarAccountIds: ["jar-1"],
        }),
      ).toEqual([]);
    });
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
