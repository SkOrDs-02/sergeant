import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Regression test for ADR-0042 (password hashing strategy).
 *
 * Pins the contract that Better Auth ships scrypt — **not** bcrypt — under the
 * hood, and therefore has **no** 72-byte input truncation. If upstream ever
 * regresses to bcrypt (or any algo with a hard input limit) these tests will
 * fail loudly, and the operator can flip back the cap or land an Argon2id
 * adapter as a follow-up.
 *
 * See `node_modules/@better-auth/utils/dist/password.mjs` for the upstream
 * reference (`scryptAsync` over `password.normalize("NFKC")`).
 */
describe("Better Auth password hashing — scrypt, no bcrypt 72-byte truncation", () => {
  it("produces different hashes for inputs that diverge **after** byte 72", async () => {
    // bcrypt would give identical hashes here (silent truncation at byte 72);
    // scrypt depends on every byte → outputs must differ.
    const a = "a".repeat(72) + "X";
    const b = "a".repeat(72) + "Y";
    const hashA = await hashPassword(a);
    const hashB = await hashPassword(b);

    expect(hashA).not.toBe(hashB);

    // And critically, hashB must NOT verify against hashA (the silent-truncate
    // bug). If this passes against bcrypt, both `await verify(hashA, b)` and
    // `await verify(hashA, "a".repeat(72))` would return true.
    await expect(verifyPassword({ hash: hashA, password: b })).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword({ hash: hashA, password: "a".repeat(72) }),
    ).resolves.toBe(false);
  });

  it("hashes and verifies a 200-character passphrase end-to-end", async () => {
    // Smoke for realistic long passphrase managers (Bitwarden, 1Password).
    // 200 chars is well within MAX_PASSWORD_LENGTH=256 (ADR-0042) and well
    // outside the bcrypt 72-byte boundary.
    const long = "correct horse battery staple ".repeat(7).slice(0, 200);
    expect(long.length).toBe(200);
    const hash = await hashPassword(long);
    await expect(verifyPassword({ hash, password: long })).resolves.toBe(true);
    await expect(
      verifyPassword({ hash, password: long + "tamper" }),
    ).resolves.toBe(false);
  });

  it("rejects a wrong password (sanity)", async () => {
    const hash = await hashPassword("super-secret-pass-2026");
    await expect(
      verifyPassword({ hash, password: "wrong-password" }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword({ hash, password: "super-secret-pass-2026" }),
    ).resolves.toBe(true);
  });

  it("emits a salted hash (different invocations of hashPassword on the same input differ)", async () => {
    // scrypt with random salt → no deterministic hash. Catches an upstream
    // regression to a fixed-salt or unsalted KDF (which would be a critical
    // vulnerability).
    const h1 = await hashPassword("identical-input");
    const h2 = await hashPassword("identical-input");
    expect(h1).not.toBe(h2);
    await expect(
      verifyPassword({ hash: h1, password: "identical-input" }),
    ).resolves.toBe(true);
    await expect(
      verifyPassword({ hash: h2, password: "identical-input" }),
    ).resolves.toBe(true);
  });
});
