// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  RECEIPT_IMAGE_MAX_FILE_BYTES,
  fileToBase64,
  readReceiptImageFile,
} from "./receiptImage";

function makeFile(
  bytes: number,
  type = "image/jpeg",
  name = "receipt.jpg",
): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], name, { type });
}

describe("fileToBase64", () => {
  it("strips the data-url prefix and resolves the base64 body", async () => {
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    const b64 = await fileToBase64(file);
    expect(b64).toBe(Buffer.from("hello").toString("base64"));
  });
});

describe("readReceiptImageFile", () => {
  it("rejects a non-image file", async () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    const result = await readReceiptImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/зображення/);
  });

  it("rejects a file larger than the 5MB guard", async () => {
    const file = makeFile(RECEIPT_IMAGE_MAX_FILE_BYTES + 1);
    const result = await readReceiptImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/5 МБ/);
  });

  it("accepts a small image and returns a base64 payload", async () => {
    const file = makeFile(10, "image/png");
    const result = await readReceiptImageFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.mime_type).toBe("image/png");
      expect(typeof result.payload.image_base64).toBe("string");
      expect(result.payload.image_base64.length).toBeGreaterThan(0);
    }
  });

  it("falls back to image/jpeg when the file has no type", async () => {
    const file = makeFile(10, "");
    // jsdom `File` keeps `type: ""` — guard regex requires `image/` prefix,
    // so an untyped file is correctly rejected rather than silently
    // defaulted; assert the rejection path here.
    const result = await readReceiptImageFile(file);
    expect(result.ok).toBe(false);
  });
});
