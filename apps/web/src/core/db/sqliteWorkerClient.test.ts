// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { openSqliteInWorker, SqliteWorkerError } from "./sqliteWorkerClient";
import type {
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from "./sqliteProtocol";

/**
 * Протокол воркера бази — стадія 1 спеки `sqlite-opfs-worker.md`.
 *
 * Тести стежать за одним інваріантом: жоден виклик не лишається без
 * відповіді. База в іншому потоці має рівно три способи підвести — не
 * піднятись, зависнути на відкритті й померти посеред роботи — і кожен із
 * них тут окремим випадком.
 */

const OPEN_OPTS = {
  directory: "/sergeant/sqlite",
  initialCapacity: 24,
  minFreeSlots: 8,
} as const;

type Responder = (request: SqliteWorkerRequest) => SqliteWorkerResponse | null;

interface FakeWorker {
  onmessage: ((event: { data: SqliteWorkerResponse }) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage: (data: SqliteWorkerRequest) => void;
  terminate: () => void;
  readonly seen: SqliteWorkerRequest[];
}

let live: FakeWorker | null = null;

function installWorker(respond: Responder): void {
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: function FakeWorkerCtor(this: unknown) {
      const seen: SqliteWorkerRequest[] = [];
      const worker: FakeWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        seen,
        postMessage: (data) => {
          seen.push(data);
          const reply = respond(data);
          if (reply) queueMicrotask(() => worker.onmessage?.({ data: reply }));
        },
        terminate: vi.fn(),
      };
      live = worker;
      return worker;
    },
  });
}

/** Відповідає на все успішно; `all` віддає заздалегідь підготовані рядки. */
function happyResponder(rows: unknown[] = []): Responder {
  return (request) => {
    switch (request.kind) {
      case "open":
        return {
          id: request.id,
          ok: true,
          kind: "open",
          result: {
            dbName: request.dbName,
            grewBy: 4,
            diagnostics: { capacity: 24, fileCount: 3 },
          },
        };
      case "all":
        return { id: request.id, ok: true, kind: "all", rows };
      case "diagnostics":
        return {
          id: request.id,
          ok: true,
          kind: "diagnostics",
          result: { capacity: 24, fileCount: 3 },
        };
      default:
        return { id: request.id, ok: true, kind: request.kind };
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
  live = null;
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: undefined,
  });
});

describe("openSqliteInWorker", () => {
  it("відкриває базу і доносить, на скільки виріс пул", async () => {
    installWorker(happyResponder());

    const conn = await openSqliteInWorker("sergeant-anon.db", OPEN_OPTS);

    expect(conn.dbName).toBe("sergeant-anon.db");
    expect(conn.grewBy).toBe(4);
    expect(live?.seen[0]).toMatchObject({
      kind: "open",
      dbName: "sergeant-anon.db",
      initialCapacity: 24,
      minFreeSlots: 8,
    });
  });

  it("кожен виклик отримує СВОЮ відповідь, навіть коли вони перемішані", async () => {
    // Відповіді навмисно у зворотному порядку: кореляція йде по id, а не
    // по черзі надходження — інакше два паралельні запити обмінялися б
    // результатами, і це був би найтихіший клас багів, який тут можливий.
    const queued: SqliteWorkerResponse[] = [];
    installWorker((request) => {
      if (request.kind === "open") return happyResponder()(request);
      if (request.kind === "all") {
        queued.push({
          id: request.id,
          ok: true,
          kind: "all",
          rows: [[request.sql]],
        });
        if (queued.length === 2) {
          for (const reply of queued.reverse()) {
            queueMicrotask(() => live?.onmessage?.({ data: reply }));
          }
        }
        return null;
      }
      return happyResponder()(request);
    });

    const conn = await openSqliteInWorker("db", OPEN_OPTS);
    const [first, second] = await Promise.all([
      conn.all("SELECT 1", [], "array"),
      conn.all("SELECT 2", [], "array"),
    ]);

    expect(first).toEqual([["SELECT 1"]]);
    expect(second).toEqual([["SELECT 2"]]);
  });

  it("перетворює помилку воркера на SqliteWorkerError із кодом", async () => {
    installWorker((request) =>
      request.kind === "open"
        ? happyResponder()(request)
        : {
            id: request.id,
            ok: false,
            error: {
              name: "SQLite3Error",
              message: "SQLITE_IOERR: disk I/O error",
              resultCode: 10,
            },
          },
    );

    const conn = await openSqliteInWorker("db", OPEN_OPTS);
    const failure = await conn
      .run("INSERT INTO t VALUES (1)", [])
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(SqliteWorkerError);
    // Саме `resultCode` розводить переповнене сховище (10) і переповнений
    // пул (14). Загубити його — повернутись до здогадів.
    expect((failure as SqliteWorkerError).resultCode).toBe(10);
  });

  it("не мовчить, коли відкриття зависло", async () => {
    vi.useFakeTimers();
    installWorker(() => null);

    const pending = openSqliteInWorker("db", OPEN_OPTS).catch(
      (err: unknown) => err,
    );
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await pending).toBeInstanceOf(Error);
    expect(live?.terminate).toHaveBeenCalled();
  });

  it("відхиляє незавершені виклики, коли воркер помер", async () => {
    installWorker((request) =>
      request.kind === "open" ? happyResponder()(request) : null,
    );

    const conn = await openSqliteInWorker("db", OPEN_OPTS);
    const inFlight = conn
      .all("SELECT 1", [], "array")
      .catch((err: unknown) => err);
    live?.onerror?.({ message: "worker crashed" });

    // Без цього виклик висів би вічно, а застосунок виглядав би просто
    // задумливим — найгірший спосіб відмовити.
    expect(await inFlight).toBeInstanceOf(Error);
    expect(String(await inFlight)).toContain("worker crashed");
  });

  it("кидає там, де Worker недоступний узагалі", async () => {
    await expect(openSqliteInWorker("db", OPEN_OPTS)).rejects.toThrow(
      /Worker is unavailable/,
    );
  });

  it("закриття гасить воркер", async () => {
    installWorker(happyResponder());

    const conn = await openSqliteInWorker("db", OPEN_OPTS);
    await conn.close();

    expect(live?.terminate).toHaveBeenCalled();
  });
});
