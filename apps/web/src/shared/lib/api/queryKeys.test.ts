import { describe, it, expect } from "vitest";
import {
  finykKeys,
  nutritionKeys,
  coachKeys,
  digestKeys,
  pushKeys,
  hubKeys,
  strategicKeys,
  syncKeys,
  billingKeys,
  hashToken,
} from "./queryKeys";

// ─── finykKeys ────────────────────────────────────────────────────────────────

describe("finykKeys", () => {
  it("all key starts with 'finyk'", () => {
    expect(finykKeys.all[0]).toBe("finyk");
  });

  it("proactiveAdvice includes monthKey and categoryId", () => {
    const key = finykKeys.proactiveAdvice("2026-05", "food");
    expect(key).toContain("2026-05");
    expect(key).toContain("food");
    expect(key[0]).toBe("finyk");
  });

  it("proactiveAdvice produces distinct keys for different months", () => {
    const k1 = finykKeys.proactiveAdvice("2026-05", "food");
    const k2 = finykKeys.proactiveAdvice("2026-06", "food");
    expect(JSON.stringify(k1)).not.toBe(JSON.stringify(k2));
  });

  it("proactiveAdvice produces distinct keys for different categories", () => {
    const k1 = finykKeys.proactiveAdvice("2026-05", "food");
    const k2 = finykKeys.proactiveAdvice("2026-05", "transport");
    expect(JSON.stringify(k1)).not.toBe(JSON.stringify(k2));
  });

  it("monoClientInfo is scoped under finyk > mono", () => {
    const key = finykKeys.monoClientInfo("abc123");
    expect(key[0]).toBe("finyk");
    expect(key[1]).toBe("mono");
    expect(key).toContain("abc123");
  });

  it("monoStatement encodes accId + from + to", () => {
    const key = finykKeys.monoStatement("acc1", 1000, 2000);
    expect(key).toContain("acc1");
    expect(key).toContain(1000);
    expect(key).toContain(2000);
  });

  it("monoStatement distinguishes different time ranges", () => {
    const k1 = finykKeys.monoStatement("acc1", 1000, 2000);
    const k2 = finykKeys.monoStatement("acc1", 1000, 3000);
    expect(JSON.stringify(k1)).not.toBe(JSON.stringify(k2));
  });

  it("monoTransactionsDb encodes from/to/accountId", () => {
    const key = finykKeys.monoTransactionsDb(
      "2026-01-01",
      "2026-01-31",
      "acc1",
    );
    expect(key).toContain("2026-01-01");
    expect(key).toContain("2026-01-31");
    expect(key).toContain("acc1");
  });

  it("monoWebhookTransactions uses 'all' when no params passed", () => {
    const key = finykKeys.monoWebhookTransactions();
    expect(key).toContain("all");
  });

  it("monoWebhookTransactions with params differs from default", () => {
    const k1 = finykKeys.monoWebhookTransactions();
    const k2 = finykKeys.monoWebhookTransactions("from=2026-01-01");
    expect(JSON.stringify(k1)).not.toBe(JSON.stringify(k2));
  });

  it("privatStatement scopes under finyk > privat", () => {
    const key = finykKeys.privatStatement(
      "h1",
      "acc2",
      "2026-01-01",
      "2026-01-31",
    );
    expect(key[0]).toBe("finyk");
    expect(key[1]).toBe("privat");
  });
});

// ─── nutritionKeys ────────────────────────────────────────────────────────────

describe("nutritionKeys", () => {
  it("all key starts with 'nutrition'", () => {
    expect(nutritionKeys.all[0]).toBe("nutrition");
  });

  it("foodSearchLocal embeds the query string", () => {
    const key = nutritionKeys.foodSearchLocal("гречка");
    expect(key).toContain("гречка");
    expect(key[0]).toBe("nutrition");
  });

  it("foodSearchOff embeds the query string", () => {
    const key = nutritionKeys.foodSearchOff("chicken");
    expect(key).toContain("chicken");
  });

  it("foodSearchLocal and foodSearchOff differ for the same query", () => {
    const local = nutritionKeys.foodSearchLocal("test");
    const off = nutritionKeys.foodSearchOff("test");
    expect(JSON.stringify(local)).not.toBe(JSON.stringify(off));
  });

  it("barcode embeds the barcode string", () => {
    const key = nutritionKeys.barcode("5901234123457");
    expect(key).toContain("5901234123457");
  });

  it("pushStatus is under 'nutrition'", () => {
    expect(nutritionKeys.pushStatus[0]).toBe("nutrition");
  });
});

// ─── other key namespaces ─────────────────────────────────────────────────────

describe("coachKeys", () => {
  it("insight key includes dayKey", () => {
    const key = coachKeys.insight("2026-06-02");
    expect(key).toContain("2026-06-02");
    expect(key[0]).toBe("coach");
  });
});

describe("digestKeys", () => {
  it("byWeek includes weekKey", () => {
    const key = digestKeys.byWeek("2026-W22");
    expect(key).toContain("2026-W22");
  });
});

describe("pushKeys", () => {
  it("all, status, vapid are distinct", () => {
    expect(JSON.stringify(pushKeys.all)).not.toBe(
      JSON.stringify(pushKeys.status),
    );
    expect(JSON.stringify(pushKeys.status)).not.toBe(
      JSON.stringify(pushKeys.vapid),
    );
  });
});

describe("hubKeys", () => {
  it("preview includes module name", () => {
    const key = hubKeys.preview("finyk");
    expect(key).toContain("finyk");
    expect(key[0]).toBe("hub");
  });
});

describe("strategicKeys", () => {
  it("goalsForWeek includes weekStart", () => {
    const key = strategicKeys.goalsForWeek("2026-06-01");
    expect(key).toContain("2026-06-01");
  });
});

describe("syncKeys", () => {
  it("status key starts with 'sync'", () => {
    const key = syncKeys.status();
    expect(key[0]).toBe("sync");
  });
});

describe("billingKeys", () => {
  it("status key contains 'billing' and 'status'", () => {
    expect(billingKeys.status[0]).toBe("billing");
    expect(billingKeys.status).toContain("status");
  });
});

// ─── hashToken ────────────────────────────────────────────────────────────────

describe("hashToken", () => {
  it("returns 'anon' for null", () => {
    expect(hashToken(null)).toBe("anon");
  });

  it("returns 'anon' for undefined", () => {
    expect(hashToken(undefined)).toBe("anon");
  });

  it("returns 'anon' for empty string", () => {
    expect(hashToken("")).toBe("anon");
  });

  it("returns a 12-character hex string for a non-empty token", () => {
    const h = hashToken("my-secret-token");
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is deterministic — same input gives same output", () => {
    expect(hashToken("token-abc")).toBe(hashToken("token-abc"));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("does not expose the original token in the hash", () => {
    const token = "super-secret-12345";
    const h = hashToken(token);
    expect(h).not.toContain(token);
  });
});
