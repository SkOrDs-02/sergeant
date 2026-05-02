import type { NextFunction, Request, Response } from "express";
import { AsyncLocalStorage } from "async_hooks";

/**
 * AsyncLocalStorage-контекст запиту. Заповнюється в `withRequestContext`
 * (після `requestIdMiddleware`). Будь-який код, що виконується у межах
 * запиту — включно з db-wrapperами, AI-викликами, webhook-handler-ами —
 * автоматично бачить `requestId`/`userId`, не приймаючи `req` як параметр.
 *
 * Usage:
 *   import { als, setUserId } from "./obs/requestContext.js";
 *   const ctx = als.getStore();          // { requestId, userId, module }
 *   setUserId("usr_123");                // коли сесія отримана
 *   setRequestModule("nutrition");       // коли відомий модуль
 */
export interface RequestContextStore {
  requestId: string | null;
  userId: string | null;
  module: string | null;
  /** W3C-сумісний trace ID (32 hex chars). Встановлюється `traceMiddleware`. */
  traceId: string | null;
}

export const als = new AsyncLocalStorage<RequestContextStore>();

export function withRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const store: RequestContextStore = {
    requestId: (req as Request & { requestId?: string }).requestId ?? null,
    userId: null,
    module: null,
    traceId: null,
  };
  als.run(store, () => next());
}

export function getRequestContext(): RequestContextStore | null {
  return als.getStore() ?? null;
}

export function setUserId(userId: string | null): void {
  const store = als.getStore();
  if (store) store.userId = userId;
}

export function setRequestModule(mod: string | null): void {
  const store = als.getStore();
  if (store) store.module = mod;
}

export function setTraceId(traceId: string | null): void {
  const store = als.getStore();
  if (store) store.traceId = traceId;
}
