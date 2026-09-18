import { monoWebhookApi, type MonoTransactionDto } from "@shared/api";

const PAGE_LIMIT = 200;
// 50 pages × 200 items = 10 000 — same upper bound as legacy
// Monobank statement API window. Захист від нескінченного циклу
// якщо сервер раптом поверне сам себе як `nextCursor`.
const MAX_PAGES = 50;

export interface MonoTransactionsRange {
  from?: string | undefined;
  to?: string | undefined;
  accountId?: string | undefined;
}

/**
 * Fetches all transactions for the given range by following the
 * `nextCursor` pagination of `GET /api/mono/transactions`. Server caps
 * `limit` at 200 (default 50) — without cursor consumption a user with
 * >50 tx/місяць silently втрачав видимість старіших операцій.
 *
 * Returns a flat array sorted server-side by `(time DESC, monoTxId DESC)`.
 */
export async function fetchAllMonoTransactions(
  params: MonoTransactionsRange,
  opts?: { signal?: AbortSignal },
): Promise<MonoTransactionDto[]> {
  const all: MonoTransactionDto[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await monoWebhookApi.transactions(
      {
        limit: PAGE_LIMIT,
        ...(params.from !== undefined ? { from: params.from } : {}),
        ...(params.to !== undefined ? { to: params.to } : {}),
        ...(params.accountId !== undefined
          ? { accountId: params.accountId }
          : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      },
      { ...(opts?.signal !== undefined ? { signal: opts.signal } : {}) },
    );
    if (result.data.length > 0) all.push(...result.data);
    if (!result.nextCursor) return all;
    cursor = result.nextCursor;
  }

  return all;
}
