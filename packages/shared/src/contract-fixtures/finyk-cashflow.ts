/**
 * Canonical fixtures for `GET /api/mono/transactions` — the **finyk cashflow**
 * feed that drives the Finyk transactions list (cursor-paginated, filtered by
 * `from`/`to`/`accountId`).
 *
 * The route lives in `apps/server/src/routes/banks.ts` (mounted under
 * `/api/mono`), handled by `apps/server/src/modules/mono/read.ts`
 * (`transactionsHandler`). Both sides derive their types from
 * `MonoTransactionDtoSchema` / `MonoTransactionsPageSchema` in
 * `packages/shared/src/schemas/api.ts` — so the fixtures below are
 * regression-protection for AGENTS.md Hard Rule #3 (server response
 * shape ↔ api-client types ↔ test).
 *
 * BIGINT NOTE: `amount`, `operationAmount`, `cashbackAmount`,
 * `commissionRate`, and `balance` originate as Monobank minor-unit
 * integers (kopecks for UAH). The DB stores them in `int8` (bigint)
 * columns; `normalizeMonoTransaction()` in
 * `apps/server/src/lib/normalizers/mono.ts` coerces every one of them
 * to JavaScript `number` via `Number()` before serialisation (Hard
 * Rule #1). Fixtures use `number`, never `string`.
 *
 * Named cases:
 *
 * - `singleExpense` — one debit transaction with full fields, positive
 *   `cashbackAmount`, no cursor (last page).
 * - `singleIncome` — one credit (salary / incoming transfer); MCC /
 *   hold / cashback all null (not applicable to credits).
 * - `twoTransactionsWithCursor` — two-item page with a non-null
 *   `nextCursor` (more pages available); exercises both the pagination
 *   envelope and the cursor format `<time>:<monoTxId>`.
 * - `emptyPage` — `{ data: [], nextCursor: null }` — valid 200 when
 *   the requested date range has no transactions.
 *
 * Closes contract slice T-2 from
 * `docs/planning/pr-plan-testing-devx-2026-05.md`.
 */

import {
  MonoTransactionsPageSchema,
  type MonoTransactionsPage,
} from "../schemas/api";

export const finykCashflowFixtures = {
  singleExpense: {
    data: [
      {
        userId: "user-pact-001",
        monoAccountId: "acct-pact-001",
        monoTxId: "tx-pact-0001",
        time: "2026-05-12T18:42:11.000Z",
        // bigint coerced to number (Hard Rule #1)
        amount: -12345,
        operationAmount: -12345,
        currencyCode: 980,
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        description: "ATB Market",
        comment: null,
        cashbackAmount: 123,
        commissionRate: 0,
        balance: 4567890,
        receiptId: null,
        invoiceId: null,
        counterEdrpou: null,
        counterIban: null,
        counterName: null,
        categorySlug: "groceries",
        categoryOverridden: false,
        source: "webhook",
        receivedAt: "2026-05-12T18:42:12.500Z",
      },
    ],
    nextCursor: null,
  },
  singleIncome: {
    data: [
      {
        userId: "user-pact-001",
        monoAccountId: "acct-pact-001",
        monoTxId: "tx-pact-0002",
        time: "2026-05-11T09:14:00.000Z",
        // bigint coerced to number (Hard Rule #1)
        amount: 100000,
        operationAmount: 100000,
        currencyCode: 980,
        mcc: null,
        originalMcc: null,
        hold: null,
        description: "Salary",
        comment: null,
        cashbackAmount: null,
        commissionRate: null,
        balance: 4680235,
        receiptId: null,
        invoiceId: null,
        counterEdrpou: null,
        counterIban: null,
        counterName: null,
        categorySlug: null,
        categoryOverridden: false,
        source: "webhook",
        receivedAt: "2026-05-11T09:14:01.250Z",
      },
    ],
    nextCursor: null,
  },
  twoTransactionsWithCursor: {
    data: [
      {
        userId: "user-pact-001",
        monoAccountId: "acct-pact-001",
        monoTxId: "tx-pact-0003",
        time: "2026-05-13T12:00:00.000Z",
        amount: -8900,
        operationAmount: -8900,
        currencyCode: 980,
        mcc: 5812,
        originalMcc: 5812,
        hold: false,
        description: "McDonald's",
        comment: null,
        cashbackAmount: 89,
        commissionRate: 0,
        balance: 4559100,
        receiptId: null,
        invoiceId: null,
        counterEdrpou: null,
        counterIban: null,
        counterName: null,
        categorySlug: "restaurant",
        categoryOverridden: false,
        source: "webhook",
        receivedAt: "2026-05-13T12:00:01.000Z",
      },
      {
        userId: "user-pact-001",
        monoAccountId: "acct-pact-001",
        monoTxId: "tx-pact-0004",
        time: "2026-05-13T09:30:00.000Z",
        amount: -3200,
        operationAmount: -3200,
        currencyCode: 980,
        mcc: 5912,
        originalMcc: 5912,
        hold: false,
        description: "Аптека Лекхім",
        comment: null,
        cashbackAmount: null,
        commissionRate: null,
        balance: 4562300,
        receiptId: null,
        invoiceId: null,
        counterEdrpou: null,
        counterIban: null,
        counterName: null,
        categorySlug: "health",
        categoryOverridden: false,
        source: "webhook",
        receivedAt: "2026-05-13T09:30:00.500Z",
      },
    ],
    // Cursor format: <time>:<monoTxId> of the last item in the page
    nextCursor: "2026-05-13T09:30:00.000Z:tx-pact-0004",
  },
  emptyPage: {
    data: [],
    nextCursor: null,
  },
} as const satisfies Record<string, MonoTransactionsPage>;

export type FinykCashflowFixtureCase = keyof typeof finykCashflowFixtures;

/**
 * Same fixtures typed as `unknown` — feed these to the schema `safeParse()`
 * path to exercise the runtime parser. The `as const satisfies …` shape above
 * proves the static types are valid; the `unknown` view proves the schema
 * accepts the JSON.
 */
export const finykCashflowRawFixtures: Record<
  FinykCashflowFixtureCase,
  unknown
> = finykCashflowFixtures;

/**
 * Cheap self-check: every named fixture must parse through its schema.
 * Mirrors `assertFoodSearchFixturesValid()` so consumer and producer test
 * suites can both call this before relying on the wire shape.
 */
export function assertFinykCashflowFixturesValid(): void {
  for (const [name, fixture] of Object.entries(finykCashflowFixtures)) {
    const result = MonoTransactionsPageSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "finyk-cashflow.${name}" no longer matches MonoTransactionsPageSchema: ${result.error.message}`,
      );
    }
    // Hard Rule #1 — bigint coercion: ensure money fields are numbers on the wire.
    for (const tx of fixture.data) {
      if (typeof tx.amount !== "number") {
        throw new Error(
          `Contract fixture "finyk-cashflow.${name}": tx.amount must be a number (Hard Rule #1 — bigint coercion)`,
        );
      }
      if (typeof tx.operationAmount !== "number") {
        throw new Error(
          `Contract fixture "finyk-cashflow.${name}": tx.operationAmount must be a number (Hard Rule #1)`,
        );
      }
      if (tx.balance !== null && typeof tx.balance !== "number") {
        throw new Error(
          `Contract fixture "finyk-cashflow.${name}": tx.balance must be number or null (Hard Rule #1)`,
        );
      }
    }
  }
}
