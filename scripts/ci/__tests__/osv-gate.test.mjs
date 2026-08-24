// scripts/ci/__tests__/osv-gate.test.mjs
//
// Unit tests for the ledger-backed OSV-Scanner gate.
// Run with: node --test scripts/ci/__tests__/osv-gate.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseSarifFindings,
  evaluateSarifFindings,
  buildSeverityMap,
} from "../osv-gate.mjs";
import { parseAuditExceptions } from "../audit-exceptions.mjs";

const LEDGER = `# Audit-винятки

> **Status:** Active

## Як цей файл працює

Проза, що згадує GHSA-dddd-eeee-ffff вище за заголовок «Поточні винятки» —
парситись як виняток вона НЕ повинна.

## Поточні винятки

### extract-zip path traversal

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Advisory | https://github.com/advisories/GHSA-jmr9-qjv8-65gv |
| Severity | high                                              |
| Due date | 2026-11-30                                        |

### image-size DoS

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Advisory | https://github.com/advisories/GHSA-5p2g-fcmc-qvqq |
| Severity | high                                              |
| Due date | 2026-10-31                                        |

### expired waiver

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Advisory | https://github.com/advisories/GHSA-aaaa-bbbb-cccc |
| Severity | high                                              |
| Due date | 2026-01-31                                        |

## Інша секція

GHSA-9999-9999-9999 тут не waive-иться — секція не «Поточні винятки».
`;

/** Мінімальний SARIF у формі, яку емітить osv-scanner. */
const SARIF = JSON.stringify({
  runs: [
    {
      tool: {
        driver: {
          rules: [
            {
              id: "GHSA-jmr9-qjv8-65gv",
              shortDescription: {
                text: "GHSA-jmr9-qjv8-65gv: extract-zip unvalidated symlink path traversal",
              },
              fullDescription: { text: "Aliases: CVE-2026-56876" },
            },
            {
              id: "GHSA-5p2g-fcmc-qvqq",
              shortDescription: { text: "image-size DoS" },
              fullDescription: { text: "Aliases: CVE-2025-71329" },
            },
            {
              id: "GHSA-aaaa-bbbb-cccc",
              shortDescription: { text: "waiver протермінований" },
            },
            {
              id: "GHSA-9999-9999-9999",
              shortDescription: { text: "нове, ledger про нього не знає" },
            },
          ],
        },
      },
      results: [
        {
          ruleId: "GHSA-jmr9-qjv8-65gv",
          level: "warning",
          message: { text: "Package extract-zip@2.0.1" },
          locations: [
            {
              physicalLocation: { artifactLocation: { uri: "pnpm-lock.yaml" } },
            },
          ],
        },
        {
          ruleId: "GHSA-5p2g-fcmc-qvqq",
          level: "warning",
          message: { text: "Package image-size@2.0.2" },
        },
        {
          ruleId: "GHSA-aaaa-bbbb-cccc",
          level: "warning",
          message: { text: "Package stale-pkg@1.0.0" },
        },
        {
          ruleId: "GHSA-9999-9999-9999",
          level: "warning",
          message: { text: "Package brand-new@1.0.0" },
        },
      ],
    },
  ],
});

describe("parseSarifFindings", () => {
  it("витягує кожен result із його ruleId та аліасами з тексту правила", () => {
    const findings = parseSarifFindings(SARIF);
    assert.equal(findings.length, 4);

    const first = findings[0];
    assert.equal(first.ruleId, "GHSA-jmr9-qjv8-65gv");
    assert.equal(first.where, "pnpm-lock.yaml");
    // GHSA з ruleId + CVE-аліас із fullDescription — ledger може називати будь-який.
    assert.ok(first.ids.includes("GHSA-JMR9-QJV8-65GV"));
    assert.ok(first.ids.includes("CVE-2026-56876"));
  });

  it("повертає null на невалідному JSON — «невідомо», не «чисто»", () => {
    assert.equal(parseSarifFindings("not json at all"), null);
  });

  it("повертає null, коли в документі немає runs[]", () => {
    assert.equal(
      parseSarifFindings(JSON.stringify({ version: "2.1.0" })),
      null,
    );
  });

  it("порожній SARIF (чистий скан) дає порожній список, а не null", () => {
    const findings = parseSarifFindings(JSON.stringify({ runs: [] }));
    assert.deepEqual(findings, []);
  });
});

