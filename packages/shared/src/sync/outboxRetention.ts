/**
 * Boot-time TTL sweep orchestration for the client-side
 * `sync_op_outbox` dead-letter / rejected / quarantined buckets.
 *
 * The data-layer purge lives in
 * `@sergeant/db-schema/sqlite` (`purgeStaleTerminalOutbox`); this module
 * is the cross-platform glue that the web and mobile sync-engine
 * singletons call once at boot. It is intentionally storage-agnostic —
 * the actual SQL is injected via `purge` so this file pulls in neither
 * `@sergeant/db-schema` nor any DOM / React Native API and stays unit-
 * testable with plain mocks.
 *
 * Why it surfaces a breadcrumb rather than a metric: client-side bucket
 * counts have no direct Prometheus path, so the sync-engine singletons
 * already follow a "breadcrumb → Grafana counter" pattern (see the
 * `sync_op_outbox.quarantine` breadcrumb in
 * `apps/{web,mobile}/src/core/syncEngine/singleton.ts`). This sweep
 * mirrors it with `sync_op_outbox.retention`, so the dead-letter purge
 * volume per boot is chartable through the existing pipeline.
 */

export interface OutboxRetentionBreadcrumb {
  readonly category: string;
  readonly level: "info" | "warning" | "error";
  readonly message: string;
}

export interface SweepStaleOutboxDeps {
  /**
   * Bound purge call — typically
   * `() => purgeStaleTerminalOutbox(client, { olderThanDays })`. Must
   * resolve to the number of rows it deleted.
   */
  readonly purge: () => Promise<{ readonly purged: number }>;
  /** Sentry breadcrumb sink (web/mobile observability adapter). */
  readonly addBreadcrumb: (breadcrumb: OutboxRetentionBreadcrumb) => void;
  /**
   * Error sink. Retention is best-effort maintenance and must never
   * block sync-engine boot, so any purge failure is routed here and
   * swallowed rather than thrown.
   */
  readonly captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
  ) => void;
}

/**
 * Run the client-side outbox retention sweep once and surface the
 * outcome as a `sync_op_outbox.retention` breadcrumb when anything was
 * purged.
 *
 * Total + non-throwing by contract: returns the number of rows purged
 * (`0` on a no-op or on error). A purge error is forwarded to
 * `captureException` (scope `sync-outbox-retention`) and swallowed so
 * the caller's boot path is never interrupted by maintenance work.
 */
export async function sweepStaleTerminalOutbox(
  deps: SweepStaleOutboxDeps,
): Promise<number> {
  try {
    const { purged } = await deps.purge();
    if (purged > 0) {
      deps.addBreadcrumb({
        category: "sync",
        level: "info",
        message: `sync_op_outbox.retention purged=${purged}`,
      });
    }
    return purged;
  } catch (error) {
    deps.captureException?.(error, { scope: "sync-outbox-retention" });
    return 0;
  }
}
