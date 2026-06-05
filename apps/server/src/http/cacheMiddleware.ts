import type { NextFunction, Request, Response } from "express";

type CachePolicy = "no-store" | "no-cache" | "stale-while-revalidate" | "public";

interface CacheOptions {
  policy?: CachePolicy;
  maxAgeSeconds?: number;
}

const DEFAULT_NO_STORE = {
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
      return "no-store, no-cache, must-revalidate";
  }
}

export function cachingMiddleware(options: CacheOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const cacheControl = buildCacheControl(options);

  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", cacheControl);
    next();
  };
}

export function noStoreMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
}

export function publicCacheMiddleware(maxAgeSeconds = 300): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}`);
    next();
  };
}