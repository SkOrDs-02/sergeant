// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../observability/sentry", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));

import { setSentryTag } from "../observability/sentry";
import { __resetOpfsProbeForTests, probeOpfsInWorker } from "./opfsProbe";

/**
 * Розвідка OPFS у воркері — стадія 0 спеки `sqlite-opfs-worker.md`.
 *
 * Тести стежать за одним: розвідка НЕ має права нічого зламати. Вона
 * нічого не гейтить, тож будь-який збій (немає `Worker`, конструктор
 * кинув, воркер мовчить) — це відповідь `unavailable`, а не виняток.
 */
type WorkerLike = {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  postMessage: (data: unknown) => void;
  terminate: () => void;
};

let lastWorker: WorkerLike | null = null;

function stubWorker(factory: (() => WorkerLike) | null): void {
  if (!factory) {
    Object.defineProperty(globalThis, "Worker", {
      value: undefined,
      configurable: true,
    });
    return;
  }
  Object.defineProperty(globalThis, "Worker", {
    value: function FakeWorker(this: WorkerLike) {
      const made = factory();
      lastWorker = made;
      return made;
    },
    configurable: true,
  });
}

describe("probeOpfsInWorker", () => {
  beforeEach(() => {
    __resetOpfsProbeForTests();
    lastWorker = null;
    vi.mocked(setSentryTag).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    stubWorker(null);
  });

  function workerThatReplies(data: unknown): () => WorkerLike {
    return () => {
      const worker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage: () => {
          queueMicrotask(() => worker.onmessage?.({ data }));
        },
        terminate: vi.fn(),
      };
      return worker;
    };
  }

  it("віддає ok і тегує сесію, коли пул піднявся", async () => {
    stubWorker(workerThatReplies({ kind: "ok" }));

    await expect(probeOpfsInWorker()).resolves.toEqual({ kind: "ok" });
    expect(setSentryTag).toHaveBeenCalledWith(
      "storage.opfsWorker",
      "available",
    );
    // Воркер-розвідник більше не потрібен — тримати його живим немає сенсу.
    expect(lastWorker?.terminate).toHaveBeenCalled();
  });

  it("передає причину відмови, а не ковтає її", async () => {
    stubWorker(
      workerThatReplies({
        kind: "unavailable",
        reason: "Missing required OPFS APIs.",
      }),
    );

    await expect(probeOpfsInWorker()).resolves.toEqual({
      kind: "unavailable",
      reason: "Missing required OPFS APIs.",
    });
    expect(setSentryTag).toHaveBeenCalledWith(
      "storage.opfsWorker",
      "unavailable",
    );
  });

  it("не кидає там, де Worker недоступний узагалі", async () => {
    stubWorker(null);

    await expect(probeOpfsInWorker()).resolves.toEqual({
      kind: "unavailable",
      reason: "no Worker",
    });
  });

  it("не кидає, коли конструктор воркера падає", async () => {
    Object.defineProperty(globalThis, "Worker", {
      value: function Broken() {
        throw new Error("blocked by CSP");
      },
      configurable: true,
    });

    await expect(probeOpfsInWorker()).resolves.toEqual({
      kind: "unavailable",
      reason: "blocked by CSP",
    });
  });

  it("не висне на воркері, який мовчить", async () => {
    vi.useFakeTimers();
    stubWorker(() => ({
      onmessage: null,
      onerror: null,
      postMessage: () => {},
      terminate: vi.fn(),
    }));

    const pending = probeOpfsInWorker();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({
      kind: "unavailable",
      reason: "probe timed out",
    });
  });

  it("піднімає воркер лише раз на сторінку", async () => {
    const factory = vi.fn(workerThatReplies({ kind: "ok" }));
    stubWorker(factory as unknown as () => WorkerLike);

    await probeOpfsInWorker();
    await probeOpfsInWorker();

    // Відповідь не змінюється між викликами, тож другий воркер — марна
    // робота на пристрої, де кожен зайвий потік коштує.
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
