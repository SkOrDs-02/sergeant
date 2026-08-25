import type { PoolClient } from "pg";

import type { SyncV2Op } from "../../../../http/schemas.js";

/**
 * Спільний харнес для колокованих поведінкових тестів fizruk-апплаєрів
 * (`applySync.test.ts`, `applyMisc.test.ts`, `applyInjuries.test.ts`).
 *
 * Живе під `__tests__/`, а не поруч у `fizruk/`, з двох причин: vitest
 * підбирає лише `src/**\/*.test.ts` (див. `vitest.config.ts`), тож файл
 * без цього суфікса в test-run не потрапляє сам по собі; а
 * `sergeant-design/no-strict-bypass` звільняє від заборони на
 * `as unknown as X` лише `*.test.{js,ts}` і `__tests__/**` — фейковому
 * `pg`-клієнту потрібен саме такий каст.
 */
export interface RecordedQuery {
  sql: string;
  params: unknown[];
}

export class FakeClient {
  readonly queries: RecordedQuery[] = [];
  private readonly queuedRows: unknown[][] = [];

  queueRows(rows: unknown[]): void {
    this.queuedRows.push(rows);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ sql, params });
    if (/^\s*SELECT\b/i.test(sql)) {
      return { rows: (this.queuedRows.shift() ?? []) as T[] };
    }
    return { rows: [] };
  }
}

export function asClient(fake: FakeClient): PoolClient {
  return fake as unknown as PoolClient;
}

export function syncOp(
  table: string,
  kind: SyncV2Op["op"],
  row: Record<string, unknown>,
): SyncV2Op {
  return { op: kind, table, row } as SyncV2Op;
}

export function lastQuery(fake: FakeClient): RecordedQuery {
  const query = fake.queries[fake.queries.length - 1];
  if (!query) throw new Error("expected a recorded query");
  return query;
}
