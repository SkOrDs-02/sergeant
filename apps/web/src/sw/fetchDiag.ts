/// <reference lib="WebWorker" />
/**
 * Діагностика fetch-диспетчеризації SW (знахідка DURABILITY-20261008-BOOT-1).
 *
 * Симптом: після зміни користувача (анонім → акаунт) підресурси нового
 * документа зависають між сторінкою і fetch-обробником SW, `#root` лишається
 * порожнім. Звідси кільцевий буфер останніх fetch-подій (шлях без query,
 * режим, призначення, обробник, стадія, початок/кінець, результат) плюс
 * позначки часу повідомлень `SW_SET_USER` / `CLEAR_SW_CACHES`. Сторінка або
 * inline-сторож тягне знімок повідомленням `SW_FETCH_DIAG`.
 *
 * Без workbox-імпортів (тестується під jsdom). Без PII: лише pathname, query
 * і hash відкидаються, id-подібні сегменти поза `/assets/` маскуються.
 * Буфер живе в памʼяті воркера: після idle-kill він порожній, і це теж дані
 * («воркер перезапускався»), бо `startedAt` покаже свіжий старт.
 */

export const FETCH_DIAG_CAPACITY = 60;
export const MARK_CAPACITY = 20;

export type FetchStage =
  | "dispatch"
  | "handler"
  | "cache-read"
  | "network"
  | "network-done"
  | "responded"
  | "done";

export type FetchOutcome = "ok" | "error" | null;

export interface FetchDiagEntry {
  /** Шлях без query/hash, id-подібні сегменти замасковані. */
  p: string;
  /** `request.mode`. */
  m: string;
  /** `request.destination` (script, style, document, …). */
  d: string;
  /** Обробник Workbox; `null` — жодна наша стратегія не взяла (мережа напряму). */
  h: string | null;
  /** Остання досягнута стадія. */
  st: FetchStage;
  /** Початок (epoch ms). */
  s: number;
  /** Кінець (epoch ms) або `null`, якщо запит досі висить. */
  e: number | null;
  /** Результат; `null` доки не завершено. */
  o: FetchOutcome;
}

export interface DiagMark {
  /** `set_user` | `set_user_done` | `clear_caches` | `clear_caches_done` | `activate`. */
  t: string;
  at: number;
}

export interface FetchDiagSnapshot {
  v: 1;
  now: number;
  startedAt: number;
  /** Скільки подій узагалі побачено (буфер кільцевий). */
  total: number;
  /** Скільки з буфера досі не завершено. */
  pending: number;
  marks: DiagMark[];
  fetches: FetchDiagEntry[];
}

const ID_SEGMENT_RE = /^[0-9a-f-]{8,}$/i;
const DIGITS_RE = /\d{4,}/;

/** Маскує id-подібні сегменти; `/assets/*` (хешовані імена збірки) лишає як є. */
export function sanitizePath(rawUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(rawUrl, "https://sw.invalid").pathname;
  } catch {
    return "?";
  }
  if (pathname.startsWith("/assets/")) return pathname.slice(0, 120);
  return pathname
    .split("/")
    .map((seg) =>
      seg.length > 24 || ID_SEGMENT_RE.test(seg) || DIGITS_RE.test(seg)
        ? ":x"
        : seg,
    )
    .join("/")
    .slice(0, 120);
}

export class FetchDiagBuffer {
  private fetches: FetchDiagEntry[] = [];
  private marks: DiagMark[] = [];
  private total = 0;
  readonly startedAt: number;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly capacity: number = FETCH_DIAG_CAPACITY,
  ) {
    this.startedAt = now();
  }

  start(url: string, mode: string, destination: string): FetchDiagEntry {
    const entry: FetchDiagEntry = {
      p: sanitizePath(url),
      m: mode,
      d: destination || "",
      h: null,
      st: "dispatch",
      s: this.now(),
      e: null,
      o: null,
    };
    this.total += 1;
    this.fetches.push(entry);
    if (this.fetches.length > this.capacity) this.fetches.shift();
    return entry;
  }

  stage(entry: FetchDiagEntry | undefined, stage: FetchStage): void {
    if (entry && entry.e === null) entry.st = stage;
  }

  handler(entry: FetchDiagEntry | undefined, name: string): void {
    if (entry && entry.h === null) {
      entry.h = name;
      entry.st = "handler";
    }
  }

  finish(entry: FetchDiagEntry | undefined, outcome: "ok" | "error"): void {
    if (!entry || entry.e !== null) return;
    entry.e = this.now();
    entry.o = outcome;
    entry.st = "done";
  }

  mark(type: string): void {
    this.marks.push({ t: type, at: this.now() });
    if (this.marks.length > MARK_CAPACITY) this.marks.shift();
  }

  snapshot(): FetchDiagSnapshot {
    return {
      v: 1,
      now: this.now(),
      startedAt: this.startedAt,
      total: this.total,
      pending: this.fetches.filter((f) => f.e === null).length,
      marks: this.marks.map((m) => ({ ...m })),
      fetches: this.fetches.map((f) => ({ ...f })),
    };
  }
}

/** Єдиний буфер воркера. */
export const fetchDiag = new FetchDiagBuffer();

declare const self: ServiceWorkerGlobalScope;

const entries = new WeakMap<Event, FetchDiagEntry>();

/**
 * Реєструє fetch-слухача, що лише спостерігає (без `respondWith`). Має бути
 * зареєстрований ДО workbox-роутів, щоб бачити і запити, яких жоден route не
 * взяв (`h === null`).
 */
export function installFetchDiagListener(): void {
  self.addEventListener("fetch", (event: FetchEvent) => {
    try {
      const { url, mode, destination } = event.request;
      entries.set(event, fetchDiag.start(url, mode, destination));
    } catch {
      /* діагностика ніколи не ламає fetch */
    }
  });
}

interface PluginCtx {
  event?: Event;
}

/**
 * Workbox-плагін: мітить стадії стратегії. Усі хуки повертають вхідне значення
 * без змін; помилки діагностики ковтаються.
 */
export function createFetchDiagPlugin(name: string) {
  const entry = (ctx: PluginCtx) =>
    ctx.event ? entries.get(ctx.event) : undefined;
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* noop */
    }
  };
  return {
    handlerWillStart: async (ctx: PluginCtx) => {
      safe(() => fetchDiag.handler(entry(ctx), name));
    },
    cachedResponseWillBeUsed: async (
      ctx: PluginCtx & { cachedResponse?: Response },
    ) => {
      safe(() => fetchDiag.stage(entry(ctx), "cache-read"));
      return ctx.cachedResponse;
    },
    requestWillFetch: async (ctx: PluginCtx & { request: Request }) => {
      safe(() => fetchDiag.stage(entry(ctx), "network"));
      return ctx.request;
    },
    fetchDidSucceed: async (ctx: PluginCtx & { response: Response }) => {
      safe(() => fetchDiag.stage(entry(ctx), "network-done"));
      return ctx.response;
    },
    handlerDidRespond: async (ctx: PluginCtx) => {
      safe(() => fetchDiag.stage(entry(ctx), "responded"));
    },
    handlerDidError: async (ctx: PluginCtx) => {
      safe(() => fetchDiag.finish(entry(ctx), "error"));
      return undefined;
    },
    handlerDidComplete: async (ctx: PluginCtx & { error?: Error }) => {
      safe(() => fetchDiag.finish(entry(ctx), ctx.error ? "error" : "ok"));
    },
  };
}
