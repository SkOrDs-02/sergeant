import { describe, it, expect } from "vitest";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  filterTransactionsBySearch,
  normalizeSearchQuery,
} from "./transactionSearch";

function tx(id: string, description: string, extra: Partial<Transaction> = {}) {
  return { id, description, amount: -100, time: 1, ...extra } as Transaction;
}

const list = [
  tx("b1", "СІЛЬПО"),
  tx("b2", "Aroma Kava", { merchant: "Aroma Kava LLC" }),
  tx("manual_m1", "Ринок"),
  tx("b3", "Укрзалізниця"),
];

describe("normalizeSearchQuery", () => {
  it("обрізає, зводить регістр і апострофи", () => {
    expect(normalizeSearchQuery("  Сільпо  ")).toBe("сільпо");
    expect(normalizeSearchQuery("Здоровʼя")).toBe(
      normalizeSearchQuery("здоров'я"),
    );
    expect(normalizeSearchQuery("   ")).toBe("");
  });
});

describe("filterTransactionsBySearch", () => {
  it("порожній запит повертає той самий масив", () => {
    expect(filterTransactionsBySearch(list, "  ", {})).toBe(list);
  });

  it("шукає в описі без урахування регістру, кирилицею", () => {
    const res = filterTransactionsBySearch(list, "сільпо", {});
    expect(res.map((t) => t.id)).toEqual(["b1"]);
  });

  it("шукає в назві продавця", () => {
    expect(
      filterTransactionsBySearch(list, "llc", {}).map((t) => t.id),
    ).toEqual(["b2"]);
  });

  it("шукає в нотатці і тегу за id операції, ручний запис теж", () => {
    const res = filterTransactionsBySearch(list, "відпустка", {
      notes: { b3: "Квитки, відпустка" },
      tags: { manual_m1: ["Відпустка"] },
    });
    expect(res.map((t) => t.id)).toEqual(["manual_m1", "b3"]);
  });

  it("кілька слів діють як «і» по всіх полях", () => {
    const res = filterTransactionsBySearch(list, "ринок овочі", {
      notes: { manual_m1: "овочі на тиждень" },
    });
    expect(res.map((t) => t.id)).toEqual(["manual_m1"]);
    expect(filterTransactionsBySearch(list, "ринок кава", {})).toEqual([]);
  });

  it("нічого не знайдено дає порожній масив", () => {
    expect(filterTransactionsBySearch(list, "zzz", {})).toEqual([]);
  });
});
