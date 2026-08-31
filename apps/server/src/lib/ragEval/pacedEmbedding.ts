/**
 * Ембеддинг корпусу з витримкою темпу - спільний для генерації фікстури
 * і для живого прогону.
 *
 * Навіщо окремий модуль, якщо у прод-клієнта вже є батчинг. Клієнт
 * свідомо шле всі батчі паралельно (`Promise.all` у `embedBatch`), і для
 * живої інжесції це правильно: там кілька фактів за раз, а не сотні.
 * Обидва сценарії евалу шлють 780 текстів одним махом, тобто 25 батчів
 * одночасно - і на акаунті без платіжного методу (3 запити на хвилину)
 * це гарантований 429 з відкриттям circuit breaker-а.
 *
 * Коштувало це одного мовчазного зеленого прогону: живий workflow
 * відпрацював за 26 секунд, упав на 429 і лишився зеленим, бо крок стояв
 * під `|| true`. Пейсинг жив тільки в скрипті генерації фікстури, а в
 * живий не переїхав - саме тому він тепер тут, один на обох.
 *
 * Батчинг, ретраї, маскування, бюджет і `input_type` лишаються
 * прод-клієнтові: форк цієї логіки знищив би сенс евалу.
 */

import type { EmbeddingProvider } from "../../modules/ai-memory/types.js";
import { env } from "../../env.js";

/**
 * Пауза між викликами, у мілісекундах. `RAG_EVAL_EMBED_RPM` піднімає
 * темп на акаунті зі стандартними лімітами; дефолт розрахований на
 * безплатний тариф Voyage (3 запити на хвилину).
 */
export function pacingMs(): number {
  const rpm = Number(process.env["RAG_EVAL_EMBED_RPM"] ?? "3");
  return (
    Math.ceil(60_000 / (Number.isFinite(rpm) && rpm > 0 ? rpm : 3)) + 1_000
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { retryable?: boolean }).retryable === true
  );
}

/**
 * Проганяє тексти по одному батчу за раз, витримуючи темп і відступаючи
 * на 429. Повертає вектори в порядку вхідних текстів.
 */
export async function embedSequentially(
  provider: EmbeddingProvider,
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const size = env.VOYAGE_BATCH_SIZE;
  const delay = pacingMs();
  const out: Float32Array[] = [];

  for (let start = 0; start < texts.length; start += size) {
    const chunk = texts.slice(start, start + size);

    let attempt = 0;
    for (;;) {
      try {
        const vectors = await provider.embedBatch(chunk, {
          criticality: "non-critical",
        });
        out.push(...vectors);
        break;
      } catch (error) {
        if (!isRetryable(error) || attempt >= 5) throw error;
        attempt++;
        const backoff = delay * (attempt + 1);
        console.warn(
          `  батч ${Math.floor(start / size) + 1}: ${(error as Error).message.slice(0, 80)} - повтор через ${Math.round(backoff / 1000)} с`,
        );
        await sleep(backoff);
      }
    }

    onProgress?.(out.length, texts.length);
    if (start + size < texts.length) await sleep(delay);
  }

  return out;
}
