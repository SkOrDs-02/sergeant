/**
 * Status: Active.
 * Authenticated hard-delete for all server-side AI memories of the user.
 */
import type { Request, Response } from "express";
import type { AiMemoryClearResponse } from "@sergeant/shared";
import { getAiMemory } from "./bootstrap.js";

type WithSessionUser = Request & { user?: { id: string } };

export async function clearAiMemoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;
  const deleted = await getAiMemory().forgetUser(userId);
  const payload: AiMemoryClearResponse = { ok: true, deleted };
  res.status(200).json(payload);
}
