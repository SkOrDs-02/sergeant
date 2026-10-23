import { describe, expect, it } from "vitest";
import { IMPORT_COMMIT_MAX_ROWS } from "@sergeant/shared";
import type { BulkReviewRow } from "./bulkImportRows";
import {
  chunkedCommitHint,
  chunkProgressLabel,
  partialCommitMessage,
  planCommitChunks,
} from "./commitChunks";

function row(i: number, overrides: Partial<BulkReviewRow> = {}): BulkReviewRow {
  return {
    id: `statement-${i}`,
    date: "2026-08-01",
    description: `BIG-${i}`,
    amountKopiykas: 100 + i,
    direction: "expense",
    category: "other",
    confidence: null,
    transferLikely: false,
    duplicateLikely: false,
    selected: true,
    ...overrides,
  };
}

const ids = (chunks: BulkReviewRow[][]) =>
  chunks.map((c) => c.map((r) => r.id));

describe("planCommitChunks (ux-07)", () => {
  it("серверний кап commit-у – 1000 рядків", () => {
    expect(IMPORT_COMMIT_MAX_ROWS).toBe(1000);
  });

  it("2500 вибраних → 1000 + 1000 + 500, порядок рядків збережено", () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i));
    const chunks = planCommitChunks(rows);
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500]);
    expect(chunks.flat().map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("рівно кап – одна частина; знята галочка не йде", () => {
    const rows = Array.from({ length: 1001 }, (_, i) =>
      row(i, { selected: i !== 0 }),
    );
    const chunks = planCommitChunks(rows);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(1000);
    expect(chunks[0]!.some((r) => r.id === "statement-0")).toBe(false);
  });

  it("нічого не вибрано – жодної частини", () => {
    expect(planCommitChunks([row(0, { selected: false })])).toEqual([]);
  });

  it("група (дата, сума, напрям) не розрізається межею частини", () => {
    // Рядки 2 і 3 – дві однакові відредаговані покупки (без
    // occurrenceIndex): сервер нумерує їх лише в межах одного запиту.
    const rows = [
      row(0),
      row(1),
      row(2, { amountKopiykas: 5000, description: "Кава" }),
      row(3, { amountKopiykas: 5000, description: "Кава" }),
      row(4),
    ];
    expect(ids(planCommitChunks(rows, 3))).toEqual([
      ["statement-0", "statement-1"],
      ["statement-2", "statement-3", "statement-4"],
    ]);
  });

  it("група, що трапляється в різних місцях таблиці, однаково йде разом", () => {
    const same = { amountKopiykas: 777, description: "Метро" };
    const rows = [row(0, same), row(1), row(2), row(3, same)];
    const chunks = planCommitChunks(rows, 2);
    const withSame = chunks.filter((c) =>
      c.some((r) => r.amountKopiykas === 777),
    );
    expect(withSame).toHaveLength(1);
    expect(withSame[0]!.map((r) => r.id)).toEqual([
      "statement-0",
      "statement-3",
    ]);
    expect(chunks.every((c) => c.length <= 2)).toBe(true);
  });

  it("група більша за кап ріжеться, але жодна частина не перевищує кап", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row(i, { amountKopiykas: 1, description: "x" }),
    );
    const chunks = planCommitChunks(rows, 2);
    expect(chunks.map((c) => c.length)).toEqual([2, 2, 1]);
  });
});

describe("тексти нарізки", () => {
  const nbsp = (s: string | null) => s?.replace(/\u00A0/g, " ") ?? null;

  it("підказка лише понад кап", () => {
    expect(chunkedCommitHint(1000)).toBeNull();
    expect(nbsp(chunkedCommitHint(1001))).toBe(
      "Імпорт піде частинами по 1 000 рядків.",
    );
  });

  it("прогрес у першій особі з одним «…»", () => {
    expect(chunkProgressLabel(2, 3)).toBe("Імпортую частину 2 з 3…");
  });

  it("частковий збій каже, скільки пішло, і закінчується дією", () => {
    const message = nbsp(partialCommitMessage(1000, 2500, "network down"));
    expect(message).toBe(
      "Імпортовано рядків: 1 000 з 2 500. Решта не пішла: network down. Натисни «Імпортувати» ще раз, щоб дослати решту.",
    );
    expect(
      partialCommitMessage(1, 2, "Забагато спроб. Зачекай хвилину."),
    ).toContain("хвилину. Натисни");
  });
});
