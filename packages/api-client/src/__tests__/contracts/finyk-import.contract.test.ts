// @vitest-environment node
//
// Consumer contract: `POST /api/v1/finyk/import/screenshot/analyze`,
// `POST /api/v1/finyk/import/statement/preview`,
// `POST /api/v1/finyk/import/commit`,
// `GET`/`DELETE /api/v1/finyk/import/batches/{id}` — bulk transaction
// import ("Масове ведення", finyk persona): a banking-app screenshot or a
// bank-statement CSV produces draft rows, the user bulk-edits them on a
// review screen, then commits them into an undo-able batch.
//
// Why this contract: this is the FIRST Pact coverage for the bulk-import
// domain. It locks:
//
//   - `statement/preview`'s TWO structurally different response shapes,
//     discriminated by `needsMapping` — `false` carries `profile`/`rows`/
//     `skipped`, `true` carries `headers`/`sampleRows` instead (both
//     `rows`/`skipped` present-but-empty). A hand-written mock that only
//     covers one branch would leave the manual column-mapper UI
//     completely unverified.
//   - `screenshot/analyze` 413 uses the SAME non-standard error envelope
//     as `receipts/analyze` 415 (`packages/api-client/src/__tests__/
//     contracts/finyk-receipts.contract.test.ts`) — this interaction
//     exercises the `TOO_LARGE` variant specifically (no `declared_mime`/
//     `detected_mime`), the sibling of that file's `MAGIC_MISMATCH`
//     variant, together covering both branches of the discriminated
//     union.
//   - `import_batches.id` is a `pg` BIGSERIAL column coerced to `number`
//     server-side (Hard Rule #1) — asserted via `typeof`.
//
// Schemas live in `@sergeant/shared` (`ImportScreenshotAnalyzeResponseSchema`,
// `ImportStatementPreviewResponseSchema`, `ImportCommitResponseSchema`,
// `ImportBatchGetResponseSchema`, `ImportBatchUndoResponseSchema`),
// re-exported verbatim by `packages/api-client/src/endpoints/
// finykImport.ts` — no hand-redeclared shapes (Hard Rule #3). Server
// serializers verified read-only against
// `apps/server/src/modules/finyk/import/{screenshotAnalyze,
// statementPreview,commit,batches,serialize}.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createFinykImportEndpoints } from "../../endpoints/finykImport";
import { isApiError } from "../../ApiError";
import { isImageValidationErrorBody } from "../../endpoints/imageValidationError";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

/**
 * Стаб «завеликого» зображення для 413-інтеракції. НЕ реальні 6.9M
 * символів (раунд 5 ревʼю PR #818): точний литерал записувався в
 * згенерований pact-файл і роздував його до ~7MB У РЕПО. Pact-мок
 * декларативний — 413-конверт відтворюється без реального розміру тіла;
 * реальний поріг validateImageBase64 покритий юніт-тестами server-а
 * (analyze.test.ts / screenshotAnalyze), а provider-реплей цієї
 * інтеракції — свідомий it.todo-gap у provider.test.ts.
 */
const OVERSIZED_IMAGE_STUB = "c".repeat(200);

