import { Router } from "express";
import {
  cachingMiddleware,
  rateLimitExpress,
  setModule,
} from "../http/index.js";
import foodSearchHandler from "../modules/nutrition/food-search.js";

export function createFoodSearchRouter(): Router {
  const r = Router();
  // Food search proxies global nutrition databases (Open Food Facts + USDA);
  // results for a given query are the same for every user and change slowly.
  // Override the global `/api` no-store with a short, revalidating public
  // cache so repeated/typeahead searches are served from the browser/CDN
  // instead of re-hitting the upstreams each keystroke (PERF-007).
  r.get(
    "/api/food-search",
    setModule("nutrition"),
    cachingMiddleware({ policy: "stale-while-revalidate", maxAgeSeconds: 300 }),
    rateLimitExpress({ key: "api:food-search", limit: 40, windowMs: 60_000 }),
    // Ендпоінт відкритий без сесії й витрачає USDA-ключ власника, у якого
    // власна погодинна/добова стеля на весь проєкт. Хвилинний бакет її не
    // бачить (40/хв = 57k/добу з однієї адреси), тому доповнюємо його добовим
    // вікном — typeahead реальної людини в нього вкладається з запасом.
    rateLimitExpress({
      key: "api:food-search:daily",
      limit: 600,
      windowMs: 24 * 60 * 60_000,
    }),
    foodSearchHandler,
  );
  return r;
}
