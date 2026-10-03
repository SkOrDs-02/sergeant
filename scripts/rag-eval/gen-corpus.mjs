#!/usr/bin/env node
// scripts/rag-eval/gen-corpus.mjs
//
// Генератор корпусу RAG-евалу: `corpus-seed.json` →
// `apps/server/src/__fixtures__/rag-eval/corpus.json`.
//
// Навіщо генератор, якщо вихід усе одно комітиться. Корпус має бути
// відтворюваним: `--check` доводить, що закоммічений файл - рівно те, що
// дає поточний seed, і ніхто не правив вихід руками. Той самий патерн, що
// `design:check-md`.
//
// Що робить:
//   1. Читає seed: 73 золоті документи (шаблон + параметри + декларація
//      `vary`) і фонові шаблони.
//   2. На кожен золотий документ розгортає рівно 3 near-miss - той самий
//      текст з іншим тижнем, іншою сумою або іншою альтернативою. Саме
//      вони створюють конкуренцію за топ-K; без них recall@4 тривіально
//      дорівнює 1.0, бо крос-доменна відстань величезна.
//   3. Добиває фон до цільового розміру комбінаціями слотів.
//
// Детермінізм: жодного Math.random і жодного Date.now. Усі варіації -
// арифметика від індексу, тому два прогони дають байт-у-байт однаковий
// файл.
//
// Usage:
//   node scripts/rag-eval/gen-corpus.mjs            # записати вихід
//   node scripts/rag-eval/gen-corpus.mjs --check    # порівняти, не писати

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SEED_PATH = resolve(__dirname, "corpus-seed.json");
const GOLDEN_PATH = resolve(
  REPO_ROOT,
  "apps/server/src/__fixtures__/rag-eval/golden.json",
);
const OUT_PATH = resolve(
  REPO_ROOT,
  "apps/server/src/__fixtures__/rag-eval/corpus.json",
);

/** Скільки near-miss розгортається на кожен золотий документ. */
const NEAR_MISS_PER_GOLDEN = 3;
/** Цільовий розмір корпусу. Фон добивається до цього числа. */
const TARGET_SIZE = 730;

/** Множники суми для трьох near-miss. Підібрані так, щоб не збігтись між собою. */
const AMOUNT_FACTORS = [0.82, 1.31, 0.64];
/** Зсуви тижня для трьох near-miss: сусідній, дальший і наступний. */
const WEEK_SHIFTS = [-1, -2, 1];

/**
 * Форматує число так само, як воно виглядало у seed: ціле лишається
 * цілим, дробове тримає один знак. Інакше near-miss відрізнявся б від
 * золотого не лише значенням, а й формою запису - і модель могла б
 * чіплятись за форму.
 */
function formatLikeOriginal(original, next) {
  return Number.isInteger(original)
    ? String(Math.round(next))
    : next.toFixed(1);
}

function renderTemplate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in params)) {
      throw new Error(`Template references unknown param "{${key}}"`);
    }
    return String(params[key]);
  });
}

/**
 * Будує параметри i-го near-miss із параметрів золотого документа,
 * застосовуючи всі правила з `vary`.
 */
function varyParams(params, vary, i) {
  const next = { ...params };
  for (const rule of vary) {
    if (rule === "week") {
      if (typeof next["week"] !== "number") {
        throw new Error('vary "week" requires a numeric `week` param');
      }
      next["week"] = next["week"] + WEEK_SHIFTS[i];
      continue;
    }

    if (rule === "amount") {
      for (const [key, value] of Object.entries(next)) {
        if (key === "week" || typeof value !== "number") continue;
        next[key] = formatLikeOriginal(value, value * AMOUNT_FACTORS[i]);
      }
      continue;
    }

    if (rule.startsWith("alt:")) {
      const [, key, ...alts] = rule.split(":");
      // Значення альтернативи саме може містити ":" (час "23:00"), тому
      // ділимо на рівно NEAR_MISS_PER_GOLDEN частин з кінця.
      if (alts.length < NEAR_MISS_PER_GOLDEN) {
        throw new Error(
          `vary rule "${rule}" must provide ${NEAR_MISS_PER_GOLDEN} alternatives`,
        );
      }
      const chunkSize = alts.length / NEAR_MISS_PER_GOLDEN;
      if (!Number.isInteger(chunkSize)) {
        throw new Error(
          `vary rule "${rule}" has ${alts.length} segments, not divisible by ${NEAR_MISS_PER_GOLDEN}`,
        );
      }
      next[key] = alts.slice(i * chunkSize, (i + 1) * chunkSize).join(":");
      continue;
    }

    throw new Error(`Unknown vary rule: "${rule}"`);
  }
  return next;
}

function splitId(id) {
  const idx = id.indexOf(":");
  if (idx <= 0)
    throw new Error(`Malformed doc id (expect "source:ref"): ${id}`);
  return { source: id.slice(0, idx), sourceRef: id.slice(idx + 1) };
}

