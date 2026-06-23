import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeMock } = vi.hoisted(() => ({ writeMock: vi.fn() }));

vi.mock("@shared/lib/storage/storage", () => ({ safeWriteLS: writeMock }));

import {
  buildMonoTx,
  dateKey,
  daysAgo,
  shortId,
  toISO,
  writeJSON,
  writeRaw,
} from "./utils";

describe("seedDemoData/utils", () => {
  beforeEach(() => {
    writeMock.mockReset();
  });

  it("writeJSON / writeRaw delegate to safeWriteLS", () => {
    writeJSON("k1", { a: 1 });
    writeRaw("k2", "raw");
    expect(writeMock).toHaveBeenNthCalledWith(1, "k1", { a: 1 });
    expect(writeMock).toHaveBeenNthCalledWith(2, "k2", "raw");
  });

  it("toISO produces an ISO string", () => {
    expect(toISO(new Date("2026-06-23T00:00:00Z"))).toBe(
      "2026-06-23T00:00:00.000Z",
    );
  });

  it("dateKey formats YYYY-MM-DD in local time", () => {
    const d = new Date(2026, 5, 9); // June 9 local
    expect(dateKey(d)).toBe("2026-06-09");
  });

  it("daysAgo subtracts days and sets the hour/minute", () => {
    const d = daysAgo(2, 8, 30);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
    const today = new Date();
    today.setHours(8, 30, 0, 0);
    const deltaDays = Math.round((today.getTime() - d.getTime()) / 86400000);
    expect(deltaDays).toBe(2);
  });

  it("shortId encodes the seed in base36 with the prefix", () => {
    expect(shortId("demo_h", 1)).toBe("demo_h_1");
    expect(shortId("demo_h", 36)).toBe("demo_h_10");
  });

  it("buildMonoTx builds a signed-kopeck expense", () => {
    const tx = buildMonoTx(
      1,
      new Date("2026-06-23T10:00:00Z"),
      150.5,
      "Coffee",
      4814,
      "expense",
    );
    expect(tx.amount).toBe(-15050);
    expect(tx.type).toBe("expense");
    expect(tx.source).toBe("mono");
    expect(tx.description).toBe("Coffee");
    expect(tx.id).toBe("demo_mtx_1");
  });

  it("buildMonoTx builds a positive-kopeck income", () => {
    const tx = buildMonoTx(
      2,
      new Date("2026-06-23T10:00:00Z"),
      1000,
      "Salary",
      0,
      "income",
    );
    expect(tx.amount).toBe(100000);
    expect(tx.type).toBe("income");
  });
});
