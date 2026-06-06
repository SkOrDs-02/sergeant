import { Router } from "express";
import {
  asyncHandler,
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
    asyncHandler(foodSearchHandler),
  );
  return r;
}
