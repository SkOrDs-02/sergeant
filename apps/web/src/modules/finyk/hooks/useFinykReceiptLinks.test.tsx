// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { safeRemoveLS, safeWriteLS } from "@shared/lib/storage/storage";
import { useFinykReceiptLinks } from "./useFinykReceiptLinks";
import { RECEIPT_LINKS_KEY } from "../lib/receiptLinks";

// Goes through the same storage wrapper `receiptLinks.ts` itself uses
// (CodeRabbit round 5, PR #818) instead of poking `localStorage` directly —
// the production code resolves reads/writes through `webKVStore`'s
// SQLite-warm-cache-first ladder, and a raw `localStorage.*` call in the
// test silently depends on that ladder happening to fall back to LS in the
// Vitest environment. Also drops the hand-duplicated key literal.
beforeEach(() => {
  safeRemoveLS(RECEIPT_LINKS_KEY);
});

describe("useFinykReceiptLinks", () => {
  it("starts empty when nothing is persisted yet", () => {
    const { result } = renderHook(() => useFinykReceiptLinks());
    expect(result.current.hasReceipt("tx-1")).toBe(false);
    expect(result.current.getReceiptId("tx-1")).toBeNull();
  });

  it("hydrates from a previously persisted link", () => {
    safeWriteLS(RECEIPT_LINKS_KEY, { "tx-1": 7 });
    const { result } = renderHook(() => useFinykReceiptLinks());
    expect(result.current.hasReceipt("tx-1")).toBe(true);
    expect(result.current.getReceiptId("tx-1")).toBe(7);
  });

  it("recordReceiptLink makes hasReceipt/getReceiptId true synchronously (re-render)", () => {
    const { result } = renderHook(() => useFinykReceiptLinks());
    expect(result.current.hasReceipt("mono-tx-9")).toBe(false);

    act(() => {
      result.current.recordReceiptLink("mono-tx-9", 55);
    });

    expect(result.current.hasReceipt("mono-tx-9")).toBe(true);
    expect(result.current.getReceiptId("mono-tx-9")).toBe(55);
  });

  it("persists the recorded link so a fresh mount picks it up", () => {
    const first = renderHook(() => useFinykReceiptLinks());
    act(() => {
      first.result.current.recordReceiptLink("manual-1", 12);
    });

    const second = renderHook(() => useFinykReceiptLinks());
    expect(second.result.current.getReceiptId("manual-1")).toBe(12);
  });
});