function buildDocs(seed) {
  const docs = [];

  for (const entry of seed.golden) {
    const { source, sourceRef } = splitId(entry.id);
    docs.push({
      id: entry.id,
      source,
      sourceRef,
      content: renderTemplate(entry.template, entry.params),
      role: "golden",
      entity: entry.entity,
    });

    for (let i = 0; i < NEAR_MISS_PER_GOLDEN; i++) {
      const params = varyParams(entry.params, entry.vary, i);
      const ref = `${sourceRef}-nm${i + 1}`;
      docs.push({
        id: `${source}:${ref}`,
        source,
        sourceRef: ref,
        content: renderTemplate(entry.template, params),
        role: "near_miss",
        entity: entry.entity,
        variantOf: entry.id,
      });
    }
  }

  // Фон. Розподіляємо рівномірно по шаблонах; слоти обираються взаємно
  // простими кроками, щоб комбінації не зациклювались на перших кількох.
  const remaining = TARGET_SIZE - docs.length;
  if (remaining < 0) {
    throw new Error(
      `Seed already yields ${docs.length} docs, over target ${TARGET_SIZE}`,
    );
  }
  const templates = seed.fillerTemplates;
  const STEPS = [3, 5, 7, 11, 13];

  for (let n = 0; n < remaining; n++) {
    const t = templates[n % templates.length];
    const j = Math.floor(n / templates.length);
    const params = {};
    let slotIdx = 0;
    for (const [key, values] of Object.entries(t.slots)) {
      params[key] = values[(j * STEPS[slotIdx % STEPS.length]) % values.length];
      slotIdx++;
    }
    // Детермінована «сума» - щоб фон не був однаковим числом усюди.
    params["amount"] = 100 + ((j * 37) % 900);

    const ref = `filler-${n.toString().padStart(3, "0")}`;
    docs.push({
      id: `${t.source}:${ref}`,
      source: t.source,
      sourceRef: ref,
      content: renderTemplate(t.template, params),
      role: "filler",
      entity: `${t.entity}-${n}`,
    });
  }

  return docs;
}

/**
 * Перевіряє те, що не виражається схемою і що робить корпус придатним
 * для евалу: усі очікувані golden-set refs існують у корпусі, у кожного
 * золотого документа є near-miss-конкуренти, id унікальні.
 */
function assertInvariants(docs, golden) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  if (byId.size !== docs.length) {
    throw new Error("Duplicate doc ids in generated corpus");
  }

  const expected = new Set();
  for (const q of golden.queries) {
    for (const ref of q.expected_memory_ids) expected.add(ref);
  }

  const missing = [...expected].filter((ref) => !byId.has(ref));
  if (missing.length > 0) {
    throw new Error(
      `Corpus is missing ${missing.length} golden refs: ${missing.slice(0, 5).join(", ")}…`,
    );
  }

  const nonGolden = [...expected].filter(
    (ref) => byId.get(ref).role !== "golden",
  );
  if (nonGolden.length > 0) {
    throw new Error(
      `Golden refs must have role="golden": ${nonGolden.join(", ")}`,
    );
  }

  // Рахуємо саме по `variantOf`, а не по `entity`: одну сутність можуть
  // ділити кілька золотих документів, і тоді зникнення трьох конкурентів
  // у конкретного документа лишилось би непоміченим - перевірено.
  const nearMissByGolden = new Map();
  for (const d of docs) {
    if (d.role !== "near_miss" || !d.variantOf) continue;
    nearMissByGolden.set(
      d.variantOf,
      (nearMissByGolden.get(d.variantOf) ?? 0) + 1,
    );
  }
  for (const ref of expected) {
    const count = nearMissByGolden.get(ref) ?? 0;
    if (count < NEAR_MISS_PER_GOLDEN) {
      throw new Error(
        `Golden doc ${ref} has only ${count} near-miss competitors (need ≥${NEAR_MISS_PER_GOLDEN})`,
      );
    }
  }
}

function main() {
  const check = process.argv.includes("--check");

  const seed = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8"));

  const docs = buildDocs(seed);
  assertInvariants(docs, golden);

  const out = {
    version: seed.version,
    generatedBy: "scripts/rag-eval/gen-corpus.mjs",
    comment:
      "AUTO-GENERATED — не правити руками. Джерело: scripts/rag-eval/corpus-seed.json. Перегенерувати: node scripts/rag-eval/gen-corpus.mjs. Перевірити: --check.",
    docs,
  };
  const serialized = `${JSON.stringify(out, null, 2)}\n`;

  if (check) {
    let current;
    try {
      current = readFileSync(OUT_PATH, "utf-8");
    } catch {
      console.error(`✗ ${OUT_PATH} не існує - запусти генератор без --check`);
      process.exit(1);
    }
    if (current !== serialized) {
      console.error(
        "✗ corpus.json розійшовся із seed. Запусти: node scripts/rag-eval/gen-corpus.mjs",
      );
      process.exit(1);
    }
    console.log(`✓ corpus.json відповідає seed (${docs.length} документів)`);
    return;
  }

  writeFileSync(OUT_PATH, serialized, "utf-8");
  const roles = docs.reduce((acc, d) => {
    acc[d.role] = (acc[d.role] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `✓ ${OUT_PATH}: ${docs.length} документів (${JSON.stringify(roles)})`,
  );
}

main();
