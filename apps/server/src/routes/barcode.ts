import { Router } from "express";
import {
  cachingMiddleware,
  rateLimitExpress,
  setModule,
} from "../http/index.js";
import barcodeHandler from "../modules/nutrition/barcode.js";

export function createBarcodeRouter(): Router {
  const r = Router();
  // Barcode lookups resolve global product data (Open Food Facts / USDA /
  // UPCitemdb) that is identical for every user and changes rarely — the
  // handler itself keeps a 6h server-side hit cache. Override the global
  // `/api` no-store with a short, revalidating public cache so the same
  // scan within a session is served from the browser/CDN instead of
  // re-hitting three upstreams (PERF-007).
  r.get(
    "/api/barcode",
    setModule("barcode"),
    cachingMiddleware({ policy: "stale-while-revalidate", maxAgeSeconds: 300 }),
    rateLimitExpress({ key: "api:barcode", limit: 30, windowMs: 60_000 }),
    // Ендпоінт відкритий без сесії й ходить на upstream-и з ключами власника
    // (UPCitemdb на trial-плані — 100 запитів/добу на весь проєкт). Хвилинний
    // бакет цієї стелі не бачить: 30/хв дозволяють одному клієнту спалити
    // добову квоту за хвилини. Другий бакет із добовим вікном обмежує саме
    // це, лишаючи запас для реального сканування продуктів.
    rateLimitExpress({
      key: "api:barcode:daily",
      limit: 300,
      windowMs: 24 * 60 * 60_000,
    }),
    barcodeHandler,
  );
  return r;
}
