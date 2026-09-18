import { normalizeBarcodeRaw } from "../barcodeNormalize";

describe("normalizeBarcodeRaw", () => {
  it("витягує 8–14 цифр", () => {
    expect(normalizeBarcodeRaw("978-0-123-45678-9")).toBe("9780123456789");
  });
  it("null якщо замало цифр", () => {
    expect(normalizeBarcodeRaw("12345")).toBeNull();
  });
  it("null для порожнього", () => {
    expect(normalizeBarcodeRaw("")).toBeNull();
  });
});
