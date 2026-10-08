// Цілеспрямовані тести під мутантів Stryker (mutation:core, issue #967):
// межі часу/валюти, нормалізація рахунків, ранжування ребер, порядок
// видачі, кожна гілка маркера переказу.
import { describe, expect, it } from "vitest";

import { INTERNAL_TRANSFER_ID } from "../constants";
import type { Transaction } from "./types";
import {
  findInternalTransferSuggestions,
  type TransferMatchOptions,
} from "./transferMatching";

function tx(
  id: string,
  amount: number,
  accountId: string | undefined,
  time: number,
  description = "Переказ",
  extra: Record<string, unknown> = {},
): Transaction {
  return {
    id,
    amount,
    time,
    date: "2026-01-01T00:00:00.000Z",
    description,
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "mono",
    accountId,
    manual: false,
    _source: "mono",
    _manual: false,
    currencyCode: 980,
    ...extra,
  } as unknown as Transaction;
}

function ids(
  list: readonly Transaction[],
  options?: TransferMatchOptions,
): string[] {
  return findInternalTransferSuggestions(list, options).map(
    (s) => `${s.outgoing.id}>${s.incoming.id}`,
  );
}

const T = 1_700_000_000;

describe("transferMatching: маркери переказу (кожна гілка regex)", () => {
  const matches = (description: string): boolean =>
    ids([
      tx("o", -100, "a", T, description),
      tx("i", 100, "b", T + 1, "Надходження"),
    ]).length === 1;

  it.each([
    "Переказ",
    "переказом коштів",
    "Перевод на карту",
    "Перевод",
    "Transfer",
    "bank transfers",
    "Між картками",
    "між власними картками",
    "Між рахунками",
    "На картку",
    "На білу картку",
    "З чорної картки",
    "Із білої великої картки",
    "З банки",
    "У банку",
    "на банк",
    "Зняття банки",
    "Часткове зняття банки «просто»",
    "Поповнення банку",
    "закриття банки",
    "Jar",
  ])("%s розпізнається як маркер", (description) => {
    expect(matches(description)).toBe(true);
  });

  it.each([
    "Сільпо",
    "Кава",
    "Вона картку не бачила",
    "Зняття готівки в банкоматі",
    "jargon",
  ])("%s не є маркером", (description) => {
    expect(matches(description)).toBe(false);
  });

  it("слова description і merchant склеюються пробілом, а не впритул", () => {
    expect(
      ids([
        tx("o", -100, "a", T, "між", { merchant: "рахунками" }),
        tx("i", 100, "b", T, "Надходження"),
      ]),
    ).toEqual(["o>i"]);
  });

  it("маркер у note або merchant теж працює", () => {
    expect(
      ids([
        tx("o", -100, "a", T, "Оплата", { note: "переказ" }),
        tx("i", 100, "b", T, "Надходження"),
      ]),
    ).toEqual(["o>i"]);
    expect(
      ids([
        tx("o", -100, "a", T, "Оплата", { merchant: "Transfer" }),
        tx("i", 100, "b", T, "Надходження"),
      ]),
    ).toEqual(["o>i"]);
  });

  it("кешбек/відсотки на будь-якій ніжці скасовують пару", () => {
    expect(
      ids([
        tx("o", -100, "a", T, "Переказ"),
        tx("i", 100, "b", T, "Кешбек за переказ"),
      ]),
    ).toEqual([]);
    expect(
      ids([
        tx("o", -100, "a", T, "Salary переказ"),
        tx("i", 100, "b", T, "Переказ"),
      ]),
    ).toEqual([]);
  });
});

