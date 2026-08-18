// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { IMPORT_CSV_MAX_FILE_BYTES, readCsvTextFile } from "./importCsv";

describe("readCsvTextFile", () => {
  it("reads a small CSV file as text", async () => {
    const file = new File(["date,amount\n2026-08-01,100"], "a.csv", {
      type: "text/csv",
    });
    const result = await readCsvTextFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("date,amount");
  });

  it("rejects an empty file", async () => {
    const file = new File([""], "empty.csv", { type: "text/csv" });
    const result = await readCsvTextFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Порожній/);
  });

  it("rejects a whitespace-only file", async () => {
    const file = new File(["   \n  "], "blank.csv", { type: "text/csv" });
    const result = await readCsvTextFile(file);
    expect(result.ok).toBe(false);
  });

  it("rejects a file larger than the 5MB guard", async () => {
    const file = new File(
      [new Uint8Array(IMPORT_CSV_MAX_FILE_BYTES + 1)],
      "big.csv",
      {
        type: "text/csv",
      },
    );
    const result = await readCsvTextFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/5 МБ/);
  });
});
