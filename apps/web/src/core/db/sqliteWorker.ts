/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Власник SQLite у фоновому потоці — стадія 1 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * AI-CONTEXT: чому база взагалі має жити тут. `installOpfsSAHPoolVfs`
 * вимагає `FileSystemSyncAccessHandle`, якого на головному потоці немає —
 * тож виклик звідти завжди кидав `Missing required OPFS APIs`, і `sqlite.ts`
 * тихо з'їжджав на задекларований фолбек `JsStorageDb("local")`, тобто на
 * localStorage зі стелею ~5 МБ. Розвідка `opfsProbe.worker.ts` (стадія 0)
 * підтвердила на пристрої власника, що з воркера той самий API доступний.
 *
 * AI-DANGER: `oo1.DB` НЕ переноситься між потоками. Тому сюди переїжджає
 * не «встановлення пулу», а вся база: кожен запит приходить повідомленням і
 * повертається відповіддю. Не намагайся віддати хендл назад на головний
 * потік — такого шляху не існує.
 *
 * Воркер нічого не вирішує сам: вибір бекенда, фолбек і діагностика живуть
 * на боці клієнта (`sqliteWorkerClient.ts`). Тут лише виконання.
 */
import { createSqliteWorkerHandler } from "./sqliteWorkerHandler";
import type {
  SqliteWorkerErrorPayload,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from "./sqliteProtocol";

/**
 * Уся робота — у `sqliteWorkerHandler.ts`; тут лише міст до `self`.
 * Один воркер = один виконавець.
 */
const handle = createSqliteWorkerHandler();

function toPayload(err: unknown): SqliteWorkerErrorPayload {
  const code: unknown = (err as { resultCode?: unknown } | null)?.resultCode;
  return {
    name: err instanceof Error ? err.name : "Error",
    message: err instanceof Error ? err.message : String(err),
    resultCode: typeof code === "number" ? code : null,
  };
}

/** Набір відомих команд — для перевірки форми вхідного повідомлення. */
const KNOWN_KINDS: ReadonlySet<string> = new Set([
  "open",
  "openMemory",
  "exec",
  "run",
  "all",
  "diagnostics",
  "close",
  "wipe",
  "prune",
]);

function isRequest(value: unknown): value is SqliteWorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; kind?: unknown };
  return (
    typeof candidate.id === "number" &&
    typeof candidate.kind === "string" &&
    KNOWN_KINDS.has(candidate.kind)
  );
}

/**
 * Чи прийшло повідомлення звідти, звідки має.
 *
 * AI-CONTEXT: знахідка CodeQL «Missing origin verification in postMessage
 * handler» на цьому обробнику. Виділений воркер за специфікацією отримує
 * повідомлення ЛИШЕ від документа, який його створив, і саме тому браузер
 * лишає `origin` порожнім рядком — перевірка на рівність `location.origin`
 * тут відхиляла б УСІ легітимні виклики. Тому порожній рядок дозволений
 * явно, а будь-яке інше значення відхиляється: покладатись на інваріант
 * мовчки, без жодного рядка коду, і означає той самий клас дірок, що
 * ловить це правило.
 */
function isTrustedMessage(event: MessageEvent<unknown>): boolean {
  return event.origin === "" || event.origin === self.location.origin;
}

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isTrustedMessage(event)) return;
  const request = event.data;
  // Форма теж перевіряється: без цього чуже або пошкоджене повідомлення
  // доходило б до `handle()` і падало з `id: undefined`, тобто відповіддю,
  // яку клієнт нікуди не може віднести. Такі повідомлення просто
  // ігноруються — жоден наш виклик на них не чекає.
  if (!isRequest(request)) return;
  handle(request).then(
    (response) => self.postMessage(response),
    (err: unknown) =>
      self.postMessage({
        id: request.id,
        ok: false,
        error: toPayload(err),
      } satisfies SqliteWorkerResponse),
  );
};
