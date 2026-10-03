/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Клієнт розвідки OPFS — стадія 0 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * Питання, на яке відповідає: чи підніметься OPFS-SAH пул у воркері на
 * ЦЬОМУ пристрої. У контейнерному Chromium відповідь уже відома (так), але
 * iOS PWA — окреме середовище, і рішення про переїзд бази має спиратись на
 * факт звідти, а не на припущення.
 *
 * AI-DANGER: розвідка не гейтить нічого і не має права нічого зламати.
 * Будь-який збій — включно з тим, що `Worker` недоступний узагалі —
 * повертає `unavailable`, а не кидає. Таймаут обовʼязковий: воркер, який
 * не відповів, не має тримати виклик вічно.
 */
import { addSentryBreadcrumb, setSentryTag } from "../observability/sentry";

import type { OpfsProbeResult } from "./opfsProbe.worker";

/** Скільки чекаємо на відповідь воркера, перш ніж вважати його мертвим. */
const PROBE_TIMEOUT_MS = 10_000;

let cached: Promise<OpfsProbeResult> | null = null;

function unavailable(reason: string): OpfsProbeResult {
  return { kind: "unavailable", reason };
}

async function runProbe(): Promise<OpfsProbeResult> {
  if (typeof Worker === "undefined") return unavailable("no Worker");

  let worker: Worker;
  try {
    worker = new Worker(new URL("./opfsProbe.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }

  try {
    return await new Promise<OpfsProbeResult>((resolve) => {
      const timer = setTimeout(
        () => resolve(unavailable("probe timed out")),
        PROBE_TIMEOUT_MS,
      );
      const settle = (result: OpfsProbeResult) => {
        clearTimeout(timer);
        resolve(result);
      };
      worker.onmessage = (event: MessageEvent<OpfsProbeResult>) =>
        settle(event.data);
      worker.onerror = (event) =>
        settle(unavailable(event.message || "worker error"));
      worker.postMessage("probe");
    });
  } finally {
    worker.terminate();
  }
}

/**
 * Разова розвідка: чи доступний OPFS у воркері на цьому пристрої.
 *
 * Результат кешується на весь час життя сторінки — відповідь не змінюється
 * між викликами, а піднімати воркер двічі немає сенсу.
 */
export function probeOpfsInWorker(): Promise<OpfsProbeResult> {
  cached ??= runProbe().then((result) => {
    setSentryTag(
      "storage.opfsWorker",
      result.kind === "ok" ? "available" : "unavailable",
    );
    addSentryBreadcrumb({
      category: "storage",
      level: result.kind === "ok" ? "info" : "warning",
      message: "opfs-in-worker probe",
      data:
        result.kind === "ok"
          ? { available: true }
          : { available: false, reason: result.reason },
    });
    return result;
  });
  return cached;
}

/** Test-only. */
export function __resetOpfsProbeForTests(): void {
  cached = null;
}
