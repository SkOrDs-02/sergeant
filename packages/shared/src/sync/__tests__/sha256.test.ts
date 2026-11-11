import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexUtf8 } from "../sha256";

// Вектори FIPS 180-4 / NIST: власна реалізація має збігатися з еталоном
// побайтово, інакше клієнт і сервер (ADR-0106) рахуватимуть різні хеші.
describe("sha256Hex", () => {
  it("відповідає векторам NIST", () => {
    expect(sha256HexUtf8("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256HexUtf8("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256HexUtf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256HexUtf8("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("збігається з node:crypto на межах блоку і не-ASCII", () => {
    for (let len = 0; len <= 130; len++) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + len) & 0xff);
      expect(sha256Hex(bytes)).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
    const text = "ї-кирилиця 😀 ｚ";
    expect(sha256HexUtf8(text)).toBe(
      createHash("sha256").update(text, "utf8").digest("hex"),
    );
  });
});
