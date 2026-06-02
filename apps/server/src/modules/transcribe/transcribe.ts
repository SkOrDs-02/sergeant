import type { Request, Response } from "express";
import { TranscribeQuerySchema } from "@sergeant/shared";
import { parseQuery } from "../../http/validate.js";
import { transcribeAudio, GroqTranscribeError } from "../../lib/groq.js";
import { logger } from "../../obs/logger.js";
import { assertTranscribeUsdCap, recordTranscribeUsdSpend } from "./usdCap.js";
import { env } from "../../env/env.js";

type WithGroqKey = Request & { groqKey?: string };

/**
 * M4 — Groq Whisper model allowlist. Enforcement lives at the env
 * single-source-of-truth: `GROQ_TRANSCRIBE_MODEL` is a `z.enum`
 * (`whisper-large-v3-turbo` | `whisper-large-v3`) with a default in
 * `apps/server/src/env/env.ts`. An unknown / experimental model fails the
 * enum → boot fail-fast at env parse (before the HTTP server accepts
 * traffic), so whoever owns Railway env (or a leaked token) cannot silently
 * swap models without a code-review trail on the enum.
 *
 * HR-2 (dead-code/hard-rules): this used to read `process.env` directly with
 * a duplicated Set; it now reads the Zod-validated `env`, removing the last
 * Groq `process.env[…]` read. See `docs/security/hardening/M4-groq-model-allowlist.md`.
 */
function resolveGroqModel(): "whisper-large-v3-turbo" | "whisper-large-v3" {
  return env.GROQ_TRANSCRIBE_MODEL;
}

const GROQ_MODEL = resolveGroqModel();

export const __testing = {
  resolveGroqModel,
};

/**
 * M5 — canonical audio MIME list + alias normaliser. Groq Whisper accepts
 * only canonical types (`audio/wav`, `audio/mp4`, …); historical aliases
 * (`audio/x-wav`, `audio/wave`, `audio/m4a`, `audio/mp3`) get folded onto
 * the canonical form before validation, which trims the attack surface for
 * future ffmpeg / parser bugs and removes a duplicate-validation footgun.
 * See `docs/security/hardening/M5-audio-mime-normalize.md`.
 */
const SUPPORTED_AUDIO_MIME = new Set<string>([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/flac",
]);

const AUDIO_MIME_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
};

function normaliseAudioMime(ct: string): string {
  return AUDIO_MIME_ALIASES[ct] ?? ct;
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

export { TranscribeQuerySchema };

function pickMimeType(req: Request): string | null {
  const raw = req.headers["content-type"];
  if (!raw || typeof raw !== "string") return null;
  const ct = raw!.split(";")[0]!.trim().toLowerCase();
  if (!ct.startsWith("audio/")) return null;
  const normalised = normaliseAudioMime(ct);
  if (!SUPPORTED_AUDIO_MIME.has(normalised)) return null;
  return normalised;
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
    // Не світимо назву env-змінної клієнту: вона потрапляє у formatApiError
    // і показується юзеру дослівно. Дискримінатор для frontend — `code`.
    res.status(503).json({
      error: "Голосове введення тимчасово недоступне. Спробуй пізніше.",
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

  const { language, prompt } = parseQuery(TranscribeQuerySchema, req);

  // M4 — `GROQ_MODEL` is resolved + allowlist-validated at module load,
  // not per request, so a bad env-var fails the boot rather than every
  // call. See `docs/security/hardening/M4-groq-model-allowlist.md`.
  const model = GROQ_MODEL;

  // H9 — pre-charge per-user-per-day USD cap. Після MIME / size / query
  // validation, але ДО Groq-виклику. Якщо cap буде перевищений — handler
  // негайно повертає 402, і ми не платимо за цю транскрипцію.
  // `assertTranscribeUsdCap` сам відправляє 402 у `res`, тут лише
  // достроково виходимо.
  const capCheck = await assertTranscribeUsdCap(req, res, body.length, model);
  if (!capCheck.ok) return;

  // Прокидаємо abort при client-disconnect, щоб не платити за марний upstream.
  const abortController = new AbortController();
  req.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

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
    // H9 — post-success accounting. Не списуємо за провалений Groq
    // виклик (catch нижче), бо upstream теж не виставляє рахунку за
    // 5xx. Викликаємо до `res.json` щоб тестувати ledger-стан після
    // запиту, і не блокуємо response (recordTranscribeUsdSpend сам
    // ковтає всі помилки).
    await recordTranscribeUsdSpend(req, body.length, model);
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
