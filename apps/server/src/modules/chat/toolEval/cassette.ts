/**
 * Касета стенду вибору інструментів - записаний живий прогін, який далі
 * відтворюється без мережі.
 *
 * Той самий патерн, що кешовані ембеддинги RAG-евалу: платне тут - лише
 * відповідь моделі. Один раз оплатили, поклали в фікстуру, і далі кожен PR
 * безкоштовно перевіряє, чи не зламав він оцінювання, промпт, реєстр
 * інструментів або схеми аргументів. Дрейф самої моделі касета НЕ ловить за
 * побудовою - його ловить живий прогін, і це різні питання, які не можна
 * змішувати в одному червоному кольорі.
 *
 * Маніфест пінить рівно те, що робить запис валідним. Розбіжність валить
 * перевірку ДО оцінювання і називає, що саме розійшлось - інакше зміна
 * системного промпта виглядала б як «модель провалила всі кейси», а не як
 * «касета протухла». Той самий урок, що з `VOYAGE_EMBEDDING_MODEL` у
 * RAG-евалі.
 *
 * Перезапис касети - ручна дія (`pnpm eval:tools --record`), і вона коштує
 * грошей. Не «освіжай» її мимохідь, щоб загасити червоний тест: спершу
 * подивись, ЩО саме розійшлось.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   Шлях складається з константи `CASSETTE_DIR` (резолвиться від `import.meta.url`)
   і слага моделі, з якого `cassetteSlug` вирізає все, крім `[a-z0-9-]`. Ані
   користувацького вводу, ані сегментів шляху сюди не потрапляє: імʼя моделі
   приходить із прод-константи `CHAT_MODEL_DEFAULTS` або з аргументу CLI, який
   запускає розробник власноруч. */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SYSTEM_PREFIX, TOOLS } from "../tools.js";
import { DATA_BLOCK } from "./dataBlock.js";
import type { EvalBlock } from "./scoring.js";

export interface RecordedTurn {
  /** Блоки відповіді моделі на цьому ході, як їх віддав API. */
  blocks: EvalBlock[];
  /** Що було віддано моделі як `tool_result` перед цим ходом; `null` - перший хід. */
  fedResult: string | null;
}

export interface RecordedCase {
  name: string;
  turns: RecordedTurn[];
  /** Транспортна помилка на записі - кейс лишається у файлі, але без ходів. */
  error?: string;
}

export interface CassetteManifest {
  model: string;
  recordedAt: string;
  caseCount: number;
  systemPrefixSha: string;
  toolsSha: string;
  dataBlockSha: string;
}

export interface Cassette {
  manifest: CassetteManifest;
  cases: RecordedCase[];
}

const CASSETTE_DIR = fileURLToPath(
  new URL("../../../__fixtures__/tool-eval/cassettes/", import.meta.url),
);

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Імʼя моделі як імʼя файлу: `google/gemini-3.7-flash` → `google-gemini-3-7-flash`. */
export function cassetteSlug(model: string): string {
  return model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export function cassettePath(model: string): string {
  return `${CASSETTE_DIR}${cassetteSlug(model)}.json`;
}

export function buildManifest(
  model: string,
  caseCount: number,
  recordedAt: string,
): CassetteManifest {
  return {
    model,
    recordedAt,
    caseCount,
    systemPrefixSha: sha(SYSTEM_PREFIX),
    toolsSha: sha(JSON.stringify(TOOLS)),
    dataBlockSha: sha(DATA_BLOCK),
  };
}

/**
 * Fail-loud: що саме розійшлось між касетою і поточним деревом.
 *
 * Повертає список розбіжностей, а не булеве значення, бо «касета невалідна» без
 * імені винуватця змушує наступну людину гадати, і найдешевша гадка -
 * перезаписати касету за гроші.
 */
export function manifestMismatches(manifest: CassetteManifest): string[] {
  const now = buildManifest(manifest.model, manifest.caseCount, "");
  const out: string[] = [];
  if (manifest.systemPrefixSha !== now.systemPrefixSha) {
    out.push(
      "SYSTEM_PREFIX змінився - касета записана на іншому системному промпті",
    );
  }
  if (manifest.toolsSha !== now.toolsSha) {
    out.push(
      "реєстр TOOLS змінився - інструмент додано, прибрано або переписано його схему чи опис",
    );
  }
  if (manifest.dataBlockSha !== now.dataBlockSha) {
    out.push("DATA_BLOCK змінився - модель бачила інший контекст");
  }
  return out;
}

export function loadCassette(model: string): Cassette | null {
  const path = cassettePath(model);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Cassette;
}

export function saveCassette(cassette: Cassette): void {
  mkdirSync(CASSETTE_DIR, { recursive: true });
  writeFileSync(
    cassettePath(cassette.manifest.model),
    `${JSON.stringify(cassette, null, 2)}\n`,
    "utf8",
  );
}
