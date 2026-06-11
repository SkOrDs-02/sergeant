// @vitest-environment jsdom
//
// Contract-fixture coverage for the `finyk` endpoint module (Hard Rule #3):
//
//  - `createManualExpense()` POSTs to `/api/v1/finyk/manual-expenses` and
//    round-trips the serialized expense through the canonical zod schema.
//    The matching server-side serializer lives in
//    `apps/server/src/modules/finyk/manualExpenses.ts#serializeManualExpense`.
//  - The schema rejects malformed responses (missing expense fields, hryvnia
//    floats leaking instead of kopiyka integers) so a server regression
//    surfaces as a parse error at the boundary, not NaN further down.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../httpClient";
import { firstCall } from "../__test-utils/firstCall";
import {
  ManualExpenseCreateResponseBodySchema,
  createFinykEndpoints,
} from "./finyk";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function mockFetchOnce(body: unknown): FetchMock {
  const fn = vi.fn(async () => jsonResponse(body));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const EXPENSE_FIXTURE = {
  ok: true,
  expense: {
    id: "0b7e6c3a-7e0f-4b59-9b39-2f4f7f6f9d11",
    amountKopiykas: 12000,
    category: "food",
    date: "2026-06-11",
    note: "кава",
    createdAt: "2026-06-11T10:00:00.000Z",
    updatedAt: "2026-06-11T10:00:00.000Z",
  },
};

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createFinykEndpoints.createManualExpense", () => {
  it("POSTs /api/v1/finyk/manual-expenses and returns the parsed expense", async () => {
    const fetchMock = mockFetchOnce(EXPENSE_FIXTURE);

    const http = createHttpClient({ baseUrl: "https://api.example.com" });
    const finyk = createFinykEndpoints(http);
    const res = await finyk.createManualExpense({
      amount: 12000,
      category: "food",
      note: "кава",
    });

    expect(res).toEqual(EXPENSE_FIXTURE);

    const [url, init] = firstCall(fetchMock);
    expect(String(url)).toBe(
      "https://api.example.com/api/v1/finyk/manual-expenses",
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      amount: 12000,
      category: "food",
      note: "кава",
    });
  });

  it("rejects malformed responses via the canonical schema", () => {
    // Server contract regression-guard: dropping a field or leaking hryvnia
    // floats instead of kopiyka integers must blow up at the boundary.
    expect(() =>
      ManualExpenseCreateResponseBodySchema.parse({ ok: true }),
    ).toThrow();
    expect(() =>
      ManualExpenseCreateResponseBodySchema.parse({
        ok: true,
        expense: { ...EXPENSE_FIXTURE.expense, amountKopiykas: 120.5 },
      }),
    ).toThrow();
    expect(() =>
      ManualExpenseCreateResponseBodySchema.parse({
        ok: true,
        expense: { ...EXPENSE_FIXTURE.expense, date: "11.06.2026" },
      }),
    ).toThrow();
  });
});
