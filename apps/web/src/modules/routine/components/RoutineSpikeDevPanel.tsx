/**
 * Routine SPIKE — dev-only metrics panel (web).
 *
 * Lives behind `feature.routine.sqlite_v2`. The settings section that
 * mounts it (see `apps/web/src/core/settings/RoutineSpikeSection.tsx`)
 * lazy-loads this module via `React.lazy`, so the SPIKE library and
 * sqlite-wasm chunk only ship when the flag is on. That keeps the
 * Stage 3 «bundle delta ≤ +5 KB when the flag is off» gate intact —
 * see `docs/notes/spikes/routine-sqlite-v2.md`.
 *
 * The panel exposes four manual actions plus a status block, each
 * wrapped in `performance.now()` brackets so the operator can read
 * latency for the decision-gate measurements:
 *
 *  - **Init / migrate**: lazy-load sqlite-wasm, install the OPFS-SAH
 *    Pool VFS, run `migrateRoutineSpike`, and run a first
 *    `listActiveRoutineEntries` so the «first-open SQLite latency
 *    ≤ 200 ms» metric is end-to-end.
 *  - **Record** / **Delete completion**: high-level mutations that
 *    write the row + enqueue the outbox op. Latency surfaces local
 *    SQLite write cost.
 *  - **Push** drains the outbox to `POST /v2/sync/push`. Counters
 *    report applied / duplicate / rejected ops.
 *  - **Pull** fetches `GET /v2/sync/pull?since=<cursor>` and applies
 *    via the per-table `applyPulled*` paths. Counters report applied
 *    vs LWW conflict outcomes.
 *
 * `originDeviceId` is generated once and persisted to localStorage so
 * the multi-device demo path is reproducible across reloads. The same
 * id flows through the `X-Origin-Device-Id` header on push/pull, which
 * is exactly what the server uses to suppress same-device echoes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiClient } from "@sergeant/api-client/react";
import type { ApiClient } from "@sergeant/api-client";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";

import { getSqliteDb } from "../../../core/db/sqlite";
import {
  deleteRoutineCompletion,
  listActiveRoutineEntries,
  listPendingOutboxOps,
  migrateRoutineSpike,
  pullSince,
  pushPendingOutbox,
  recordRoutineCompletion,
  type PullResult,
  type PushResult,
  type SpikeSqliteClient,
} from "../lib/sqliteSpike";

const ORIGIN_DEVICE_ID_KEY = "routine_spike_origin_device_id";
const SPIKE_DEV_USER_ID = "spike-dev-user";
const SPIKE_DEV_HABIT_NAME = "SPIKE dev habit";

type Status = "idle" | "running" | "ok" | "error";

interface ActionLogLine {
  readonly key: string;
  readonly label: string;
  readonly status: Status;
  readonly latencyMs: number | null;
  readonly detail: string | null;
}

interface VfsInfo {
  readonly vfs: string;
  readonly crossOriginIsolated: boolean;
}

function readOrCreateOriginDeviceId(): string {
  if (typeof window === "undefined") return "ssr-dev-device";
  const existing = safeReadStringLS(ORIGIN_DEVICE_ID_KEY);
  if (existing && existing.length > 0) return existing;
  const next = newDeviceId();
  safeWriteLS(ORIGIN_DEVICE_ID_KEY, next);
  return next;
}

function newDeviceId(): string {
  const cryptoApi: { randomUUID?: () => string } | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `dev-${cryptoApi.randomUUID()}`;
  }
  // Non-crypto fallback — fine for a dev-only panel id.
  const rand = Math.random().toString(36).slice(2, 10);
  return `dev-${Date.now().toString(36)}-${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function describePush(result: PushResult): string {
  return (
    `attempted=${result.attempted} ` +
    `applied=${result.applied} dup=${result.duplicates} ` +
    `rejected=${result.rejected} ` +
    `lastOpId=${result.lastOpId ?? "—"}`
  );
}

function describePull(result: PullResult): string {
  return (
    `applied=${result.applied} ` +
    `conflicts=${result.conflicts} ` +
    `cursor=${result.cursor ?? "—"}`
  );
}

interface SpikeRuntime {
  readonly client: SpikeSqliteClient;
  readonly vfs: VfsInfo;
}

async function bootstrapSpikeRuntime(): Promise<SpikeRuntime> {
  const handle = await getSqliteDb();
  const client = handle.migrationClient();
  await migrateRoutineSpike(client);
  // Touch a SELECT so the «first-open» metric covers the full
  // open → migrate → first-read path.
  await listActiveRoutineEntries(client, SPIKE_DEV_USER_ID);
  return {
    client,
    vfs: { vfs: handle.vfs, crossOriginIsolated: handle.crossOriginIsolated },
  };
}

interface ActionContext {
  readonly client: SpikeSqliteClient;
  readonly api: ApiClient;
  readonly originDeviceId: string;
  readonly lastEntryIdRef: React.MutableRefObject<string | null>;
}

async function runRecord(ctx: ActionContext): Promise<string> {
  const id = `spike-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const ts = nowIso();
  await recordRoutineCompletion(ctx.client, {
    id,
    userId: SPIKE_DEV_USER_ID,
    name: SPIKE_DEV_HABIT_NAME,
    completedAt: ts,
    clientTs: ts,
  });
  ctx.lastEntryIdRef.current = id;
  const pending = await listPendingOutboxOps(ctx.client, 200);
  return `id=${id.slice(-8)} pending=${pending.length}`;
}

async function runDelete(ctx: ActionContext): Promise<string> {
  const id = ctx.lastEntryIdRef.current;
  if (!id) {
    throw new Error("Спочатку додай запис кнопкою «Запис».");
  }
  const ts = nowIso();
  await deleteRoutineCompletion(ctx.client, {
    id,
    userId: SPIKE_DEV_USER_ID,
    clientTs: ts,
  });
  ctx.lastEntryIdRef.current = null;
  const pending = await listPendingOutboxOps(ctx.client, 200);
  return `id=${id.slice(-8)} pending=${pending.length}`;
}

async function runPush(ctx: ActionContext): Promise<string> {
  const result = await pushPendingOutbox(ctx.client, ctx.api.syncV2, {
    originDeviceId: ctx.originDeviceId,
  });
  return describePush(result);
}

async function runPull(ctx: ActionContext): Promise<string> {
  const result = await pullSince(ctx.client, ctx.api.syncV2, {
    originDeviceId: ctx.originDeviceId,
  });
  return describePull(result);
}

const ACTIONS = [
  { key: "record", label: "Запис тренування (insert)", run: runRecord },
  { key: "delete", label: "Видалити запис (soft-delete)", run: runDelete },
  { key: "push", label: "Push outbox → /v2/sync/push", run: runPush },
  { key: "pull", label: "Pull from /v2/sync/pull", run: runPull },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  run: (ctx: ActionContext) => Promise<string>;
}>;

export interface RoutineSpikeDevPanelProps {
  /**
   * Test-only escape hatch — lets vitest swap the SPIKE bootstrap so
   * specs can exercise the action wiring without spinning up
   * sqlite-wasm under jsdom.
   */
  readonly bootstrap?: () => Promise<SpikeRuntime>;
}

