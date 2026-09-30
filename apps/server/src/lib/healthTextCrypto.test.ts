import { describe, expect, it, vi } from "vitest";

import { parseKeyRing } from "./keyRing.js";
import {
  decryptHealthText,
  decryptOpRowForPull,
  encryptHealthText,
  encryptOpRowForStorage,
} from "./healthTextCrypto.js";

const K1 = "a".repeat(64);
const K2 = "b".repeat(64);
const ring1 = parseKeyRing({ legacyKey: K1, envName: "T" })!;
const ringRotated = parseKeyRing({
  keysCsv: `v1:${K1},v2:${K2}`,
  currentVersion: "v2",
  envName: "T",
})!;

describe("healthTextCrypto", () => {
  it("шифрує: у результаті немає plaintext, а читання повертає його байт у байт", () => {
    const note = "болить лівий коліно після присідань — ЖМ";
    const enc = encryptHealthText(note, ring1);
    expect(enc.startsWith("enc:v2:")).toBe(true);
    expect(enc).not.toContain("коліно");
    expect(decryptHealthText(enc, ring1)).toBe(note);
    // ідемпотентність читання
    expect(decryptHealthText(enc, ring1)).toBe(note);
  });

  it("порожній текст і відсутній ключ лишають значення як є", () => {
    expect(encryptHealthText("", ring1)).toBe("");
    expect(encryptHealthText("x", null)).toBe("x");
  });

  it("legacy plaintext читається без змін", () => {
    expect(decryptHealthText("old plaintext note", ring1)).toBe(
      "old plaintext note",
    );
  });

  it("ротація: старий і новий рядки читаються обидва", () => {
    const oldRow = encryptHealthText("old", ring1);
    const newRow = encryptHealthText("new", ringRotated);
    expect(newRow).toContain(":k2:");
    expect(decryptHealthText(oldRow, ringRotated)).toBe("old");
    expect(decryptHealthText(newRow, ringRotated)).toBe("new");
  });

  it("збій розшифрування деградує до порожнього рядка, а не кидає", () => {
    const enc = encryptHealthText("secret", ring1);
    const otherRing = parseKeyRing({ legacyKey: K2, envName: "T" })!;
    expect(decryptHealthText(enc, otherRing)).toBe("");
    expect(decryptHealthText(enc, null)).toBe("");
  });

  it("op-log payload: note шифрується лише для fizruk_injuries і розшифровується на pull", () => {
    const row = { id: "inj_1", note: "секрет", site: "knee" };
    const stored = encryptOpRowForStorage("fizruk_injuries", row, ring1);
    expect(JSON.stringify(stored)).not.toContain("секрет");
    expect(stored["site"]).toBe("knee");
    expect(decryptOpRowForPull("fizruk_injuries", stored, ring1)).toEqual(row);
    // інші таблиці не чіпаємо
    expect(encryptOpRowForStorage("fizruk_workouts", row, ring1)).toBe(row);
    expect(decryptOpRowForPull("fizruk_workouts", stored, ring1)).toBe(stored);
    // legacy plaintext payload
    expect(decryptOpRowForPull("fizruk_injuries", row, ring1)).toBe(row);
  });
});

describe("applyFizrukInjuries шифрує note у БД", () => {
  it("INSERT отримує enc:v2, а не plaintext", async () => {
    vi.resetModules();
    vi.doMock("./healthTextCrypto.js", async (orig) => {
      const actual = await orig<typeof import("./healthTextCrypto.js")>();
      return {
        ...actual,
        encryptHealthText: (t: string) => actual.encryptHealthText(t, ring1),
      };
    });
    const { applyFizrukInjuries } =
      await import("../modules/sync/fizruk/applyInjuries.js");
    const { asClient, FakeClient, syncOp } =
      await import("../modules/sync/fizruk/__tests__/testHelpers.js");
    const fake = new FakeClient();
    fake.queueRows([]); // existing lookup -> none
    const res = await applyFizrukInjuries(
      asClient(fake),
      syncOp("fizruk_injuries", "insert", {
        id: "inj_00000005-0009-4000-8001-000000000001",
        user_id: "user-1",
        site: "knee",
        started_at: "2026-07-20T06:00:00.000Z",
        note: "секретна нотатка",
      }),
      "user-1",
      new Date("2026-07-21T08:00:00.000Z"),
    );
    expect(res).toEqual({ status: "applied" });
    const insert = fake.queries[fake.queries.length - 1]!;
    const noteParam = insert.params[5] as string;
    expect(noteParam.startsWith("enc:v2:")).toBe(true);
    expect(noteParam).not.toContain("секретна");
    expect(decryptHealthText(noteParam, ring1)).toBe("секретна нотатка");
    vi.doUnmock("./healthTextCrypto.js");
  });
});
