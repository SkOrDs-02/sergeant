import { afterEach, describe, expect, it, vi } from "vitest";

const indexMocks = vi.hoisted(() => ({
  assertStartupEnv: vi.fn(),
  assertBetterAuthStartupEnv: vi.fn(),
  createApp: vi.fn(),
  listen: vi.fn(),
  markStartupComplete: vi.fn(),
  startPoolSampler: vi.fn(),
  applyInfraMonthlyCosts: vi.fn(),
  applyVoyageDailyBudget: vi.fn(),
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(async () => undefined),
  anthropicBudgetGuardStart: vi.fn(),
  anthropicBudgetGuardStop: vi.fn(),
  registerSecurityEventsRoom: vi.fn(),
  pingSecurityRoom: vi.fn(async () => ({ ok: true, reason: "test" })),
  startMonoEnrichmentWorker: vi.fn(),
  startMonoMccBatchWorker: vi.fn(),
  startAuthMailWorker: vi.fn(),
  startFtuxDripWorker: vi.fn(),
  configureFtuxDripDispatcher: vi.fn(),
  startMemoryIngestWorker: vi.fn(),
  logArchiveStart: vi.fn(),
  logArchiveStop: vi.fn(async () => undefined),
  webhookRetentionStart: vi.fn(),
  webhookRetentionStop: vi.fn(async () => undefined),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerFatal: vi.fn(),
  sentryFlush: vi.fn(async () => undefined),
  endPoolWithAbortTimeout: vi.fn(async () => undefined),
  processOn: vi.fn(),
  env: {
    MONO_ENRICHMENT_WORKER_ENABLED: false,
    ANTHROPIC_API_KEY: "",
    MONO_ENRICHMENT_BATCH_SIZE: 1,
    MONO_ENRICHMENT_INTERVAL_MS: 1000,
    MONO_ENRICHMENT_MAX_ATTEMPTS: 3,
    MCC_BATCH_HOURLY_ENABLED: false,
    MCC_BATCH_MAX_SIZE: 25,
    MCC_BATCH_INTERVAL_MS: 3600000,
    WEBHOOK_EVENTS_RETENTION_DAYS: 30,
    WEBHOOK_EVENTS_RETENTION_POLL_INTERVAL_MS: 60000,
    LOG_ARCHIVE_ENABLED: false,
    LOG_RETENTION_DAYS: 30,
    LOG_ARCHIVE_POLL_INTERVAL_MS: 60000,
    LOG_ARCHIVE_BATCH_SIZE: 100,
    GCS_LOG_ARCHIVE_BUCKET: "",
    SHUTDOWN_GRACE_MS: 1000,
    SHUTDOWN_HARD_TIMEOUT_MS: 5000,
  },
}));

