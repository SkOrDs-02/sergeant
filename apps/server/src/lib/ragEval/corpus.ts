/**
 * Zod-схема + лоадер корпусу документів для RAG-евалу.
 *
 * Файл фікстури: `apps/server/src/__fixtures__/rag-eval/corpus.json`
 * (генерується `scripts/rag-eval/gen-corpus.mjs`, вихід комітиться).
 *
 * Навіщо корпус узагалі існує. `golden.json` називає 73 очікувані
 * документи через стабільні `<source>:<sourceRef>` refs, але текстів за
 * цими refs не існувало ніде - ні в репозиторії, ні в сідах. Через це
 * `live`-режим евалу було нíчим наповнити: пошук потребує корпусу, в
 * якому шукати. Цей модуль дає корпусу схему й інваріанти.
 *
 * Ключовий інваріант - не розмір, а конкуренція. Recall@4 проти
 * випадкових відволікачів з інших доменів тривіально дорівнює 1.0:
 * крос-доменна косинусна відстань у мультимовній моделі величезна. За
 * місце в топ-4 конкурує документ **про те саме, але з неправильною
 * відповіддю** - той самий шаблон з іншим тижнем, іншим знаком суми,
 * іншою категорією. Тому кожен near-miss несе `variantOf` - id золотого
 * документа, конкурентом якого він є, - і тест вимагає ≥3 таких на кожен
 * золотий. Ratio корпусу до золотих - наслідок цього правила, не його
 * причина.
 *
 * Caller-и:
 *   - `scripts/rag-eval/gen-corpus.mjs` (генерація; валідує свій вихід)
 *   - `apps/server/src/lib/ragEval/corpus.test.ts` (інваріанти)
 *   - `apps/server/src/scripts/ragEvalEmbed.ts` (ембеддинг у фікстуру)
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

/**
 * Домени корпусу RAG-евалу — власний, ЗАМОРОЖЕНИЙ словник, розчеплений
 * від `ai_memories.source` (ініціатива 0024, PR-3, 2026-09-19).
 *
 * До PR-3 ця схема validувалась проти `STORED_MEMORY_SOURCES` з
 * `modules/ai-memory/types.ts` (= ALLOWED + RETIRED, тобто CHECK у БД).
 * PR-3 звузив CHECK до чотирьох живих значень і спорожнив
 * `RETIRED_MEMORY_SOURCES` — але корпус і далі несе рядки з доменами
 * `chat`/`finyk`/`fizruk`/`nutrition`/`routine`/`journal`, бо
 * перепризначення source-ів у фікстурі змінило б `id` документів
 * (`id = "<source>:<sourceRef>"`) і зробило б кешовані ембеддинги
 * (`__fixtures__/rag-eval/embeddings-v1.*`) непридатними без платного
 * перегенерування (`rag-eval:embed`, Voyage). Замінити перегенеруванням
 * можна, але це окрема, платна дія — не наслідок звуження CHECK.
 *
 * Тому корпус більше НЕ прикидається, що його `source` — це реальне
 * значення `ai_memories.source`: це власний domain-словник евалу,
 * навмисно ширший за те, що API сьогодні приймає. Живі INSERT-и в БД
 * (тести з testcontainers) пишуть `source: "digest"` незалежно від цього
 * домену — див. `cachedRecall.ragEval.test.ts` і `scripts/ragEvalLive.ts`.
 */
export const CORPUS_DOMAINS = [
  "chat",
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
  "journal",
  "digest",
  "cofounder",
  "product",
  "profile",
] as const;

export type CorpusDomain = (typeof CORPUS_DOMAINS)[number];

const SOURCE_SCHEMA = z.enum(CORPUS_DOMAINS);

/**
 * Роль документа в корпусі:
 *  - `golden` - на нього посилається `expected_memory_ids` у golden-set;
 *  - `near_miss` - про ту саму сутність, але з неправильною відповіддю;
 *    саме він створює конкуренцію за топ-K;
 *  - `filler` - фон іншої тематики. Не конкурує, але задає реалістичний
 *    розмір індексу, на якому ANN узагалі має сенс.
 */
export const DOC_ROLES = ["golden", "near_miss", "filler"] as const;

export const CorpusDocSchema = z.object({
  /** Стабільний ref `<source>:<sourceRef>` - той самий формат, що в golden-set. */
  id: z.string().min(1),
  source: SOURCE_SCHEMA,
  sourceRef: z.string().min(1),
  /** Текст, який піде в ембеддинг і в `ai_memories.content`. */
  content: z.string().min(1),
  role: z.enum(DOC_ROLES),
  /**
   * Спільний ключ теми. Золотий документ і його near-miss-и мають
   * однакове значення. Зручно для угруповання, але для інваріанта
   * недостатньо: одну сутність можуть ділити кілька золотих документів,
   * і тоді «≥3 near-miss на сутність» пропустить зникнення конкурентів
   * у конкретного документа. Саме тому є `variantOf`.
   */
  entity: z.string().min(1),
  /**
   * Для `near_miss` - id золотого документа, конкурентом якого він є.
   * Робить інваріант «≥3 near-miss на КОЖЕН золотий документ»
   * перевірюваним прямо, а не через здогад по формату id.
   */
  variantOf: z.string().min(1).optional(),
});

export const CorpusSetSchema = z.object({
  version: z.string().min(1),
  /** Ім'я генератора - щоб ніхто не правив вихід руками. */
  generatedBy: z.string().min(1),
  comment: z.string().optional(),
  docs: z.array(CorpusDocSchema).min(1),
});

export type CorpusDoc = z.infer<typeof CorpusDocSchema>;
export type CorpusSet = z.infer<typeof CorpusSetSchema>;

/**
 * Парсить корпус і перевіряє інваріанти, які не виражаються схемою:
 * унікальність id і його узгодженість із парою (source, sourceRef).
 * Pure - без I/O.
 */
export function parseCorpusSet(raw: unknown): CorpusSet {
  const parsed = CorpusSetSchema.parse(raw);
  const seen = new Set<string>();
  for (const doc of parsed.docs) {
    if (seen.has(doc.id)) {
      throw new Error(`Duplicate corpus doc id: ${doc.id}`);
    }
    seen.add(doc.id);

    const expected = `${doc.source}:${doc.sourceRef}`;
    if (doc.id !== expected) {
      throw new Error(
        `Corpus doc id "${doc.id}" does not match source:sourceRef ("${expected}")`,
      );
    }
  }
  return parsed;
}

/**
 * Відбиток **текстів** корпусу - саме того, що поїхало в ембеддинг.
 *
 * Навмисно не sha цілого файлу: роль, сутність, коментар і форматування
 * на вектори не впливають, і зчіплювати фікстуру з ними означало б
 * вимагати платного переембеддингу після кожної правки метаданих.
 * Зміниться бодай один символ тексту або порядок документів - відбиток
 * поїде, і фікстура впаде голосно.
 */
export function corpusTextsFingerprint(corpus: CorpusSet): string {
  const canonical = corpus.docs
    .map((d) => `${d.id}\n${d.content}`)
    .join("\n \n");
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

/** Завантажує канонічну фікстуру з диска. */
export function loadDefaultCorpusSet(): CorpusSet {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixturePath = resolve(
    here,
    "..",
    "..",
    "__fixtures__",
    "rag-eval",
    "corpus.json",
  );
  const raw = JSON.parse(readFileSync(fixturePath, "utf-8")) as unknown;
  return parseCorpusSet(raw);
}
