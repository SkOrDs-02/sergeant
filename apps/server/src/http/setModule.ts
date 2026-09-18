import type { RequestHandler } from "express";
import { setRequestModule } from "../obs/requestContext.js";

/**
 * Router-level middleware, що тегує всі запити в ланцюгу іменем доменного
 * модуля (`nutrition`, `coach`, `push`, `sync`, ...). Теги потрапляють у
 * logger (ALS) і метрики (`module`-label), тож по графіках видно, який
 * домен генерує помилки / навантаження.
 *
 * Замінює per-handler виклики `setRequestModule("...")`, що повторювалися у
 * 25+ місцях.
 */
export function setModule(name: string): RequestHandler {
  return (_req, _res, next) => {
    setRequestModule(name);
    next();
  };
}
