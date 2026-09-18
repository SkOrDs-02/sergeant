// scripts/__tests__/db-index-audit.test.mjs
//
// Unit tests for pure helpers of `scripts/db-index-audit.mjs`. The
// integration path (real `pg.Client`) is exercised manually and via the
// runbook recipe — node:test here only validates the deterministic
// helpers (filtering, overlap detection, markdown rendering, credential
// redaction).

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  redactConnectionString,
  findOverlappingIndexes,
  rankSeqScanCandidates,
  rankUnusedIndexCandidates,
  renderMarkdownReport,
} from "../db-index-audit.mjs";

describe("redactConnectionString", () => {
  it("strips user:password from a libpq URL", () => {
    const out = redactConnectionString(
      "postgresql://devin:s3cret@db.example.com:5432/sergeant",
    );
    assert.equal(out, "postgresql://***@db.example.com:5432/sergeant");
  });

  it("handles URLs with no credentials", () => {
    const out = redactConnectionString("postgresql://db.example.com:5432/x");
    assert.equal(out, "postgresql://***@db.example.com:5432/x");
  });

  it("returns a safe placeholder for a non-URL DSN", () => {
    const out = redactConnectionString("host=db port=5432 user=u password=p");
    assert.equal(out, "<credentials redacted>");
  });

  it("returns '<unset>' for empty input", () => {
    assert.equal(redactConnectionString(""), "<unset>");
    assert.equal(redactConnectionString(null), "<unset>");
  });
});

describe("findOverlappingIndexes", () => {
  it("returns empty array when each table has only one index", () => {
    const recs = [
      {
        schemaName: "public",
        tableName: "a",
        indexName: "i1",
        columnNames: ["x"],
      },
      {
        schemaName: "public",
        tableName: "b",
        indexName: "i2",
        columnNames: ["x"],
      },
    ];
    assert.deepEqual(findOverlappingIndexes(recs), []);
  });

  it("returns the pair when one index is a leading-prefix of another", () => {
    const recs = [
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "user_idx",
        columnNames: ["user_id"],
      },
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "user_time_idx",
        columnNames: ["user_id", "created_at"],
      },
    ];
    const overlaps = findOverlappingIndexes(recs);
    assert.equal(overlaps.length, 1);
    assert.equal(overlaps[0].shorter.indexName, "user_idx");
    assert.equal(overlaps[0].longer.indexName, "user_time_idx");
  });

  it("does not pair indexes whose column lists diverge at the first position", () => {
    const recs = [
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "i_a",
        columnNames: ["account_id"],
      },
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "i_b",
        columnNames: ["user_id"],
      },
    ];
    assert.equal(findOverlappingIndexes(recs).length, 0);
  });

  it("treats equal-length identical column lists as overlap", () => {
    const recs = [
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "i_a",
        columnNames: ["user_id"],
      },
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "i_b",
        columnNames: ["user_id"],
      },
    ];
    assert.equal(findOverlappingIndexes(recs).length, 1);
  });

  it("skips records with empty column lists", () => {
    const recs = [
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "i_a",
        columnNames: [],
      },
      {
        schemaName: "public",
        tableName: "tx",
        indexName: "i_b",
        columnNames: ["user_id"],
      },
    ];
    assert.equal(findOverlappingIndexes(recs).length, 0);
  });
});

describe("rankSeqScanCandidates", () => {
  const rows = [
    {
      schemaName: "public",
      tableName: "small",
      seqScans: 1000,
      idxScans: 0,
      liveRows: 50,
      tableSizeBytes: 1024,
    },
    {
      schemaName: "public",
      tableName: "heavy_seq",
      seqScans: 5000,
      idxScans: 100,
      liveRows: 10_000,
      tableSizeBytes: 1024,
    },
    {
      schemaName: "public",
      tableName: "balanced",
      seqScans: 100,
      idxScans: 100_000,
      liveRows: 10_000,
      tableSizeBytes: 1024,
    },
  ];

  it("drops tables with fewer than minRows live rows", () => {
    const out = rankSeqScanCandidates(rows, { minRows: 1000 });
    assert.ok(out.every((r) => r.tableName !== "small"));
  });

  it("drops tables with healthy seq/idx ratio", () => {
    const out = rankSeqScanCandidates(rows);
    assert.ok(out.every((r) => r.tableName !== "balanced"));
  });

  it("keeps tables that exceed the seq/idx threshold", () => {
    const out = rankSeqScanCandidates(rows);
    assert.equal(out[0].tableName, "heavy_seq");
  });

  it("honours topN", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...rows[1],
      tableName: `t${i}`,
      seqScans: 5000 + i,
    }));
    const out = rankSeqScanCandidates(many, { topN: 2 });
    assert.equal(out.length, 2);
  });
});

