/**
 * Status: Active.
 * Authenticated hard-delete for all server-side AI memories of the user.
 */
import type { Request, Response } from "express";
import type { AiMemoryClearResponse } from "@sergeant/shared";
import { getAiMemory } from "./bootstrap.js";
import { purgeQueuedIngestForUser } from "./ingestQueue.js";
import { cancelPendingProfileMirror } from "./profileMirrorDebounce.js";

type WithSessionUser = Request & { user?: { id: string } };

export async function clearAiMemoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;
  // B12 (аудит ai-pipeline-2026-08-05): порядок важливий. Спершу глушимо
  // відкладене дзеркалення профілю, потім ставимо мітку очищення і знімаємо
  // задачі з черги, і лише тоді видаляємо рядки. Інакше задачі, що вже
  // лежали в Redis, повертали б стерті факти після «Очистити памʼять».
  await cancelPendingProfileMirror(userId);
  await purgeQueuedIngestForUser(userId);
  const deleted = await getAiMemory().forgetUser(userId);
  const payload: AiMemoryClearResponse = { ok: true, deleted };
  res.status(200).json(payload);
}
