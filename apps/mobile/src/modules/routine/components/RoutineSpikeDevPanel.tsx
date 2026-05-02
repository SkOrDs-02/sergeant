/**
 * Routine SPIKE — dev-only metrics panel (mobile / React Native).
 *
 * Mirrors `apps/web/src/modules/routine/components/RoutineSpikeDevPanel.tsx`.
 * Lives behind `feature.routine.sqlite_v2`. The settings section that
 * mounts it (see `apps/mobile/src/core/settings/RoutineSpikeSection.tsx`)
 * gates rendering on the flag, so when the flag is off neither the
 * SPIKE library nor `expo-sqlite` paths are touched at runtime.
 *
 * Four manual actions plus a status block, each wrapped in
 * `performance.now()` brackets so the operator can read latency for
 * the decision-gate measurements (see
 * `docs/notes/spikes/routine-sqlite-v2.md`):
 *
 *  - **Init / migrate**: open expo-sqlite, wrap the handle in
 *    `createExpoSqliteRawClient`, run `migrateRoutineSpike`, and run
 *    a first `listActiveRoutineEntries` so the «first-open SQLite
 *    latency» metric is end-to-end on-device.
 *  - **Record** / **Delete completion**: high-level mutations that
 *    write the row + enqueue the outbox op. Latency surfaces local
 *    SQLite write cost on actual device storage.
 *  - **Push** drains the outbox to `POST /v2/sync/push`. Counters
 *    report applied / duplicate / rejected ops.
 *  - **Pull** fetches `GET /v2/sync/pull?since=<cursor>` and applies
 *    via the per-table `applyPulled*` paths. Counters report applied
 *    vs LWW conflict outcomes.
 *
 * `originDeviceId` is generated once and persisted to MMKV (the same
 * backend ExperimentalSection uses) so the multi-device demo path is
 * reproducible across reloads. The same id flows through the
 * `X-Origin-Device-Id` header on push/pull, which is exactly what the
 * server uses to suppress same-device echoes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as ExpoSQLite from "expo-sqlite";
import { useApiClient } from "@sergeant/api-client/react";
import type { ApiClient } from "@sergeant/api-client";

import { safeReadStringLS, safeWriteLS } from "@/lib/storage";
import {
  createExpoSqliteRawClient,
  deleteRoutineCompletion,
  listActiveRoutineEntries,
  listPendingOutboxOps,
  migrateRoutineSpike,
  pullSince,
  pushPendingOutbox,
  recordRoutineCompletion,
  type ExpoSqliteAsyncHandle,
  type PullResult,
  type PushResult,
  type SpikeSqliteClient,
} from "../lib/sqliteSpike";

const DATABASE_NAME = "sergeant.db";
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

interface RuntimeInfo {
  /** Database filename — matches the on-device sqlite singleton. */
  readonly database: string;
  /** Platform marker; mobile is always `expo-sqlite`. */
  readonly engine: "expo-sqlite";
}

function readOrCreateOriginDeviceId(): string {
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
  readonly info: RuntimeInfo;
}

