/**
 * @status Active
 *
 * Фейковий `Worker`, що виконує справжній `sqliteWorkerHandler.ts` у тому
 * самому процесі — для тестів, яким потрібна справжня (або фейкова)
 * SQLite-база через `getSqliteDb()`.
 *
 * AI-CONTEXT: до 2026-11-18 у Node/jsdom `Worker` не було, і `sqlite.ts`
 * тихо відкривав базу `:memory:` на головному потоці власною копією
 * sqlite-wasm. Після PR-T1 (рішення власника Б) такої копії немає, тож
 * тести ходять тим самим шляхом, що й прод: клієнт → повідомлення →
 * виконавець воркера. Кожен `new Worker()` отримує ВЛАСНИЙ виконавець зі
 * своїм станом, як справжній потік, а повідомлення в обидва боки
 * проходять `structuredClone` — непереносне значення впало б і в браузері.
 *
 * У jsdom справжній `installOpfsSAHPoolVfs` кидає `Missing required OPFS
 * APIs`, тож база відкривається в памʼяті воркера — рівно та гілка, яку
 * отримає браузер без OPFS у воркері.
 */
import {
  createSqliteWorkerHandler,
  type SqliteWorkerHandler,
} from "../sqliteWorkerHandler";
import type {
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from "../sqliteProtocol";

interface InProcessWorker {
  onmessage: ((event: { data: SqliteWorkerResponse }) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(data: SqliteWorkerRequest): void;
  terminate(): void;
  readonly terminated: boolean;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : value;
}

function toErrorResponse(id: number, err: unknown): SqliteWorkerResponse {
  const code: unknown = (err as { resultCode?: unknown } | null)?.resultCode;
  return {
    id,
    ok: false,
    error: {
      name: err instanceof Error ? err.name : "Error",
      message: err instanceof Error ? err.message : String(err),
      resultCode: typeof code === "number" ? code : null,
    },
  };
}

/** Усі «воркери», створені після встановлення, по порядку. */
export const inProcessWorkers: InProcessWorker[] = [];

/** Ставить фейковий `Worker` на `globalThis`. Викликати в `beforeEach`. */
export function installInProcessSqliteWorker(): void {
  inProcessWorkers.length = 0;
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: function InProcessWorkerCtor(this: unknown) {
      const handle: SqliteWorkerHandler = createSqliteWorkerHandler();
      let terminated = false;
      const worker: InProcessWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        get terminated() {
          return terminated;
        },
        postMessage(data) {
          if (terminated) return;
          const request = clone(data);
          void handle(request).then(
            (response) => {
              if (!terminated) worker.onmessage?.({ data: clone(response) });
            },
            (err: unknown) => {
              if (!terminated)
                worker.onmessage?.({ data: toErrorResponse(request.id, err) });
            },
          );
        },
        terminate() {
          terminated = true;
        },
      };
      inProcessWorkers.push(worker);
      return worker;
    },
  });
}

/** Прибирає фейковий `Worker`. Викликати в `afterEach`. */
export function uninstallInProcessSqliteWorker(): void {
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: undefined,
  });
}
