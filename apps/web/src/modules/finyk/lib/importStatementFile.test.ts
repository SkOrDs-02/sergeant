import { describe, expect, it } from "vitest";
import {
  IMPORT_STATEMENT_FILE_ACCEPT,
  IMPORT_STATEMENT_MAX_FILE_BYTES,
  readStatementFile,
} from "./importStatementFile";

describe("readStatementFile", () => {
  it("віддає файл сирим base64 разом з іменем", async () => {
    const file = new File(["Дата;Сума\n16.08.2026;-12,50\n"], "vypyska.csv", {
      type: "text/csv",
    });
    const result = await readStatementFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.file_name).toBe("vypyska.csv");
    // Кирилиця мусить дожити до сервера як БАЙТИ — саме її псувало
    // `file.text()`, коли виписка приходила у windows-1251.
    expect(
      Buffer.from(result.payload.file_base64, "base64").toString("utf8"),
    ).toContain("Дата");
  });

  it("відхиляє порожній файл", async () => {
    const result = await readStatementFile(new File([], "empty.xlsx"));
    expect(result).toEqual({ ok: false, error: "Порожній файл." });
  });

  it("відхиляє файл понад 5 МБ до відправки", async () => {
    const oversized = new File(
      [new Uint8Array(IMPORT_STATEMENT_MAX_FILE_BYTES + 1)],
      "big.xlsx",
    );
    const result = await readStatementFile(oversized);
    expect(result).toEqual({
      ok: false,
      error: "Файл завеликий (максимум 5 МБ).",
    });
  });

  it("пікер приймає і таблиці, і CSV", () => {
    expect(IMPORT_STATEMENT_FILE_ACCEPT).toContain(".xlsx");
    expect(IMPORT_STATEMENT_FILE_ACCEPT).toContain(".xls");
    expect(IMPORT_STATEMENT_FILE_ACCEPT).toContain(".csv");
  });
});
