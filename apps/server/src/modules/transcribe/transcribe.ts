import type { Request, Response } from "express";
import { TranscribeQuerySchema } from "@sergeant/shared";
import { validateQuery } from "../../http/validate.js";
import { transcribeAudio, GroqTranscribeError } from "../../lib/groq.js";
import { logger } from "../../obs/logger.js";

type WithGroqKey = Request & { groqKey?: string };

const SUPPORTED_AUDIO_MIME = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
];

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

export { TranscribeQuerySchema };

function pickMimeType(req: Request): string | null {
  const raw = req.headers["content-type"];
  if (!raw || typeof raw !== "string") return null;
  const ct = raw.split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("audio/")) return null;
  if (!SUPPORTED_AUDIO_MIME.includes(ct)) return null;
  return ct;
}

/**
 * `POST /api/transcribe` — приймає сирий аудіо-блоб (Content-Type: `audio/*`),
 * проксі-кидає у Groq Whisper, повертає `{ text, durationSec }`.
 *
 * Body parser — `express.raw({ type: "audio/*", limit: "10mb" })` (див.
 * `app.ts`); звідси `req.body` — це `Buffer`.
 */
export default async function transcribeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const groqKey = (req as WithGroqKey).groqKey;
  if (!groqKey) {
    // requireGroqKey() мав уже відсіяти, але double-check для безпеки.
    res.status(503).json({
      error: "GROQ_API_KEY не сконфігурований",
      code: "GROQ_KEY_MISSING",
    });
    return;
  }

  const mimeType = pickMimeType(req);
  if (!mimeType) {
    res.status(415).json({
      error:
        "Непідтримуваний Content-Type — очікую audio/webm, audio/mp4, audio/ogg тощо",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    return;
  }

  // Тіло — Buffer, бо роутер змонтований після `express.raw({ type: "audio/*" })`.
  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({
      error: "Порожнє тіло запиту — очікую аудіо-блоб",
      code: "EMPTY_BODY",
    });
    return;
  }
  if (body.length > MAX_AUDIO_BYTES) {
    res.status(413).json({
      error: `Аудіо завелике (${body.length} байт), максимум ${MAX_AUDIO_BYTES}`,
      code: "PAYLOAD_TOO_LARGE",
    });
    return;
  }

  const parsed = validateQuery(TranscribeQuerySchema, req, res);
  if (!parsed.ok) return;
  const { language, prompt } = parsed.data;

  // Прокидаємо abort при client-disconnect, щоб не платити за марний upstream.
  const abortController = new AbortController();
  req.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  const model = process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo";

  try {
    const result = await transcribeAudio({
      apiKey: groqKey,
      model,
      audio: body,
      mimeType,
      language,
      prompt,
      signal: abortController.signal,
    });
    res.json({
      text: result.text,
      durationSec: result.durationSec,
      model,
    });
  } catch (err) {
    if (err instanceof GroqTranscribeError) {
      logger.warn({
        msg: "transcribe_upstream_failed",
        status: err.status,
        outcome: err.outcome,
        bytes: body.length,
        mimeType,
      });
      res.status(err.status).json({
        error: err.message,
        code: "TRANSCRIBE_UPSTREAM_FAILED",
        outcome: err.outcome,
      });
      return;
    }
    throw err;
  }
}
