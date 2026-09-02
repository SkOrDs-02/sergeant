import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  issueRoundTripTicket,
  consumeRoundTripTicket,
  __resetRoundTripTickets,
  __roundTripTicketStoreSize,
} from "./chatRoundTripTicket.js";

beforeEach(() => {
  __resetRoundTripTickets();
  vi.useRealTimers();
});

describe("chatRoundTripTicket — AI-5 continuation authorization", () => {
  it("issues a non-empty opaque ticket per call", () => {
    const a = issueRoundTripTicket({ userId: "u-1" });
    const b = issueRoundTripTicket({ userId: "u-1" });
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(10);
    expect(a).not.toBe(b);
    expect(__roundTripTicketStoreSize()).toBe(2);
  });

  it("consumes a valid ticket for the issuing user exactly once", () => {
    const ticket = issueRoundTripTicket({ userId: "u-1" });
    expect(consumeRoundTripTicket({ ticket, userId: "u-1" })).toBe(true);
    // Одноразовий — другий consume того самого квитка вже не спрацьовує.
    expect(consumeRoundTripTicket({ ticket, userId: "u-1" })).toBe(false);
  });

  it("rejects an unknown / forged ticket string", () => {
    expect(
      consumeRoundTripTicket({
        ticket: "forged-not-a-real-ticket",
        userId: "u-1",
      }),
    ).toBe(false);
  });

  it("rejects a ticket issued to a different user (no cross-user reuse)", () => {
    const ticket = issueRoundTripTicket({ userId: "someone-else" });
    expect(consumeRoundTripTicket({ ticket, userId: "u-1" })).toBe(false);
    // Не видаляється при чужій спробі — справжній власник усе ще може його вжити.
    expect(consumeRoundTripTicket({ ticket, userId: "someone-else" })).toBe(
      true,
    );
  });

  it("expires a ticket after its TTL", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const ticket = issueRoundTripTicket({ userId: "u-1" });
    vi.setSystemTime(now + 121_000); // TTL = 120s
    expect(consumeRoundTripTicket({ ticket, userId: "u-1" })).toBe(false);
    vi.useRealTimers();
  });
});