vi.mock("./obs/tracing.js", () => ({}));
vi.mock("./sentry.js", () => ({
  Sentry: { flush: indexMocks.sentryFlush },
}));
vi.mock("./env/env.js", () => ({
  assertStartupEnv: indexMocks.assertStartupEnv,
  // PlataRecurringPoller читає env.PLATA_ENABLED у конструкторі (index.ts wiring)
  env: { PLATA_ENABLED: false },
}));
vi.mock("./env/betterAuthEnv.js", () => ({
  assertBetterAuthStartupEnv: indexMocks.assertBetterAuthStartupEnv,
}));
vi.mock("./app.js", () => ({
  createApp: indexMocks.createApp,
}));
vi.mock("./config.js", () => ({
  config: {
    servesFrontend: false,
    distPath: null,
    trustProxy: 1,
    port: 3000,
    role: "test",
  },
}));
vi.mock("./db.js", () => ({
  pool: { end: vi.fn(async () => undefined) },
}));
vi.mock("./env.js", () => ({
  env: indexMocks.env,
}));
vi.mock("./lib/appState.js", () => ({
  markStartupComplete: indexMocks.markStartupComplete,
}));
vi.mock("./lib/jobs/authMail.js", () => ({
  startAuthMailWorker: indexMocks.startAuthMailWorker,
}));
vi.mock("./lib/jobs/ftuxDrip.js", () => ({
  startFtuxDripWorker: indexMocks.startFtuxDripWorker,
}));
vi.mock("./lib/poolShutdown.js", () => ({
  endPoolWithAbortTimeout: indexMocks.endPoolWithAbortTimeout,
}));
vi.mock("./lib/redis.js", () => ({
  connectRedis: indexMocks.connectRedis,
  disconnectRedis: indexMocks.disconnectRedis,
}));
vi.mock("./modules/ai-memory/ingestQueue.js", () => ({
  startMemoryIngestWorker: indexMocks.startMemoryIngestWorker,
}));
vi.mock("./modules/mono/enrichmentWorker.js", () => ({
  startMonoEnrichmentWorker: indexMocks.startMonoEnrichmentWorker,
}));
vi.mock("./modules/mono/batchEnrichmentWorker.js", () => ({
  startMonoMccBatchWorker: indexMocks.startMonoMccBatchWorker,
}));
vi.mock("./obs/logger.js", () => ({
  logger: {
    info: indexMocks.loggerInfo,
    warn: indexMocks.loggerWarn,
    error: indexMocks.loggerError,
    fatal: indexMocks.loggerFatal,
  },
  serializeError: (err: unknown) => ({ message: String(err) }),
}));
vi.mock("./email/authTransactionalMail.js", () => ({}));
vi.mock("./email/ftuxDripMail.js", () => ({
  configureFtuxDripDispatcher: indexMocks.configureFtuxDripDispatcher,
}));
vi.mock("./obs/metrics.js", () => ({
  startPoolSampler: indexMocks.startPoolSampler,
  uncaughtExceptionsTotal: { inc: vi.fn() },
  unhandledRejectionsTotal: { inc: vi.fn() },
}));
vi.mock("./obs/cost.js", () => ({
  applyInfraMonthlyCosts: indexMocks.applyInfraMonthlyCosts,
  applyVoyageDailyBudget: indexMocks.applyVoyageDailyBudget,
}));
vi.mock("./obs/anthropicBudgetGuard.js", () => ({
  anthropicBudgetGuard: {
    start: indexMocks.anthropicBudgetGuardStart,
    stop: indexMocks.anthropicBudgetGuardStop,
  },
}));
vi.mock("./obs/securityEventsRoom.js", () => ({
  pingSecurityRoom: indexMocks.pingSecurityRoom,
  registerSecurityEventsRoom: indexMocks.registerSecurityEventsRoom,
}));
vi.mock("./modules/logRetention/archivePoller.js", () => ({
  LogArchivePoller: vi.fn(function LogArchivePoller(this: {
    start: () => void;
    stop: () => Promise<void>;
  }) {
    this.start = indexMocks.logArchiveStart;
    this.stop = indexMocks.logArchiveStop;
  }),
}));
vi.mock("./modules/webhooks/retentionPoller.js", () => ({
  WebhookEventsRetentionPoller: vi.fn(
    function WebhookEventsRetentionPoller(this: {
      start: () => void;
      stop: () => Promise<void>;
    }) {
      this.start = indexMocks.webhookRetentionStart;
      this.stop = indexMocks.webhookRetentionStop;
    },
  ),
}));

