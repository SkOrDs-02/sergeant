// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readReceiptLinks, writeReceiptLink } from "./receiptLinks";

beforeEach(() => {
  localStorage.clear();
});

describe("receiptLinks", () => {
  it("returns an empty map when nothing was written yet", () => {
    expect(readReceiptLinks()).toEqual({});
  });

  it("round-trips a single link", () => {
    writeReceiptLink("mono-tx-1", 42);
    expect(readReceiptLinks()).toEqual({ "mono-tx-1": 42 });
  });

  it("accumulates multiple links across separate writes", () => {
    writeReceiptLink("mono-tx-1", 42);
    writeReceiptLink("manual-2", 43);
    expect(readReceiptLinks()).toEqual({ "mono-tx-1": 42, "manual-2": 43 });
  });

  it("overwrites the receiptId for the same txRef", () => {
    writeReceiptLink("mono-tx-1", 42);
    writeReceiptLink("mono-tx-1", 99);
    expect(readReceiptLinks()).toEqual({ "mono-tx-1": 99 });
  });

  it("drops corrupted entries on read (non-positive-int values)", () => {
    localStorage.setItem(
      "finyk_receipt_links_v1",
      JSON.stringify({ good: 5, bad1: -1, bad2: "5", bad3: 0, bad4: 1.5 }),
    );
    expect(readReceiptLinks()).toEqual({ good: 5 });
  });

  it("returns an empty map for a malformed (non-object) stored value", () => {
    localStorage.setItem("finyk_receipt_links_v1", JSON.stringify("oops"));
    expect(readReceiptLinks()).toEqual({});
  });

  it("does not write an invalid (non-positive-int) receiptId", () => {
    writeReceiptLink("mono-tx-1", 42);
    writeReceiptLink("mono-tx-2", -1);
    writeReceiptLink("mono-tx-3", 1.5);
    writeReceiptLink("mono-tx-4", 0);
    expect(readReceiptLinks()).toEqual({ "mono-tx-1": 42 });
  });

  it("caps the map at 500 entries, dropping the oldest insertions first", () => {
    for (let i = 0; i < 501; i++) {
      writeReceiptLink(`tx-${i}`, i + 1);
    }
    const links = readReceiptLinks();
    expect(Object.keys(links)).toHaveLength(500);
    expect(links["tx-0"]).toBeUndefined();
    expect(links["tx-500"]).toBe(501);
  });
});