describe("rankUnusedIndexCandidates", () => {
  const rows = [
    {
      schemaName: "public",
      tableName: "t",
      indexName: "uniq_idx",
      idxScans: 0,
      indexSizeBytes: 4096,
      isUnique: true,
      isPrimary: false,
    },
    {
      schemaName: "public",
      tableName: "t",
      indexName: "pk_idx",
      idxScans: 0,
      indexSizeBytes: 4096,
      isUnique: true,
      isPrimary: true,
    },
    {
      schemaName: "public",
      tableName: "t",
      indexName: "unused_btree",
      idxScans: 0,
      indexSizeBytes: 16384,
      isUnique: false,
      isPrimary: false,
    },
    {
      schemaName: "public",
      tableName: "t",
      indexName: "active_idx",
      idxScans: 42,
      indexSizeBytes: 4096,
      isUnique: false,
      isPrimary: false,
    },
  ];

  it("excludes UNIQUE and PRIMARY indexes", () => {
    const out = rankUnusedIndexCandidates(rows);
    assert.ok(out.every((r) => !r.isUnique && !r.isPrimary));
  });

  it("excludes indexes whose idxScans exceed the threshold", () => {
    const out = rankUnusedIndexCandidates(rows);
    assert.ok(out.every((r) => r.idxScans === 0));
  });

  it("sorts largest waste first", () => {
    const out = rankUnusedIndexCandidates(rows);
    assert.equal(out[0].indexName, "unused_btree");
  });
});

describe("renderMarkdownReport", () => {
  it("includes the redacted connection string in the header", () => {
    const md = renderMarkdownReport({
      generatedAt: new Date("2026-05-13T00:00:00Z"),
      connection: "postgresql://***@host/db",
      seqScanCandidates: [],
      unusedIndexCandidates: [],
      overlappingIndexes: [],
    });
    assert.ok(md.includes("postgresql://***@host/db"));
    assert.ok(md.includes("# DB index audit — 2026-05-13"));
  });

  it("renders empty-state placeholder when no rows present", () => {
    const md = renderMarkdownReport({
      generatedAt: new Date("2026-05-13T00:00:00Z"),
      connection: "x",
      seqScanCandidates: [],
      unusedIndexCandidates: [],
      overlappingIndexes: [],
    });
    assert.ok(md.includes("_No tables matched the threshold._"));
    assert.ok(md.includes("_No unused indexes found._"));
    assert.ok(md.includes("_No overlapping indexes found._"));
  });

  it("renders a row per candidate", () => {
    const md = renderMarkdownReport({
      generatedAt: new Date("2026-05-13T00:00:00Z"),
      connection: "x",
      seqScanCandidates: [
        {
          schemaName: "public",
          tableName: "heavy_seq",
          seqScans: 5000,
          idxScans: 100,
          liveRows: 10_000,
          tableSizeBytes: 1024,
        },
      ],
      unusedIndexCandidates: [
        {
          tableName: "t",
          indexName: "unused_btree",
          idxScans: 0,
          indexSizeBytes: 4096,
        },
      ],
      overlappingIndexes: [
        {
          shorter: {
            schemaName: "public",
            tableName: "tx",
            indexName: "i_a",
            columnNames: ["user_id"],
          },
          longer: {
            schemaName: "public",
            tableName: "tx",
            indexName: "i_b",
            columnNames: ["user_id", "created_at"],
          },
        },
      ],
    });
    assert.ok(md.includes("`public.heavy_seq`"));
    assert.ok(md.includes("`unused_btree`"));
    assert.ok(md.includes("`i_a`"));
    assert.ok(md.includes("`i_b`"));
  });

  it("links back to the runbook two-phase DROP section for drop candidates", () => {
    const md = renderMarkdownReport({
      generatedAt: new Date("2026-05-13T00:00:00Z"),
      connection: "x",
      seqScanCandidates: [],
      unusedIndexCandidates: [],
      overlappingIndexes: [],
    });
    assert.ok(md.includes("operations-runbook.md#82-two-phase-drop-authoring"));
  });
});