describe("transferMatching: рахунки", () => {
  it("accountId має пріоритет над _accountId", () => {
    expect(
      ids([
        tx("o", -100, "a", T, "Переказ", { _accountId: "b" }),
        tx("i", 100, "b", T, "Переказ"),
      ]),
    ).toEqual(["o>i"]);
  });

  it("_accountId використовується, коли accountId відсутній", () => {
    expect(
      ids([
        tx("o", -100, undefined, T, "Переказ", { _accountId: "a" }),
        tx("i", 100, undefined, T, "Переказ", { _accountId: "b" }),
      ]),
    ).toEqual(["o>i"]);
  });

  it("порожній, пробільний або нерядковий id рахунку — не рахунок", () => {
    for (const bad of ["", "   ", 5, null]) {
      expect(
        ids([
          tx("o", -100, bad as unknown as string, T, "Переказ"),
          tx("i", 100, "b", T, "Переказ"),
        ]),
      ).toEqual([]);
      expect(
        ids([
          tx("o", -100, "a", T, "Переказ"),
          tx("i", 100, bad as unknown as string, T, "Переказ"),
        ]),
      ).toEqual([]);
    }
  });

  it("однаковий рахунок на обох ногах — не переказ", () => {
    expect(ids([tx("o", -100, "a", T), tx("i", 100, "a", T)])).toEqual([]);
  });

  it("jarAccountIds: Set і масив дають маркер без тексту", () => {
    const list = [
      tx("o", -100, "card", T, "Оплата"),
      tx("i", 100, "jar1", T, "Надходження"),
    ];
    expect(ids(list)).toEqual([]);
    expect(ids(list, { jarAccountIds: new Set(["jar1"]) })).toEqual(["o>i"]);
    expect(ids(list, { jarAccountIds: ["jar1"] })).toEqual(["o>i"]);
    expect(ids(list, { jarAccountIds: ["other"] })).toEqual([]);
    // банка на вихідній нозі
    expect(ids(list, { jarAccountIds: ["card"] })).toEqual(["o>i"]);
  });
});

describe("transferMatching: час", () => {
  it("мілісекунди нормалізуються до секунд (поріг 10_000_000_000)", () => {
    const [s] = findInternalTransferSuggestions([
      tx("o", -100, "a", 1_700_000_000_000),
      tx("i", 100, "b", 1_700_000_060_000),
    ]);
    expect(s?.timeDeltaSeconds).toBe(60);
  });

  it("значення рівно 10_000_000_000 ще лічиться секундами", () => {
    const [s] = findInternalTransferSuggestions([
      tx("o", -100, "a", 10_000_000_000),
      tx("i", 100, "b", 10_000_000_060),
    ]);
    // 10_000_000_060 > поріг -> мс -> 10_000_000 c, а 10_000_000_000 -> секунди
    expect(s).toBeUndefined();
  });

  it("дробові секунди відкидаються (floor)", () => {
    const [s] = findInternalTransferSuggestions([
      tx("o", -100, "a", 1000.9),
      tx("i", 100, "b", 1010.1),
    ]);
    expect(s?.timeDeltaSeconds).toBe(10);
  });

  it("час 0, від'ємний, NaN або безкінечний — нога без часу, пара відкидається", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "abc"]) {
      expect(
        ids([tx("o", -100, "a", bad as number), tx("i", 100, "b", 100)]),
      ).toEqual([]);
      expect(
        ids([tx("o", -100, "a", 100), tx("i", 100, "b", bad as number)]),
      ).toEqual([]);
    }
  });

  it("поріг за замовчуванням: рівно 6 годин проходить, 6 годин + 1 с — ні", () => {
    const six = 6 * 60 * 60;
    expect(ids([tx("o", -100, "a", T), tx("i", 100, "b", T + six)])).toEqual([
      "o>i",
    ]);
    expect(
      ids([tx("o", -100, "a", T), tx("i", 100, "b", T + six + 1)]),
    ).toEqual([]);
  });

  it("власний maxTimeDeltaSeconds: межа включно", () => {
    const list = [tx("o", -100, "a", T), tx("i", 100, "b", T + 100)];
    expect(ids(list, { maxTimeDeltaSeconds: 100 })).toEqual(["o>i"]);
    expect(ids(list, { maxTimeDeltaSeconds: 99 })).toEqual([]);
  });

  it("нульовий, від'ємний або нечисловий maxTimeDeltaSeconds -> дефолт 6 год", () => {
    const list = [tx("o", -100, "a", T), tx("i", 100, "b", T + 3600)];
    for (const bad of [0, -1, Number.NaN, undefined]) {
      expect(ids(list, { maxTimeDeltaSeconds: bad })).toEqual(["o>i"]);
    }
    expect(
      ids(list, { maxTimeDeltaSeconds: Number.POSITIVE_INFINITY }),
    ).toEqual(["o>i"]);
  });
});

