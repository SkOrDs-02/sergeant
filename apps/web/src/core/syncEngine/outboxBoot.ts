/**
 * Pure classifier for the routine-module sync outbox boot path.
 *
 * The boot path in `singleton.ts → createDefaultRuntime` does three
 * things in order: snapshot the on-disk schema, run
 * `repairPartialOutboxMigration` (idempotent self-heal for the
 * SERGEANT-WEB-A / post-002 corruption shape), then run
 * `ROUTINE_CLIENT_MIGRATIONS`. The runtime can therefore land in one
 * of three healthy outcomes — and we want each surfaced as a Sentry
 * tag (`outbox.boot.outcome`) so the saved-search filter stays
 * grep-able if the regression ever recurs.
 *
 * This helper is pure on purpose: the real boot is hard to unit-test
 * (it lazy-imports half a dozen modules and depends on a live
 * sqlite-wasm DB), but the classification logic is the bit most
 * likely to drift, so it sits in its own file with its own tests.
 */
export type OutboxBootOutcome =
  | "fresh"
  | "already_present"
  | "repaired"
  | "failed";

export interface ClassifyOutboxBootArgs {
  /** `sync_op_outbox` was visible in `sqlite_master` *before* repair. */
  readonly hadOutbox: boolean;
  /** `repairPartialOutboxMigration` returned `recovered: true`. */
  readonly recovered: boolean;
}

/**
 * Classify the post-success boot path. Failures are tagged
 * `"failed"` by the catch arm in `createDefaultRuntime` directly —
 * this helper is only ever called once we know migrations converged.
 */
export function classifyOutboxBootOutcome(
  args: ClassifyOutboxBootArgs,
): Exclude<OutboxBootOutcome, "failed"> {
  if (args.recovered) return "repaired";
  if (args.hadOutbox) return "already_present";
  return "fresh";
}
