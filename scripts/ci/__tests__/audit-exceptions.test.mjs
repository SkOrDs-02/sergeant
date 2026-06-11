// scripts/ci/__tests__/audit-exceptions.test.mjs
//
// Unit tests for the ledger-backed audit gate.
// Run with: node --test scripts/ci/__tests__/audit-exceptions.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseAuditExceptions,
  evaluateAudit,
  parseAuditJson,
} from "../audit-exceptions.mjs";

const LEDGER = `# Audit-винятки

> **Status:** Active

## Як цей файл працює

Some prose mentioning GHSA-aaaa-bbbb-cccc that must NOT be parsed as an
exception because it is above the current-exceptions header.

## Поточні винятки

### ajv ReDoS via expo-dev-launcher (CVE-2025-69873)

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Advisory | https://github.com/advisories/GHSA-2g4f-4pwh-qvx6 (CVE-2025-69873) |
| Severity | moderate                                                    |
| Due date | 2026-09-30                                                  |
| Owner    | @Skords-01                                                  |

### some-pkg prototype pollution

| Field    | Value                                   |
| -------- | --------------------------------------- |
| Advisory | https://github.com/advisories/GHSA-1111-2222-3333 |
| Severity | high                                    |
| Due date | 2025-01-01                              |
| Owner    | @Skords-01                              |

## Secret-scanning false positives

### 2026-05-04 — AWS Access Key GHSA-dead-beef-cafe

This GHSA-shaped string lives in a non-advisory section and must be ignored.
`;

describe("parseAuditExceptions", () => {
  it("extracts only entries under the current-exceptions header", () => {
    const exceptions = parseAuditExceptions(LEDGER);
    assert.equal(exceptions.length, 2);
    const titles = exceptions.map((e) => e.title);
    assert.ok(titles[0].startsWith("ajv ReDoS"));
    assert.ok(titles[1].startsWith("some-pkg"));
  });

  it("captures both GHSA and CVE ids, upper-cased", () => {
    const [ajv] = parseAuditExceptions(LEDGER);
    assert.ok(ajv.ids.includes("GHSA-2G4F-4PWH-QVX6"));
    assert.ok(ajv.ids.includes("CVE-2025-69873"));
  });

  it("captures severity and due date", () => {
    const [ajv, pkg] = parseAuditExceptions(LEDGER);
    assert.equal(ajv.severity, "moderate");
    assert.equal(ajv.dueDate, "2026-09-30");
    assert.equal(pkg.dueDate, "2025-01-01");
  });

  it("ignores GHSA strings outside the current-exceptions section", () => {
    const ids = parseAuditExceptions(LEDGER).flatMap((e) => e.ids);
    assert.ok(!ids.includes("GHSA-AAAA-BBBB-CCCC"));
    assert.ok(!ids.includes("GHSA-DEAD-BEEF-CAFE"));
  });
});

describe("evaluateAudit", () => {
  const exceptions = parseAuditExceptions(LEDGER);
  const today = "2026-06-11";

  it("waives a high advisory with a valid, non-expired ledger entry", () => {
    const advisories = [
      {
        id: "1",
        severity: "high",
        ghsa: "GHSA-2G4F-4PWH-QVX6",
        cves: [],
        module: "ajv",
        url: "",
      },
    ];
    const { blocked, waived } = evaluateAudit({
      advisories,
      exceptions,
      today,
    });
    assert.equal(blocked.length, 0);
    assert.equal(waived.length, 1);
  });

  it("blocks a critical advisory even if the ledger lists it", () => {
    const advisories = [
      {
        id: "2",
        severity: "critical",
        ghsa: "GHSA-2G4F-4PWH-QVX6",
        cves: ["CVE-2025-69873"],
        module: "ajv",
        url: "",
      },
    ];
    const { blocked } = evaluateAudit({ advisories, exceptions, today });
    assert.equal(blocked.length, 1);
    assert.match(blocked[0].reason, /never waived/);
  });

  it("blocks a high advisory whose exception is past its due date", () => {
    const advisories = [
      {
        id: "3",
        severity: "high",
        ghsa: "GHSA-1111-2222-3333",
        cves: [],
        module: "some-pkg",
        url: "",
      },
    ];
    const { blocked } = evaluateAudit({ advisories, exceptions, today });
    assert.equal(blocked.length, 1);
    assert.match(blocked[0].reason, /expired/);
  });

  it("blocks a high advisory with no ledger entry", () => {
    const advisories = [
      {
        id: "4",
        severity: "high",
        ghsa: "GHSA-9999-9999-9999",
        cves: [],
        module: "mystery",
        url: "",
      },
    ];
    const { blocked } = evaluateAudit({ advisories, exceptions, today });
    assert.equal(blocked.length, 1);
    assert.match(blocked[0].reason, /no ledger entry/);
  });

  it("matches an advisory by a CVE id embedded in its url", () => {
    const advisories = [
      {
        id: "5",
        severity: "high",
        ghsa: null,
        cves: [],
        module: "ajv",
        url: "https://github.com/advisories/GHSA-2g4f-4pwh-qvx6",
      },
    ];
    const { waived } = evaluateAudit({ advisories, exceptions, today });
    assert.equal(waived.length, 1);
  });

  it("ignores moderate/low advisories entirely", () => {
    const advisories = [
      {
        id: "6",
        severity: "moderate",
        ghsa: null,
        cves: [],
        module: "x",
        url: "",
      },
      { id: "7", severity: "low", ghsa: null, cves: [], module: "y", url: "" },
    ];
    const { blocked, waived } = evaluateAudit({
      advisories,
      exceptions,
      today,
    });
    assert.equal(blocked.length, 0);
    assert.equal(waived.length, 0);
  });
});

describe("parseAuditJson", () => {
  it("normalises the npm advisory schema", () => {
    const json = JSON.stringify({
      advisories: {
        1234: {
          id: 1234,
          severity: "high",
          github_advisory_id: "GHSA-2g4f-4pwh-qvx6",
          cves: ["CVE-2025-69873"],
          module_name: "ajv",
          url: "https://github.com/advisories/GHSA-2g4f-4pwh-qvx6",
        },
      },
    });
    const [adv] = parseAuditJson(json);
    assert.equal(adv.severity, "high");
    assert.equal(adv.ghsa, "GHSA-2G4F-4PWH-QVX6");
    assert.equal(adv.module, "ajv");
    assert.deepEqual(adv.cves, ["CVE-2025-69873"]);
  });

  it("returns [] on a non-JSON banner instead of throwing", () => {
    assert.deepEqual(parseAuditJson("ERR_PNPM_REGISTRY unreachable"), []);
  });
});