async function bootstrapSpikeRuntime(): Promise<SpikeRuntime> {
  // Open expo-sqlite directly — the SPIKE library uses raw SQL via
  // `createExpoSqliteRawClient`, so it bypasses the Drizzle wrapper in
  // `apps/mobile/src/core/db/sqlite.ts`. Re-opening the same database
  // is idempotent at the OS level (sqlite returns the same file).
  const native = await ExpoSQLite.openDatabaseAsync(DATABASE_NAME);
  // The expo-sqlite `SQLiteDatabase` class declares `runAsync` /
  // `getAllAsync` as overload sets, which structurally do not unify
  // with our minimal `ExpoSqliteAsyncHandle` interface. Build the
  // handle by cherry-picking the methods so the SPIKE adapter sees
  // the simple `(sql, params) => Promise<…>` shape it expects, with
  // no double-cast bypass of the type system.
  const handle: ExpoSqliteAsyncHandle = {
    execAsync: (sql) => native.execAsync(sql),
    runAsync: (sql, params) => native.runAsync(sql, params as never[]),
    getAllAsync: <R,>(sql: string, params: readonly unknown[]) =>
      native.getAllAsync<R>(sql, params as never[]),
  };
  const client = createExpoSqliteRawClient(handle);
  await migrateRoutineSpike(client);
  // Touch a SELECT so the «first-open» metric covers the full
  // open → migrate → first-read path.
  await listActiveRoutineEntries(client, SPIKE_DEV_USER_ID);
  return {
    client,
    info: { database: DATABASE_NAME, engine: "expo-sqlite" },
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
   * Test-only escape hatch — lets jest swap the SPIKE bootstrap so
   * specs can exercise the action wiring without spinning up real
   * expo-sqlite under jest-expo.
   */
  readonly bootstrap?: () => Promise<SpikeRuntime>;
}

export function RoutineSpikeDevPanel({
  bootstrap = bootstrapSpikeRuntime,
}: RoutineSpikeDevPanelProps = {}) {
  const api = useApiClient();
  const [originDeviceId, setOriginDeviceId] = useState<string>("");
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
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
      setInfo(runtime.info);
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
    <View className="gap-4" testID="routine-spike-dev-panel">
      <Text className="text-xs text-fg-muted leading-snug">
        Dev-only панель для зняття замірів decision-gate у{" "}
        <Text className="font-mono">routine-sqlite-v2</Text> SPIKE (PR #022
        storage-roadmap). Натисни{" "}
        <Text className="font-semibold">Init / migrate</Text>, далі — будь-яку
        дію. Усі латентності вимірюються через{" "}
        <Text className="font-mono">performance.now()</Text> на боці клієнта.
      </Text>

      <View className="rounded-xl border border-line bg-bg/50 p-3 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-fg-muted">database</Text>
          <Text className="font-mono text-xs text-fg" numberOfLines={1}>
            {info?.database ?? "—"}
          </Text>
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-fg-muted">engine</Text>
          <Text className="font-mono text-xs text-fg" numberOfLines={1}>
            {info?.engine ?? "—"}
          </Text>
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-fg-muted">init latency</Text>
          <Text className="font-mono text-xs text-fg" numberOfLines={1}>
            {formatLatency(initLatencyMs)}
          </Text>
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-fg-muted">originDeviceId</Text>
          <View className="flex-row items-center gap-2 flex-1 justify-end min-w-0">
            <Text
              className="font-mono text-xs text-fg max-w-[180px]"
              numberOfLines={1}
              ellipsizeMode="middle"
              testID="routine-spike-origin-device-id"
            >
              {originDeviceId || "—"}
            </Text>
            <Pressable
              onPress={handleRotateDeviceId}
              accessibilityRole="button"
              accessibilityLabel="Rotate originDeviceId"
              testID="routine-spike-rotate-device-id"
            >
              <Text className="text-xs underline text-brand">rotate</Text>
            </Pressable>
          </View>
        </View>
        {initError ? (
          <Text
            className="text-xs text-danger pt-1"
            testID="routine-spike-init-error"
          >
            {initError}
          </Text>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: initStatus === "running" }}
          onPress={handleInit}
          disabled={initStatus === "running"}
          className={`rounded-xl border border-line bg-panel px-3 py-2 ${
            initStatus === "running" ? "opacity-50" : ""
          }`}
          testID="routine-spike-init"
        >
          <Text className="text-sm font-medium text-fg">{initButtonLabel}</Text>
        </Pressable>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityState={{ disabled: !initialised }}
            onPress={() => handleRunAction(action)}
            disabled={!initialised}
            className={`rounded-xl border border-line bg-panel px-3 py-2 ${
              initialised ? "" : "opacity-50"
            }`}
            testID={`routine-spike-action-${action.key}`}
          >
            <Text className="text-sm font-medium text-fg">{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <View className="gap-2" testID="routine-spike-log">
        {log.length === 0 ? (
          <Text className="text-xs text-fg-muted">Лог дій порожній.</Text>
        ) : (
          <ScrollView
            className="max-h-[260px]"
            contentContainerStyle={{ gap: 8 }}
          >
            {log.map((line) => (
              <View
                key={line.key}
                className="rounded-md border border-line bg-bg/40 px-3 py-2 gap-1"
                testID={`routine-spike-log-line-${line.key}`}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-medium text-fg">
                    {line.label}
                  </Text>
                  <Text className="font-mono text-xs text-fg-muted">
                    {line.status === "running"
                      ? "running…"
                      : formatLatency(line.latencyMs)}
                  </Text>
                </View>
                {line.detail ? (
                  <Text
                    className={
                      line.status === "error"
                        ? "font-mono text-xs text-danger"
                        : "font-mono text-xs text-fg-muted"
                    }
                  >
                    {line.detail}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

export default RoutineSpikeDevPanel;
