import { describe, expect, it } from "vitest";
import { parseDpsReceiptQrUrl } from "./receiptQr";

const VALID_URL =
  "https://cabinet.tax.gov.ua/cashregs/check?id=4123456789&date=17082026&time=1530&fn=4000123456&sm=15075";

describe("parseDpsReceiptQrUrl", () => {
  it("parses a well-formed DPS receipt QR URL", () => {
    expect(parseDpsReceiptQrUrl(VALID_URL)).toEqual({
      fn: "4000123456",
      id: "4123456789",
      date: "17082026",
      time: "1530",
      sm: "15075",
    });
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseDpsReceiptQrUrl(`  ${VALID_URL}  `)).toEqual({
      fn: "4000123456",
      id: "4123456789",
      date: "17082026",
      time: "1530",
      sm: "15075",
    });
  });

  it("returns null for a non-URL string", () => {
    expect(parseDpsReceiptQrUrl("not a url")).toBeNull();
  });

  it("returns null for an empty/whitespace string", () => {
    expect(parseDpsReceiptQrUrl("")).toBeNull();
    expect(parseDpsReceiptQrUrl("   ")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://cabinet.tax.gov.ua/cashregs/check?id=1&date=17082026&time=1530&fn=2",
      ),
    ).toBeNull();
  });

  it("returns null when a field is empty", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://cabinet.tax.gov.ua/cashregs/check?id=&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toBeNull();
  });

  it("returns null when a field fails the whitelist (unexpected characters)", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://cabinet.tax.gov.ua/cashregs/check?id=1;DROP&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toBeNull();
  });

  it("returns null when a field exceeds the 64-char whitelist bound", () => {
    const tooLong = "a".repeat(65);
    expect(
      parseDpsReceiptQrUrl(
        `https://cabinet.tax.gov.ua/cashregs/check?id=1&date=17082026&time=1530&fn=${tooLong}&sm=3`,
      ),
    ).toBeNull();
  });

  it("returns null for an unrelated QR payload (e.g. a random URL)", () => {
    expect(parseDpsReceiptQrUrl("https://example.com/foo")).toBeNull();
  });

  it("returns null for a non-DPS host even when all five fields are otherwise valid", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://evil.example.com/cashregs/check?id=1&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toBeNull();
  });

  it("returns null for the DPS host on the wrong path", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://cabinet.tax.gov.ua/other/path?id=1&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toBeNull();
  });

  it("returns null for the DPS host over plain http", () => {
    expect(
      parseDpsReceiptQrUrl(
        "http://cabinet.tax.gov.ua/cashregs/check?id=1&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toBeNull();
  });

  it("returns null for a look-alike host with the DPS host only as a subdomain suffix", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://cabinet.tax.gov.ua.evil.com/cashregs/check?id=1&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toBeNull();
  });

  it("accepts dots/dashes/underscores inside field values", () => {
    expect(
      parseDpsReceiptQrUrl(
        "https://cabinet.tax.gov.ua/cashregs/check?id=a-b_c.d&date=17082026&time=1530&fn=2&sm=3",
      ),
    ).toEqual({
      fn: "2",
      id: "a-b_c.d",
      date: "17082026",
      time: "1530",
      sm: "3",
    });
  });
});
