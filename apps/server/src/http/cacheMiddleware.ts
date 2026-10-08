import type { NextFunction, Request, Response } from "express";

type CachePolicy =
  "no-store" | "no-cache" | "stale-while-revalidate" | "public";

interface CacheOptions {
  policy?: CachePolicy;
  maxAgeSeconds?: number;
}

// `private` is listed first so shared caches (CDNs, corporate proxies) drop
// the response before the `no-store`/`no-cache` directives even apply. Audit
// `2026-05-13-consolidated-page-audit.md` C2: `/api/*` responses are
// user-specific, so they must never land in a shared cache on a multi-user
// device or edge.
const DEFAULT_NO_STORE = {
  private: true,
  "no-store": true,
  "no-cache": true,
  "must-revalidate": true,
};

const DEFAULT_PUBLIC = {
  public: true,
  maxAge: 300,
};

const DEFAULT_STALE_WHILE_REVALIDATE = {
  public: true,
  maxAge: 60,
  staleWhileRevalidate: 300,
};

function buildCacheControl(options: CacheOptions): string {
  const { policy = "no-store", maxAgeSeconds } = options;

  switch (policy) {
    case "no-store":
      return Object.entries(DEFAULT_NO_STORE)
        .map(([k]) => k)
        .join(", ");

    case "no-cache":
      return [
        "no-cache",
        `max-age=${maxAgeSeconds ?? 0}`,
        "must-revalidate",
      ].join(", ");

    case "stale-while-revalidate": {
      const maxAge = maxAgeSeconds ?? DEFAULT_STALE_WHILE_REVALIDATE.maxAge;
      const swr = DEFAULT_STALE_WHILE_REVALIDATE.staleWhileRevalidate;
      return [
        "public",
        `max-age=${maxAge}`,
        `stale-while-revalidate=${swr}`,
      ].join(", ");
    }

    case "public":
      return [
        "public",
        `max-age=${maxAgeSeconds ?? DEFAULT_PUBLIC.maxAge}`,
      ].join(", ");

    default:
      return "private, no-store, no-cache, must-revalidate";
  }
}

/**
 * Публічний `Cache-Control` доживає лише до успішної відповіді.
 *
 * AI-CONTEXT: `cachingMiddleware` ставить заголовок ДО лімітера й хендлера,
 * тож без перекриття його несла будь-яка відповідь, зокрема 429 від
 * лімітера, 400/404 і 503 «база лежить» (аудит 2026-10-01, rel-21):
 * браузер/CDN віддавали б «спробуй за хвилину» з кешу до 10 хв. Перекриваємо
 * у `writeHead`, бо це єдина точка, де вже відомий фінальний статус, а
 * заголовки ще не пішли. 304 лишаємо як є: це підтвердження валідатора для
 * вже закешованого 2xx, і заголовки кешу в ньому мусять збігатися з оригіналом.
 */
function downgradeCacheOnNonSuccess(res: Response): void {
  if (typeof res.writeHead !== "function") return;
  const originalWriteHead = res.writeHead;
  Object.defineProperty(res, "writeHead", {
    configurable: true,
    writable: true,
    value: function writeHead(
      this: Response,
      statusCode: unknown,
      ...rest: unknown[]
    ): unknown {
      if (
        typeof statusCode === "number" &&
        statusCode >= 300 &&
        statusCode !== 304 &&
        !this.headersSent
      ) {
        const current = this.getHeader("Cache-Control");
        if (!(typeof current === "string" && current.includes("no-store"))) {
          this.setHeader("Cache-Control", "no-store");
        }
      }
      return Reflect.apply(originalWriteHead, this, [statusCode, ...rest]);
    },
  });
}

export function cachingMiddleware(
  options: CacheOptions = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const cacheControl = buildCacheControl(options);
  // `no-store`-політика вже найсуворіша — перекривати нічого.
  const publicPolicy = (options.policy ?? "no-store") !== "no-store";

  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", cacheControl);
    if (publicPolicy) downgradeCacheOnNonSuccess(res);
    next();
  };
}

export function noStoreMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
}

export function publicCacheMiddleware(
  maxAgeSeconds = 300,
): (req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}`);
    next();
  };
}