describe(
  "contract @ POST /api/v1/finyk/import/screenshot/analyze",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns a bank_screenshot draft with expense/income rows", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; vision provider recognises a monobank screenshot",
        )
        .uponReceiving("a POST /api/v1/finyk/import/screenshot/analyze request")
        .withRequest(
          "POST",
          "/api/v1/finyk/import/screenshot/analyze",
          (req) => {
            req.headers({
              accept: "application/json",
              "content-type": "application/json",
            });
            req.jsonBody({
              image_base64: "b".repeat(200),
              mime_type: "image/png",
            });
          },
        )
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            draft: {
              docType: "bank_screenshot",
              bank: "monobank",
              rows: [
                {
                  date: "2026-01-15",
                  time: "14:32",
                  amountKopiykas: 15000,
                  direction: "expense",
                  description: "Сільпо",
                  confidence: 0.9,
                },
                {
                  date: "2026-01-16",
                  time: null,
                  amountKopiykas: 500000,
                  direction: "income",
                  description: "Зарплата",
                  confidence: 0.75,
                },
              ],
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);
          const out = await imports.analyzeImportScreenshot({
            image_base64: "b".repeat(200),
            mime_type: "image/png",
          });

          expect(out.draft.docType).toBe("bank_screenshot");
          expect(out.draft.bank).toBe("monobank");
          expect(out.draft.rows).toHaveLength(2);
          expect(out.draft.rows[1]!.time).toBeNull();
          // Hard Rule #1 sibling: money fields are `number`.
          expect(typeof out.draft.rows[0]!.amountKopiykas).toBe("number");
          expect(out.draft.rows[0]!.amountKopiykas).toBe(15000);
        });
    });

    it("413s with the non-standard image-validation envelope on an oversized image", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; uploaded image decodes to more than 5MB",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/import/screenshot/analyze request (payload too large)",
        )
        .withRequest(
          "POST",
          "/api/v1/finyk/import/screenshot/analyze",
          (req) => {
            req.headers({
              accept: "application/json",
              "content-type": "application/json",
            });
            req.jsonBody({
              image_base64: OVERSIZED_IMAGE_STUB,
              mime_type: "image/png",
            });
          },
        )
        .willRespondWith(413, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            code: "TOO_LARGE",
            detail: "Decoded image is 6000000 bytes; max allowed 5242880",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);

          let caught: unknown;
          try {
            await imports.analyzeImportScreenshot({
              image_base64: OVERSIZED_IMAGE_STUB,
              mime_type: "image/png",
            });
          } catch (err) {
            caught = err;
          }

          expect(isApiError(caught)).toBe(true);
          if (!isApiError(caught)) return;
          expect(caught.status).toBe(413);
          // NOT the standard envelope — no top-level `error`/`message`.
          expect(caught.serverMessage).toBeUndefined();
          const body = caught.body;
          expect(isImageValidationErrorBody(body)).toBe(true);
          if (isImageValidationErrorBody(body)) {
            expect(body.code).toBe("TOO_LARGE");
            // TOO_LARGE never carries declared_mime/detected_mime — only
            // MAGIC_MISMATCH does.
            expect("declared_mime" in body).toBe(false);
          }
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/finyk/import/statement/preview",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("auto-detects the mono profile and classifies rows", async () => {
      const monoCsv = [
        "Дата i час операції,Деталі операції,МСС,Сума в валюті картки (UAH),Сума в валюті операції,Валюта операції,Курс обміну,Сума комісій (UAH),Сума кешбеку (UAH),Залишок після операції",
        "15.01.2026 14:32:10,Сільпо,5411,-847.50,-847.50,UAH,1,0.00,8.47,5000.00",
      ].join("\n");

      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; CSV header matches the mono export format",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/import/statement/preview request (mono autoprofile)",
        )
        .withRequest(
          "POST",
          "/api/v1/finyk/import/statement/preview",
          (req) => {
            req.headers({
              accept: "application/json",
              "content-type": "application/json",
            });
            req.jsonBody({ csv_text: monoCsv });
          },
        )
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            profile: "mono",
            needsMapping: false,
            rows: [
              {
                date: "2026-01-15",
                amountKopiykas: 84750,
                direction: "expense",
                description: "Сільпо",
              },
            ],
            skipped: [],
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);
          const out = await imports.previewImportStatement({
            csv_text: monoCsv,
          });

          expect(out.profile).toBe("mono");
          expect(out.needsMapping).toBe(false);
          expect(out.headers).toBeUndefined();
          expect(out.rows).toHaveLength(1);
          expect(typeof out.rows[0]!.amountKopiykas).toBe("number");
          expect(out.rows[0]!.direction).toBe("expense");
        });
    });

    it("needsMapping:true with headers/sampleRows for an unrecognised CSV format", async () => {
      const customCsv = [
        "Custom Date,Custom Amount,Custom Note",
        "2026-01-15,-100.00,Test",
      ].join("\n");

      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; CSV header matches no known bank profile",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/import/statement/preview request (unrecognised format)",
        )
        .withRequest(
          "POST",
          "/api/v1/finyk/import/statement/preview",
          (req) => {
            req.headers({
              accept: "application/json",
              "content-type": "application/json",
            });
            req.jsonBody({ csv_text: customCsv });
          },
        )
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            profile: null,
            needsMapping: true,
            headers: ["Custom Date", "Custom Amount", "Custom Note"],
            sampleRows: [["2026-01-15", "-100.00", "Test"]],
            rows: [],
            skipped: [],
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);
          const out = await imports.previewImportStatement({
            csv_text: customCsv,
          });

          expect(out.profile).toBeNull();
          expect(out.needsMapping).toBe(true);
          expect(out.headers).toEqual([
            "Custom Date",
            "Custom Amount",
            "Custom Note",
          ]);
          expect(out.sampleRows).toEqual([["2026-01-15", "-100.00", "Test"]]);
          expect(out.rows).toEqual([]);
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/finyk/import/commit",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("commits rows into a new batch (some skipped as mono-matched/duplicate)", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; 3 rows submitted, 1 matches an existing mono transaction",
        )
        .uponReceiving("a POST /api/v1/finyk/import/commit request")
        .withRequest("POST", "/api/v1/finyk/import/commit", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            source: "bank_statement",
            rows: [
              {
                date: "2026-01-15",
                amountKopiykas: 84750,
                direction: "expense",
                description: "Сільпо",
                category: "food",
              },
              {
                date: "2026-01-16",
                amountKopiykas: 1500000,
                direction: "income",
                description: "Зарплата",
                category: "salary",
              },
              {
                date: "2026-01-16",
                amountKopiykas: 20000,
                direction: "expense",
                description: "АЗС",
                category: "transport",
              },
            ],
          });
        })
        .willRespondWith(201, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            batchId: 88,
            created: 2,
            linked: 0,
            skipped: { monoMatched: 1, duplicate: 0 },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);
          const out = await imports.commitImport({
            source: "bank_statement",
            rows: [
              {
                date: "2026-01-15",
                amountKopiykas: 84750,
                direction: "expense",
                description: "Сільпо",
                category: "food",
              },
              {
                date: "2026-01-16",
                amountKopiykas: 1500000,
                direction: "income",
                description: "Зарплата",
                category: "salary",
              },
              {
                date: "2026-01-16",
                amountKopiykas: 20000,
                direction: "expense",
                description: "АЗС",
                category: "transport",
              },
            ],
          });

          expect(typeof out.batchId).toBe("number");
          expect(out.batchId).toBe(88);
          expect(out.created).toBe(2);
          expect(out.linked).toBe(0);
          expect(out.skipped).toEqual({ monoMatched: 1, duplicate: 0 });
        });
    });
  },
);