describe("server entrypoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    Object.assign(indexMocks.env, {
      MONO_ENRICHMENT_WORKER_ENABLED: false,
      ANTHROPIC_API_KEY: "",
      MCC_BATCH_HOURLY_ENABLED: false,
    });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("wires startup checks, background workers, process handlers, and listen callback", async () => {
    const fakeServer = { close: vi.fn() };
    indexMocks.listen.mockImplementation(
      (_port: number, _host: string, cb: () => void) => {
        cb();
        return fakeServer;
      },
    );
    indexMocks.createApp.mockReturnValue({ listen: indexMocks.listen });
    const processOnSpy = vi
      .spyOn(process, "on")
      .mockImplementation((event, listener) => {
        indexMocks.processOn(event, listener);
        return process;
      });

    await import("./index.js");

    expect(indexMocks.assertStartupEnv).toHaveBeenCalledOnce();
    expect(indexMocks.assertBetterAuthStartupEnv).toHaveBeenCalledOnce();
    expect(indexMocks.createApp).toHaveBeenCalledWith({
      servesFrontend: false,
      distPath: null,
      trustProxy: 1,
    });
    expect(indexMocks.startPoolSampler).toHaveBeenCalledOnce();
    expect(indexMocks.applyInfraMonthlyCosts).toHaveBeenCalledOnce();
    expect(indexMocks.applyVoyageDailyBudget).toHaveBeenCalledOnce();
    expect(indexMocks.connectRedis).toHaveBeenCalledOnce();
    expect(indexMocks.anthropicBudgetGuardStart).toHaveBeenCalledOnce();
    expect(indexMocks.registerSecurityEventsRoom).toHaveBeenCalledOnce();
    expect(indexMocks.configureFtuxDripDispatcher).toHaveBeenCalledOnce();
    expect(indexMocks.startAuthMailWorker).toHaveBeenCalledOnce();
    expect(indexMocks.startFtuxDripWorker).toHaveBeenCalledOnce();
    expect(indexMocks.startMemoryIngestWorker).toHaveBeenCalledOnce();
    expect(indexMocks.webhookRetentionStart).toHaveBeenCalledOnce();
    expect(indexMocks.logArchiveStart).toHaveBeenCalledOnce();
    expect(indexMocks.listen).toHaveBeenCalledWith(
      3000,
      "0.0.0.0",
      expect.any(Function),
    );
    expect(indexMocks.markStartupComplete).toHaveBeenCalledOnce();
    expect(indexMocks.loggerInfo).toHaveBeenCalledWith({
      msg: "server_listening",
      role: "test",
      port: 3000,
    });
    expect(indexMocks.processOn).toHaveBeenCalledWith(
      "unhandledRejection",
      expect.any(Function),
    );
    expect(indexMocks.processOn).toHaveBeenCalledWith(
      "uncaughtException",
      expect.any(Function),
    );
    expect(indexMocks.processOn).toHaveBeenCalledWith(
      "SIGTERM",
      expect.any(Function),
    );
    expect(indexMocks.processOn).toHaveBeenCalledWith(
      "SIGINT",
      expect.any(Function),
    );
    expect(processOnSpy).toHaveBeenCalled();
  });

  it("drains runtime resources on SIGTERM", async () => {
    Object.assign(indexMocks.env, {
      MONO_ENRICHMENT_WORKER_ENABLED: true,
      ANTHROPIC_API_KEY: "sk-test",
      MCC_BATCH_HOURLY_ENABLED: true,
    });
    const closeMock = vi.fn((cb: (err?: Error) => void) => cb());
    indexMocks.listen.mockImplementation(
      (_port: number, _host: string, cb: () => void) => {
        cb();
        return { close: closeMock };
      },
    );
    indexMocks.createApp.mockReturnValue({ listen: indexMocks.listen });
    const authClose = vi.fn(async () => undefined);
    const ftuxClose = vi.fn(async () => undefined);
    const memoryClose = vi.fn(async () => undefined);
    const enrichmentStop = vi.fn(async () => undefined);
    const mccStop = vi.fn(async () => undefined);
    indexMocks.startAuthMailWorker.mockReturnValue({ close: authClose });
    indexMocks.startFtuxDripWorker.mockReturnValue({ close: ftuxClose });
    indexMocks.startMemoryIngestWorker.mockReturnValue({ close: memoryClose });
    indexMocks.startMonoEnrichmentWorker.mockReturnValue({
      stop: enrichmentStop,
    });
    indexMocks.startMonoMccBatchWorker.mockReturnValue({ stop: mccStop });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    vi.spyOn(process, "on").mockImplementation((event, listener) => {
      indexMocks.processOn(event, listener);
      return process;
    });

    await import("./index.js");
    const sigtermListener = indexMocks.processOn.mock.calls.find(
      ([event]) => event === "SIGTERM",
    )?.[1] as (() => void) | undefined;

    expect(sigtermListener).toBeTypeOf("function");
    sigtermListener?.();
    await vi.waitFor(() => {
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    expect(closeMock).toHaveBeenCalledOnce();
    expect(authClose).toHaveBeenCalledOnce();
    expect(ftuxClose).toHaveBeenCalledOnce();
    expect(memoryClose).toHaveBeenCalledOnce();
    expect(indexMocks.startMonoEnrichmentWorker).toHaveBeenCalledOnce();
    expect(indexMocks.startMonoMccBatchWorker).toHaveBeenCalledOnce();
    expect(enrichmentStop).toHaveBeenCalledOnce();
    expect(mccStop).toHaveBeenCalledOnce();
    expect(indexMocks.webhookRetentionStop).toHaveBeenCalledOnce();
    expect(indexMocks.logArchiveStop).toHaveBeenCalledOnce();
    expect(indexMocks.anthropicBudgetGuardStop).toHaveBeenCalledOnce();
    expect(indexMocks.endPoolWithAbortTimeout).toHaveBeenCalledOnce();
    expect(indexMocks.disconnectRedis).toHaveBeenCalledOnce();
    expect(indexMocks.sentryFlush).toHaveBeenCalledWith(2000);
  });

  it("records process-level unhandled rejection and uncaught exception handlers", async () => {
    const closeMock = vi.fn((cb: (err?: Error) => void) => cb());
    indexMocks.listen.mockImplementation(
      (_port: number, _host: string, cb: () => void) => {
        cb();
        return { close: closeMock };
      },
    );
    indexMocks.createApp.mockReturnValue({ listen: indexMocks.listen });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    vi.spyOn(process, "on").mockImplementation((event, listener) => {
      indexMocks.processOn(event, listener);
      return process;
    });

    await import("./index.js");
    const unhandled = indexMocks.processOn.mock.calls.find(
      ([event]) => event === "unhandledRejection",
    )?.[1] as ((reason: unknown) => void) | undefined;
    const uncaught = indexMocks.processOn.mock.calls.find(
      ([event]) => event === "uncaughtException",
    )?.[1] as ((error: Error) => void) | undefined;

    unhandled?.(new Error("promise boom"));
    expect(indexMocks.loggerError).toHaveBeenCalledWith({
      msg: "unhandled_rejection",
      err: { message: "Error: promise boom" },
    });

    uncaught?.(new Error("crash"));
    await vi.waitFor(() => {
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
    expect(indexMocks.loggerFatal).toHaveBeenCalledWith({
      msg: "uncaught_exception",
      err: { message: "Error: crash" },
    });
  });
});
