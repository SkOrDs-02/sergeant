import { describe, expect, it } from "vitest";
import {
  REFUND_MAX_GAP_DAYS,
  cancelledMerchantOf,
  findCancellationPairs,
  findCancelledTxIds,
  type RefundTxLike,
} from "./refundMatching";

const DAY = 86_400;
const BASE = 1_760_000_000;

function tx(
  id: string,
  amountMinor: number,
  time: number,
  description: string,
  extra: Partial<RefundTxLike> = {},
): RefundTxLike {
  return { id, amount: amountMinor, time, description, ...extra };
}

describe("cancelledMerchantOf", () => {
  it.each([
    ["Скасування. Uklon", "Uklon"],
    ["скасування. Uklon", "Uklon"],
    ["СКАСУВАННЯ. Uklon", "Uklon"],
    ["Скасування Uklon", "Uklon"],
    ["Скасування: Bolt", "Bolt"],
    ["  Скасування.   Uklon  ", "Uklon"],
    ["Скасування.Uklon", "Uklon"],
  ])("«%s» → %s", (description, merchant) => {
    expect(cancelledMerchantOf(description)).toBe(merchant);
  });

  it.each([
    "Uklon",
    "Скасування",
    "Скасування.",
    "Повернення. Uklon",
    "Мій лист про скасування. Uklon",
    "",
    null,
    undefined,
  ])("«%s» не є скасуванням", (description) => {
    expect(cancelledMerchantOf(description)).toBeNull();
  });
});

describe("findCancellationPairs — реальні приклади власника", () => {
  // Uklon −189 / −488 і Bolt −499,89 / −539,52: списання, а за ним
  // «Скасування. <мерчант>» на ту саму суму. До 2026-10-01 списання
  // рахувалось витратою (Транспорт), а скасування — доходом (Інше).
  const txs = [
    tx("uklon-out-189", -18_900, BASE, "Uklon"),
    tx("uklon-in-189", 18_900, BASE + 2 * 3_600, "Скасування. Uklon"),
    tx("uklon-out-488", -48_800, BASE + 3 * DAY, "Uklon"),
    tx("uklon-in-488", 48_800, BASE + 3 * DAY + 600, "Скасування. Uklon"),
    tx("bolt-out-499", -49_989, BASE + 5 * DAY, "Bolt"),
    tx("bolt-in-499", 49_989, BASE + 5 * DAY + 1_200, "Скасування. Bolt"),
    tx("bolt-out-539", -53_952, BASE + 6 * DAY, "Bolt"),
    tx("bolt-in-539", 53_952, BASE + 6 * DAY + 900, "Скасування. Bolt"),
  ];

  it("парує кожне списання з його скасуванням", () => {
    const pairs = findCancellationPairs(txs);
    expect(pairs.map((p) => `${p.debit.id}→${p.credit.id}`).sort()).toEqual([
      "bolt-out-499→bolt-in-499",
      "bolt-out-539→bolt-in-539",
      "uklon-out-189→uklon-in-189",
      "uklon-out-488→uklon-in-488",
    ]);
  });

  it("обидві ноги кожної пари виходять зі статистики", () => {
    expect([...findCancelledTxIds(txs)].sort()).toEqual(
      txs.map((t) => t.id).sort(),
    );
  });

  it("порядок вхідного списку не має значення", () => {
    expect([...findCancelledTxIds([...txs].reverse())].sort()).toEqual(
      [...findCancelledTxIds(txs)].sort(),
    );
  });

  it("не чіпає звичайні списання й надходження поруч", () => {
    const withNoise = [
      ...txs,
      tx("coffee", -9_500, BASE + DAY, "Кав'ярня"),
      tx("salary", 5_000_000, BASE + DAY, "Зарплата"),
      tx("uklon-other", -31_000, BASE + 4 * DAY, "Uklon"),
    ];
    const ids = findCancelledTxIds(withNoise);
    expect(ids.has("coffee")).toBe(false);
    expect(ids.has("salary")).toBe(false);
    expect(ids.has("uklon-other")).toBe(false);
    expect(ids.size).toBe(txs.length);
  });
});