describe(
  "contract @ GET /api/v1/finyk/import/batches/{id}",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns the batch status/summary", async () => {
      await pact
        .addInteraction()
        .given("authenticated user-pact-001 owns import batch 88")
        .uponReceiving("a GET /api/v1/finyk/import/batches/88 request")
        .withRequest("GET", "/api/v1/finyk/import/batches/88", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            batch: {
              id: 88,
              source: "bank_statement",
              status: "completed",
              rowsTotal: 3,
              rowsCreated: 2,
              rowsLinked: 0,
              rowsSkipped: 1,
              createdRowIds: ["imp88:abc", "imp88:def"],
              createdAt: "2026-01-16T10:00:00.000Z",
              updatedAt: "2026-01-16T10:00:00.000Z",
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);
          const out = await imports.getImportBatch(88);

          expect(out.batch.status).toBe("completed");
          expect(typeof out.batch.id).toBe("number");
          expect(out.batch.createdRowIds).toEqual(["imp88:abc", "imp88:def"]);
        });
    });
  },
);

describe(
  "contract @ DELETE /api/v1/finyk/import/batches/{id}",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("undoes the batch, tombstoning its created rows", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001 owns import batch 88 (completed, 2 created rows)",
        )
        .uponReceiving("a DELETE /api/v1/finyk/import/batches/88 request")
        .withRequest("DELETE", "/api/v1/finyk/import/batches/88", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            batch: {
              id: 88,
              source: "bank_statement",
              status: "undone",
              rowsTotal: 3,
              rowsCreated: 2,
              rowsLinked: 0,
              rowsSkipped: 1,
              createdRowIds: ["imp88:abc", "imp88:def"],
              createdAt: "2026-01-16T10:00:00.000Z",
              updatedAt: "2026-01-16T10:05:00.000Z",
            },
            tombstoned: 2,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const imports = createFinykImportEndpoints(http);
          const out = await imports.deleteImportBatch(88);

          expect(out.batch.status).toBe("undone");
          expect(out.tombstoned).toBe(2);
          expect(typeof out.tombstoned).toBe("number");
        });
    });
  },
);