describe("transferMatching: валюта", () => {
  it("різні валюти — не пара", () => {
    expect(
      ids([
        tx("o", -100, "a", T, "Переказ", { currencyCode: 980 }),
        tx("i", 100, "b", T, "Переказ", { currencyCode: 840 }),
      ]),
    ).toEqual([]);
  });

  it("невалідний код валюти (0, від'ємний, NaN, відсутній) не блокує пару", () => {
    for (const bad of [0, -1, Number.NaN, undefined, "x"]) {
      expect(
        ids([
          tx("o", -100, "a", T, "Переказ", { currencyCode: bad }),
          tx("i", 100, "b", T, "Переказ", { currencyCode: 840 }),
        ]),
      ).toEqual(["o>i"]);
      expect(
        ids([
          tx("o", -100, "a", T, "Переказ", { currencyCode: 840 }),
          tx("i", 100, "b", T, "Переказ", { currencyCode: bad }),
        ]),
      ).toEqual(["o>i"]);
    }
  });
});

describe("transferMatching: уже позначені переказом", () => {
  const pair = (
    out: Record<string, unknown> = {},
    inc: Record<string, unknown> = {},
  ): Transaction[] => [
    tx("o", -100, "a", T, "Переказ", out),
    tx("i", 100, "b", T, "Переказ", inc),
  ];

  it("обидві ноги з категорією переказу — пара не пропонується", () => {
    const both = { categoryId: INTERNAL_TRANSFER_ID };
    expect(ids(pair(both, both))).toEqual([]);
  });

  it("обидві ноги з type=transfer — не пропонується", () => {
    const both = { type: "transfer" };
    expect(ids(pair(both, both))).toEqual([]);
  });

  it("різні способи позначення на різних ногах теж виключають пару", () => {
    expect(
      ids(pair({ categoryId: INTERNAL_TRANSFER_ID }, { type: "transfer" })),
    ).toEqual([]);
  });

  it("txCategories позначає ноги окремо від самої транзакції", () => {
    const options = {
      txCategories: { o: INTERNAL_TRANSFER_ID, i: INTERNAL_TRANSFER_ID },
    };
    expect(ids(pair(), options)).toEqual([]);
    expect(ids(pair(), { txCategories: { o: INTERNAL_TRANSFER_ID } })).toEqual([
      "o>i",
    ]);
    expect(ids(pair(), { txCategories: { o: "food", i: "food" } })).toEqual([
      "o>i",
    ]);
  });

  it("одна нога позначена, друга ні — пара ще пропонується", () => {
    expect(ids(pair({ categoryId: INTERNAL_TRANSFER_ID }))).toEqual(["o>i"]);
    expect(ids(pair({}, { type: "transfer" }))).toEqual(["o>i"]);
  });

  it("порожній type не вважається переказом", () => {
    expect(ids(pair({ type: "" }, { type: "" }))).toEqual(["o>i"]);
  });
});

