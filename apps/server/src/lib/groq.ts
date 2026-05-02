import { recordExternalHttp } from "./externalHttp.js";
import { elapsedMs, isAbortError } from "./timing.js";

const GROQ_TRANSCRIBE_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

export interface GroqTranscribeOptions {
  /** API ключ — передаємо явно, не читаємо з env (handler уже валідував). */
  apiKey: string;
  /** Whisper-модель Groq, наприклад `whisper-large-v3-turbo`. */
  model: string;
  /** Аудіо-байти (повний файл — Groq не підтримує streaming upload). */
  audio: Buffer;
  /** MIME-тип; впливає на ім'я файлу і `Content-Type` form-частини. */
  mimeType: string;
  /**
   * ISO-код мови (`uk`, `en`, ...). Якщо `null/undefined` — Whisper
   * визначить автоматично (повільніше і менш точно).
   */
  language?: string;
  /**
   * Доменна підказка (≤ 1024 токени). Драматично покращує точність
   * на спеціалізованій лексиці: списки вправ, назви продуктів, категорії
   * витрат. Анг + укр одночасно ОК.
   */
  prompt?: string;
  /** Hard timeout у мс для upstream-виклику. */
  timeoutMs?: number;
  /**
   * AbortSignal, що скасовує запит при client-disconnect (Express `req`).
   * Комбінується з внутрішнім timeout.
   */
  signal?: AbortSignal;
}

export interface GroqTranscribeResult {
  /** Транскрибований текст. Whisper повертає вже trimmed. */
  text: string;
  /**
   * Тривалість аудіо в секундах, якщо upstream її повернув. Корисно для
   * метрик і логів. `null` коли поле відсутнє.
   */
  durationSec: number | null;
}

export class GroqTranscribeError extends Error {
  public readonly status: number;
  public readonly outcome: string;
  constructor(message: string, status: number, outcome: string) {
    super(message);
    this.name = "GroqTranscribeError";
    this.status = status;
    this.outcome = outcome;
  }
}

function pickFileName(mimeType: string): string {
  // Groq визначає формат за розширенням; узгоджуємо з MIME явно.
  if (mimeType.includes("webm")) return "audio.webm";
  if (mimeType.includes("mp4")) return "audio.mp4";
  if (mimeType.includes("m4a")) return "audio.m4a";
  if (mimeType.includes("mpeg")) return "audio.mp3";
  if (mimeType.includes("wav")) return "audio.wav";
  if (mimeType.includes("ogg")) return "audio.ogg";
  if (mimeType.includes("flac")) return "audio.flac";
  return "audio.webm";
}

function composeSignal(
  internal: AbortController,
  external: AbortSignal | undefined,
): AbortSignal {
  if (!external) return internal.signal;
  // `AbortSignal.any` доступний у Node ≥ 20.3 і всіх сучасних браузерах.
  // Feature-detect через property-check, без double-cast.
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([internal.signal, external]);
  }
  if (external.aborted) internal.abort();
  else
    external.addEventListener("abort", () => internal.abort(), { once: true });
  return internal.signal;
}

/**
 * Синхронний proxy у Groq Whisper. Повертає текст або кидає
 * `GroqTranscribeError` з статусом і outcome для метрик. Метрики
 * (`external_http_*`) інкрементуються одноразово на спробу.
 */
export async function transcribeAudio(
  opts: GroqTranscribeOptions,
): Promise<GroqTranscribeResult> {
  const { apiKey, model, audio, mimeType, language, prompt } = opts;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const form = new FormData();
  form.append("model", model);
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);
  if (prompt) form.append("prompt", prompt);
  // Node 20: `Blob` глобально доступний; FormData приймає Blob із file-ім'ям.
  // `Buffer.from(audio).buffer` повертає `ArrayBufferLike` (може бути
  // SharedArrayBuffer), що не сумісне з BlobPart-типом TS — обертаємо у
  // `Uint8Array` зі свіжим ArrayBuffer-копіюванням, щоб тип збігся жорстко.
  const audioCopy = new Uint8Array(audio.length);
  audioCopy.set(audio);
  form.append(
    "file",
    new Blob([audioCopy], { type: mimeType }),
    pickFileName(mimeType),
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = composeSignal(controller, opts.signal);
  const startedAt = process.hrtime.bigint();

  let response: Response | null = null;
  try {
    response = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    });
  } catch (err) {
    const ms = elapsedMs(startedAt);
    const aborted = isAbortError(err);
    const outcome = aborted ? "timeout" : "error";
    recordExternalHttp("groq", outcome, ms);
    throw new GroqTranscribeError(
      aborted ? "Groq запит перервано (timeout)" : "Помилка мережі до Groq",
      aborted ? 504 : 502,
      outcome,
    );
  } finally {
    clearTimeout(timer);
  }

  const ms = elapsedMs(startedAt);

  if (!response.ok) {
    let detail = "";
    try {
      const text = await response.text();
      detail = text.slice(0, 500);
    } catch {
      /* ignore */
    }
    const outcome =
      response.status === 429
        ? "rate_limited"
        : response.status >= 500
          ? "upstream_error"
          : "error";
    recordExternalHttp("groq", outcome, ms);
    throw new GroqTranscribeError(
      `Groq повернув ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status === 429 ? 429 : 502,
      outcome,
    );
  }

  let data: { text?: unknown; duration?: unknown } = {};
  try {
    data = (await response.json()) as { text?: unknown; duration?: unknown };
  } catch {
    recordExternalHttp("groq", "parse_error", ms);
    throw new GroqTranscribeError(
      "Не вдалося розпарсити відповідь Groq",
      502,
      "parse_error",
    );
  }

  recordExternalHttp("groq", "ok", ms);
  const text = typeof data.text === "string" ? data.text.trim() : "";
  const durationSec =
    typeof data.duration === "number" && Number.isFinite(data.duration)
      ? data.duration
      : null;
  return { text, durationSec };
}