describe("evaluateSarifFindings", () => {
  const exceptions = parseAuditExceptions(LEDGER);
  const findings = parseSarifFindings(SARIF);

  it("waive-ить finding, названий у ledger-і з майбутнім Due date", () => {
    const { waived } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
    });
    const ids = waived.map((w) => w.ruleId);
    assert.ok(ids.includes("GHSA-jmr9-qjv8-65gv"));
    assert.ok(ids.includes("GHSA-5p2g-fcmc-qvqq"));
  });

  it("блокує finding, якого в ledger-і немає", () => {
    const { blocked } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
    });
    const fresh = blocked.find((b) => b.ruleId === "GHSA-9999-9999-9999");
    assert.ok(fresh, "нова вразливість має блокувати");
    // Без severity-мапи причина — «unknown to pnpm audit»: гейт не знає
    // severity й навмисно обирає сувору гілку. З мапою це «no ledger entry»
    // — див. describe("severity gate").
    assert.equal(fresh.reason, "unknown to pnpm audit");
  });

  it("блокує finding із простроченим Due date", () => {
    const { blocked } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
    });
    const expired = blocked.find((b) => b.ruleId === "GHSA-aaaa-bbbb-cccc");
    assert.ok(expired);
    assert.match(expired.reason, /expired 2026-01-31/);
  });

  it("той самий виняток перестає діяти після Due date", () => {
    const { blocked } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-12-01",
    });
    const ids = blocked.map((b) => b.ruleId);
    assert.ok(ids.includes("GHSA-jmr9-qjv8-65gv"), "2026-11-30 вже минув");
  });

  it("матчить ledger-запис, який називає лише CVE, а не GHSA", () => {
    const cveOnlyLedger = parseAuditExceptions(`## Поточні винятки

### image-size DoS

| Field    | Value          |
| -------- | -------------- |
| Advisory | CVE-2025-71329 |
| Due date | 2026-10-31     |
`);
    const { waived, blocked } = evaluateSarifFindings({
      findings: findings.filter((f) => f.ruleId === "GHSA-5p2g-fcmc-qvqq"),
      exceptions: cveOnlyLedger,
      today: "2026-08-23",
    });
    assert.equal(waived.length, 1);
    assert.equal(blocked.length, 0);
  });

  it("чистий скан не блокує нічого", () => {
    const { blocked, waived } = evaluateSarifFindings({
      findings: [],
      exceptions,
      today: "2026-08-23",
    });
    assert.deepEqual(blocked, []);
    assert.deepEqual(waived, []);
  });
});

describe("severity gate", () => {
  const exceptions = parseAuditExceptions(LEDGER);

  const AUDIT_JSON = JSON.stringify({
    advisories: {
      1: {
        id: 1,
        severity: "low",
        github_advisory_id: "GHSA-9999-9999-9999",
        cves: [],
        module_name: "body-parser-ish",
        url: "",
      },
      2: {
        id: 2,
        severity: "high",
        github_advisory_id: "GHSA-8888-8888-8888",
        cves: [],
        module_name: "risky",
        url: "",
      },
    },
  });

  it("buildSeverityMap індексує і GHSA, і CVE у верхньому регістрі", () => {
    const map = buildSeverityMap(
      JSON.stringify({
        advisories: {
          1: {
            id: 1,
            severity: "high",
            github_advisory_id: "GHSA-aaaa-bbbb-cccc",
            cves: ["CVE-2026-1"],
          },
        },
      }),
    );
    assert.equal(map.get("GHSA-AAAA-BBBB-CCCC"), "high");
    assert.equal(map.get("CVE-2026-1"), "high");
  });

  it("low/moderate не блокує, навіть якщо ledger про нього не знає", () => {
    const findings = parseSarifFindings(SARIF).filter(
      (f) => f.ruleId === "GHSA-9999-9999-9999",
    );
    const { blocked, ignored } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
      severityById: buildSeverityMap(AUDIT_JSON),
    });
    assert.deepEqual(blocked, []);
    assert.equal(ignored.length, 1);
    assert.equal(ignored[0].severity, "low");
  });

  it("high без ledger-запису блокує", () => {
    const findings = [
      {
        ruleId: "GHSA-8888-8888-8888",
        ids: ["GHSA-8888-8888-8888"],
        where: "",
      },
    ];
    const { blocked } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
      severityById: buildSeverityMap(AUDIT_JSON),
    });
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].reason, "no ledger entry");
  });

  it("id, невідомий pnpm audit, блокує — невідоме ≠ безпечне", () => {
    const findings = [
      {
        ruleId: "GHSA-7777-7777-7777",
        ids: ["GHSA-7777-7777-7777"],
        where: "",
      },
    ];
    const { blocked } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
      severityById: buildSeverityMap(AUDIT_JSON),
    });
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].reason, "unknown to pnpm audit");
  });

  it("порожня severity-мапа не послаблює гейт", () => {
    const findings = parseSarifFindings(SARIF).filter(
      (f) => f.ruleId === "GHSA-9999-9999-9999",
    );
    const { blocked } = evaluateSarifFindings({
      findings,
      exceptions,
      today: "2026-08-23",
    });
    assert.equal(blocked.length, 1);
  });
});