describe("transferMatching: ranking і неоднозначність", () => {
  it("напрямок визначається знаком, а не порядком у списку", () => {
    const [s] = findInternalTransferSuggestions([
      tx("i", 100, "b", T),
      tx("o", -100, "a", T),
    ]);
    expect(s?.outgoing.id).toBe("o");
    expect(s?.incoming.id).toBe("i");
    expect(s?.amountMinor).toBe(100);
  });

  it("порожній/некоректний вхід -> []", () => {
    expect(findInternalTransferSuggestions(null)).toEqual([]);
    expect(findInternalTransferSuggestions(undefined)).toEqual([]);
    expect(findInternalTransferSuggestions([])).toEqual([]);
  });

  it("більше маркерів перемагає за рівної відстані в часі", () => {
    const o = tx("o", -100, "a", T, "Переказ");
    const strong = tx("strong", 100, "b", T + 10, "Переказ");
    const weak = tx("weak", 100, "c", T + 10, "Надходження");
    expect(ids([o, weak, strong])).toEqual(["o>strong"]);
    expect(ids([o, strong, weak])).toEqual(["o>strong"]);
  });

  it("за рівних маркерів перемагає ближча в часі нога", () => {
    const o = tx("o", -100, "a", T, "Переказ");
    const near = tx("near", 100, "b", T + 10, "Переказ");
    const far = tx("far", 100, "c", T + 20, "Переказ");
    expect(ids([o, far, near])).toEqual(["o>near"]);
    expect(ids([o, near, far])).toEqual(["o>near"]);
  });

  it("рівні маркери і відстань -> неоднозначно, нічого не пропонується", () => {
    const o = tx("o", -100, "a", T, "Переказ");
    const x = tx("x", 100, "b", T + 10, "Переказ");
    const y = tx("y", 100, "c", T + 10, "Переказ");
    expect(ids([o, x, y])).toEqual([]);
  });

  it("рівна відстань, але різні маркери -> не неоднозначно", () => {
    const o = tx("o", -100, "a", T, "Оплата");
    const withMarker = tx("m", 100, "b", T + 10, "Переказ");
    const plain = tx("p", 100, "c", T + 10, "Надходження");
    // plain без маркера пару не утворює взагалі; сильніший лишається єдиним.
    expect(ids([o, withMarker, plain])).toEqual(["o>m"]);
  });

  it("маркер у описі + банка лічаться разом (3 > 2)", () => {
    const o = tx("o", -100, "a", T, "Переказ");
    const jarLeg = tx("j", 100, "jar", T + 5, "Переказ");
    const textOnly = tx("t", 100, "b", T + 5, "Переказ");
    expect(ids([o, textOnly, jarLeg], { jarAccountIds: ["jar"] })).toEqual([
      "o>j",
    ]);
  });

  it("кожна нога має бути найкращою для свого партнера", () => {
    // o1 найкраще пасує i1, але i1 ближчий до o2 -> o1 лишається ні з чим.
    const o1 = tx("o1", -100, "a", T, "Переказ");
    const o2 = tx("o2", -100, "c", T + 100, "Переказ");
    const i1 = tx("i1", 100, "b", T + 90, "Переказ");
    expect(ids([o1, o2, i1])).toEqual(["o2>i1"]);
  });
});

describe("transferMatching: порядок видачі", () => {
  it("спочатку пари з пізнішою найранішою ногою", () => {
    // A: ноги T+1000 і T+5000 (min T+1000), B: T+2000 і T+3000 (min T+2000)
    const a = [tx("ao", -100, "a1", T + 1000), tx("ai", 100, "a2", T + 5000)];
    const b = [tx("bo", -200, "b1", T + 2000), tx("bi", 200, "b2", T + 3000)];
    expect(ids([...a, ...b])).toEqual(["bo>bi", "ao>ai"]);
    expect(ids([...b, ...a])).toEqual(["bo>bi", "ao>ai"]);
  });

  it("за рівного часу — за ключем пари (outgoing:incoming)", () => {
    const z = [tx("z-out", -100, "z1", T), tx("z-in", 100, "z2", T)];
    const a = [tx("a-out", -200, "a1", T), tx("a-in", 200, "a2", T)];
    expect(ids([...z, ...a])).toEqual(["a-out>a-in", "z-out>z-in"]);
    expect(ids([...a, ...z])).toEqual(["a-out>a-in", "z-out>z-in"]);
  });
});