export function RoutineSpikeDevPanel({
  bootstrap = bootstrapSpikeRuntime,
}: RoutineSpikeDevPanelProps = {}) {
  const api = useApiClient();
  const [originDeviceId, setOriginDeviceId] = useState<string>("");
  const [vfs, setVfs] = useState<VfsInfo | null>(null);
  const [initStatus, setInitStatus] = useState<Status>("idle");
  const [initLatencyMs, setInitLatencyMs] = useState<number | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [log, setLog] = useState<readonly ActionLogLine[]>([]);
  const clientRef = useRef<SpikeSqliteClient | null>(null);
  const lastEntryIdRef = useRef<string | null>(null);

  useEffect(() => {
    setOriginDeviceId(readOrCreateOriginDeviceId());
  }, []);

  const handleInit = useCallback(async () => {
    setInitStatus("running");
    setInitError(null);
    const started = performance.now();
    try {
      const runtime = await bootstrap();
      clientRef.current = runtime.client;
      setVfs(runtime.vfs);
      setInitLatencyMs(performance.now() - started);
      setInitStatus("ok");
    } catch (err) {
      setInitLatencyMs(performance.now() - started);
      setInitError(err instanceof Error ? err.message : String(err));
      setInitStatus("error");
    }
  }, [bootstrap]);

  const handleRunAction = useCallback(
    async (action: (typeof ACTIONS)[number]) => {
      const client = clientRef.current;
      if (!client) {
        setLog((prev) => [
          {
            key: `${action.key}-${Date.now()}`,
            label: action.label,
            status: "error",
            latencyMs: null,
            detail: "Спочатку натисни «Init / migrate».",
          },
          ...prev,
        ]);
        return;
      }
      const placeholderKey = `${action.key}-${Date.now()}`;
      setLog((prev) => [
        {
          key: placeholderKey,
          label: action.label,
          status: "running",
          latencyMs: null,
          detail: null,
        },
        ...prev,
      ]);
      const started = performance.now();
      try {
        const detail = await action.run({
          client,
          api,
          originDeviceId,
          lastEntryIdRef,
        });
        const latencyMs = performance.now() - started;
        setLog((prev) =>
          prev.map((line) =>
            line.key === placeholderKey
              ? { ...line, status: "ok", latencyMs, detail }
              : line,
          ),
        );
      } catch (err) {
        const latencyMs = performance.now() - started;
        const detail = err instanceof Error ? err.message : String(err);
        setLog((prev) =>
          prev.map((line) =>
            line.key === placeholderKey
              ? { ...line, status: "error", latencyMs, detail }
              : line,
          ),
        );
      }
    },
    [api, originDeviceId],
  );

  const handleRotateDeviceId = useCallback(() => {
    const next = newDeviceId();
    safeWriteLS(ORIGIN_DEVICE_ID_KEY, next);
    setOriginDeviceId(next);
  }, []);

  const initButtonLabel = useMemo(() => {
    if (initStatus === "running") return "Ініціалізую…";
    if (initStatus === "ok") return "Init — готово (re-run)";
    if (initStatus === "error") return "Init — помилка (retry)";
    return "Init / migrate";
  }, [initStatus]);

  const initialised = initStatus === "ok";

  return (
    <div className="space-y-4" data-testid="routine-spike-dev-panel">
      <p className="text-xs text-subtle leading-snug">
        Dev-only панель для зняття замірів decision-gate у{" "}
        <code className="font-mono">routine-sqlite-v2</code> SPIKE (PR&nbsp;#022
        storage-roadmap). Натискай <strong>Init&nbsp;/&nbsp;migrate</strong>,
        далі — будь-яку дію. Усі латентності вимірюються через{" "}
        <code>performance.now()</code> на боці клієнта.
      </p>

      <div className="rounded-xl border border-line/60 bg-bg/50 p-3 text-xs space-y-1">
        <div className="flex justify-between gap-3">
          <span className="text-muted">VFS</span>
          <span className="font-mono text-text">{vfs?.vfs ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">crossOriginIsolated</span>
          <span className="font-mono text-text">
            {vfs ? String(vfs.crossOriginIsolated) : "—"}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Init latency</span>
          <span className="font-mono text-text">
            {formatLatency(initLatencyMs)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">originDeviceId</span>
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="font-mono text-text truncate max-w-[180px]"
              title={originDeviceId}
              data-testid="routine-spike-origin-device-id"
            >
              {originDeviceId || "—"}
            </span>
            <button
              type="button"
              onClick={handleRotateDeviceId}
              className="text-meta underline text-brand hover:opacity-80"
            >
              rotate
            </button>
          </span>
        </div>
        {initError && (
          <p
            className="text-meta text-danger pt-1"
            data-testid="routine-spike-init-error"
          >
            {initError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleInit}
          disabled={initStatus === "running"}
          className="rounded-xl border border-line bg-panel px-3 py-2 text-style-label text-text hover:bg-panelHi disabled:opacity-50"
          data-testid="routine-spike-init"
        >
          {initButtonLabel}
        </button>
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => handleRunAction(action)}
            disabled={!initialised}
            className="rounded-xl border border-line bg-panel px-3 py-2 text-style-label text-text hover:bg-panelHi disabled:opacity-50"
            data-testid={`routine-spike-action-${action.key}`}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="space-y-2" data-testid="routine-spike-log">
        {log.length === 0 ? (
          <p className="text-xs text-muted">Лог дій порожній.</p>
        ) : (
          log.map((line) => (
            <div
              key={line.key}
              className="rounded-md border border-line/50 bg-bg/40 px-3 py-2 text-caption space-y-1"
              data-testid={`routine-spike-log-line-${line.key}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-style-label text-text">{line.label}</span>
                <span className="font-mono text-meta text-muted">
                  {line.status === "running"
                    ? "running…"
                    : formatLatency(line.latencyMs)}
                </span>
              </div>
              {line.detail && (
                <p
                  className={
                    line.status === "error"
                      ? "font-mono text-meta text-danger"
                      : "font-mono text-meta text-subtle"
                  }
                >
                  {line.detail}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default RoutineSpikeDevPanel;
