/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect } from "vitest";
import {
  HUB_BACKUP_KIND,
  HUB_BACKUP_SCHEMA_VERSION,
  buildHubBackupPayload,
  isHubBackupPayload,
  redactPii,
} from "./hubBackup";

beforeEach(() => {
  localStorage.clear();
});

describe("hubBackup", () => {
  it("isHubBackupPayload приймає валідний корінь", () => {
    expect(
      isHubBackupPayload({
        kind: HUB_BACKUP_KIND,
        schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
      }),
    ).toBe(true);
  });

  it("відхиляє сторонні об'єкти", () => {
    expect(isHubBackupPayload(null)).toBe(false);
    expect(isHubBackupPayload({ kind: "other" })).toBe(false);
    expect(isHubBackupPayload({ kind: HUB_BACKUP_KIND })).toBe(false);
  });

  describe("redactPii (audit 03 F20)", () => {
    it("strips identity-shaped keys but keeps user content + record ids", () => {
      const input = {
        userId: "auth_opaque_abc123",
        accounts: [{ id: "a1", accountId: "uuid-acc-1", balance: 5000 }],
        transactions: [
          {
            id: "t1",
            txId: "tx-keep",
            _accountId: "uuid-acc-1",
            amount: -250,
            description: "Кава",
          },
        ],
      };
      const out = redactPii(input);
      const serialized = JSON.stringify(out);

      // Identity fields gone…
      expect(serialized).not.toContain("auth_opaque_abc123");
      expect(serialized).not.toContain("uuid-acc-1");
      expect(serialized).not.toMatch(/"userId"/);
      expect(serialized).not.toMatch(/"accountId"/);
      expect(serialized).not.toMatch(/"_accountId"/);

      // …user content + referential ids survive.
      expect(serialized).toContain("Кава");
      expect(serialized).toContain('"id":"t1"');
      expect(serialized).toContain('"txId":"tx-keep"');
      expect(serialized).toContain('"balance":5000');
    });

    it("recurses through arrays and nested objects", () => {
      const out = redactPii({
        rows: [
          { ownerId: "o1", note: "n1" },
          { sessionId: "s1", note: "n2" },
        ],
        nested: { deep: { customerId: "c1", value: 42 } },
      });
      const s = JSON.stringify(out);
      expect(s).not.toContain("o1");
      expect(s).not.toContain("s1");
      expect(s).not.toContain("c1");
      expect(s).toContain("n1");
      expect(s).toContain("n2");
      expect(s).toContain('"value":42');
    });

    it("leaves primitives and null untouched", () => {
      expect(redactPii(null)).toBeNull();
      expect(redactPii(7)).toBe(7);
      expect(redactPii("plain")).toBe("plain");
    });
  });

  it("buildHubBackupPayload emits no identity keys at the top level", () => {
    const payload = buildHubBackupPayload({ includeChat: false });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/"userId"/);
    expect(serialized).not.toMatch(/"accountId"/);
    expect(payload.kind).toBe(HUB_BACKUP_KIND);
  });
});
