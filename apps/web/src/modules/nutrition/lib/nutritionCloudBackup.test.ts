import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { decryptBlobToJson, encryptJsonToBlob } from "./nutritionCloudBackup";

describe("nutritionCloudBackup", () => {
  it("encrypts and decrypts JSON payload", async () => {
    if (!globalThis.crypto) globalThis.crypto = webcrypto as unknown as Crypto;
    const payload = { kind: "hub-nutrition-backup", schemaVersion: 1, x: 1 };
    const blob = await encryptJsonToBlob(payload, "pass");
    const out = await decryptBlobToJson(blob, "pass");
    expect(out).toEqual(payload);
  });

  it("fails to decrypt with wrong passphrase", async () => {
    if (!globalThis.crypto) globalThis.crypto = webcrypto as unknown as Crypto;
    const payload = { x: 1 };
    const blob = await encryptJsonToBlob(payload, "pass");
    await expect(decryptBlobToJson(blob, "wrong")).rejects.toBeTruthy();
  });
});