describe("findCancellationPairs — запобіжники", () => {
  const out = tx("out", -18_900, BASE, "Uklon");

  it("часткове скасування (інша сума) не парується", () => {
    expect(
      findCancellationPairs([
        out,
        tx("in", 10_000, BASE + 3_600, "Скасування. Uklon"),
      ]),
    ).toEqual([]);
    // Різниця в одну копійку — теж не та сама сума.
    expect(
      findCancellationPairs([
        out,
        tx("in", 18_901, BASE + 3_600, "Скасування. Uklon"),
      ]),
    ).toEqual([]);
  });

  it("інший мерчант не парується", () => {
    expect(
      findCancellationPairs([
        out,
        tx("in", 18_900, BASE + 3_600, "Скасування. Bolt"),
      ]),
    ).toEqual([]);
  });

  it("надходження без префікса «Скасування» не парується", () => {
    for (const description of ["Uklon", "Повернення Uklon", "Переказ"]) {
      expect(
        findCancellationPairs([
          out,
          tx("in", 18_900, BASE + 3_600, description),
        ]),
      ).toEqual([]);
    }
  });

  it("скасування РАНІШЕ за списання не парується", () => {
    expect(
      findCancellationPairs([
        out,
        tx("in", 18_900, BASE - 3_600, "Скасування. Uklon"),
      ]),
    ).toEqual([]);
  });

  it(`вікно: рівно ${REFUND_MAX_GAP_DAYS} днів ще пара, на секунду більше — ні`, () => {
    const edge = tx(
      "in-edge",
      18_900,
      BASE + REFUND_MAX_GAP_DAYS * DAY,
      "Скасування. Uklon",
    );
    const late = tx(
      "in-late",
      18_900,
      BASE + REFUND_MAX_GAP_DAYS * DAY + 1,
      "Скасування. Uklon",
    );
    expect(findCancellationPairs([out, edge])).toHaveLength(1);
    expect(findCancellationPairs([out, late])).toEqual([]);
  });

  it("свій maxGapDays звужує вікно", () => {
    const credit = tx("in", 18_900, BASE + 3 * DAY, "Скасування. Uklon");
    expect(findCancellationPairs([out, credit], { maxGapDays: 2 })).toEqual([]);
    expect(
      findCancellationPairs([out, credit], { maxGapDays: 3 }),
    ).toHaveLength(1);
  });

  it("різні рахунки або валюти не парує, відомий збіг — парує", () => {
    const credit = (extra: Partial<RefundTxLike>) =>
      tx("in", 18_900, BASE + 3_600, "Скасування. Uklon", extra);
    const debit = (extra: Partial<RefundTxLike>) =>
      tx("out", -18_900, BASE, "Uklon", extra);

    expect(
      findCancellationPairs([
        debit({ accountId: "black" }),
        credit({ accountId: "white" }),
      ]),
    ).toEqual([]);
    expect(
      findCancellationPairs([
        debit({ currencyCode: 980 }),
        credit({ currencyCode: 840 }),
      ]),
    ).toEqual([]);
    expect(
      findCancellationPairs([
        debit({ accountId: "black", currencyCode: 980 }),
        credit({ _accountId: "black", currencyCode: 980 }),
      ]),
    ).toHaveLength(1);
    // Невідомий рахунок з одного боку не блокує пару.
    expect(
      findCancellationPairs([debit({}), credit({ accountId: "black" })]),
    ).toHaveLength(1);
  });

  it("секунди й мілісекунди в `time` читаються однаково", () => {
    const pairs = findCancellationPairs([
      tx("out", -18_900, BASE * 1000, "Uklon"),
      tx("in", 18_900, (BASE + 3_600) * 1000, "Скасування. Uklon"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.gapMs).toBe(3_600_000);
  });

  it("нульова сума, відсутній id або час не парується", () => {
    expect(
      findCancellationPairs([
        tx("zero", 0, BASE, "Uklon"),
        tx("in", 0, BASE + 1, "Скасування. Uklon"),
        { id: "", amount: -100, time: BASE, description: "Uklon" },
        tx("no-time", -18_900, 0, "Uklon"),
        tx("credit", 18_900, BASE + 1, "Скасування. Uklon"),
      ]),
    ).toEqual([]);
  });

  it("толерує null/undefined/не масив", () => {
    expect(findCancellationPairs(null)).toEqual([]);
    expect(findCancellationPairs(undefined)).toEqual([]);
    expect(findCancellationPairs([null, undefined])).toEqual([]);
    expect(findCancelledTxIds(null).size).toBe(0);
  });
});

describe("findCancellationPairs — кілька однакових списань", () => {
  it("одне скасування бере найближче попереднє списання, друге лишається витратою", () => {
    const first = tx("out-1", -18_900, BASE, "Uklon");
    const second = tx("out-2", -18_900, BASE + 2 * DAY, "Uklon");
    const credit = tx("in", 18_900, BASE + 2 * DAY + 600, "Скасування. Uklon");

    const pairs = findCancellationPairs([first, second, credit]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.debit.id).toBe("out-2");
    expect(findCancelledTxIds([first, second, credit]).has("out-1")).toBe(
      false,
    );
  });

  it("два скасування розбирають два списання, кожне списання лише раз", () => {
    const pairs = findCancellationPairs([
      tx("out-1", -18_900, BASE, "Uklon"),
      tx("out-2", -18_900, BASE + 2 * DAY, "Uklon"),
      tx("in-1", 18_900, BASE + 2 * DAY + 600, "Скасування. Uklon"),
      tx("in-2", 18_900, BASE + 3 * DAY, "Скасування. Uklon"),
    ]);
    expect(pairs.map((p) => `${p.debit.id}→${p.credit.id}`).sort()).toEqual([
      "out-1→in-2",
      "out-2→in-1",
    ]);
  });

  it("одне списання не парується з двома скасуваннями", () => {
    const pairs = findCancellationPairs([
      tx("out", -18_900, BASE, "Uklon"),
      tx("in-1", 18_900, BASE + 600, "Скасування. Uklon"),
      tx("in-2", 18_900, BASE + 1_200, "Скасування. Uklon"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.credit.id).toBe("in-1");
  });

  it("два списання в один і той самий момент: невідомо яке — пари немає", () => {
    expect(
      findCancellationPairs([
        tx("out-a", -18_900, BASE, "Uklon"),
        tx("out-b", -18_900, BASE, "Uklon"),
        tx("in", 18_900, BASE + 600, "Скасування. Uklon"),
      ]),
    ).toEqual([]);
  });
});
