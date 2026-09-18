import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

/** Клієнт може передати X-Request-Id; інакше генеруємо UUID. */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.get("x-request-id")?.trim();
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
