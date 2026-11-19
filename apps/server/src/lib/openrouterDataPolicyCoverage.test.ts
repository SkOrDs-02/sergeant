/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Гейт повноти заборони збереження даних у OpenRouter.
 *
 * AI-CONTEXT: рішення власника 2026-11-19 — кожен запит до шлюзу вимагає
 * провайдерів, які не зберігають дані користувача
 * (`provider.data_collection=deny`). Поле додає один хелпер,
 * `lib/llm/openrouterDataPolicy.ts`. Цей тест не перевіряє, що поле справді
 * доходить у мережу (це роблять `openrouterDataPolicy.paths.test.ts` і
 * юніт хелпера). Він перевіряє рівно одне: що новий файл із виходом в
 * OpenRouter не може зʼявитись в обхід хелпера непоміченим.
 *
 * Чому файлів так мало. Майже всі шляхи (чат, зір, чеки, імпорт, коуч,
 * дайджест, Mono, категоризація, нутриція) ходять у шлюз через ДВА
 * транспорти: `lib/anthropic.ts` (`/api/v1/messages`, коли caller передав
 * `allowOpenRouter`) і `lib/llm/provider.ts` (`/api/v1/chat/completions`).
 * Хелпер стоїть у самих транспортах, тож call-site його не бачить і обійти не
 * може. Гейт ловить третій шлях — файл, що сам будує тіло й сам кличе
 * `openrouter.ai`.
 *
 * Друга перевірка: літерал `data_collection:` поза хелпером заборонений, щоб
 * значення не розʼїхалось по файлах і відкат `OPENROUTER_DATA_COLLECTION=allow`
 * діяв усюди однаково.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_ROOT = join(import.meta.dirname, "..", "..");
const ROOTS = ["src", "scripts"];

/** Вихід в OpenRouter: URL шлюзу або константи URL Jev, що на нього вказують. */
const EXIT_MARKERS = ["openrouter.ai", "JEV_URL", "JEV_ENDPOINTS"];

const HELPER_TOKENS = [
  "withOpenRouterProviderPrefs",
  "openRouterProviderPrefs",
  "openRouterZdrProviderPrefs",
];

const HELPER_FILE = "src/lib/llm/openrouterDataPolicy.ts";

/**
 * Файли з маркером, які тіла запиту не будують. Ключ — шлях від
 * `apps/server`, значення — чому хелпера тут немає. Порожнє пояснення
 * заборонене.
 */
const NO_REQUEST_BODY: Record<string, string> = {
  "scripts/eval/cost.ts":
    "лише GET /api/v1/models (каталог цін), тіла запиту немає",
  "src/modules/chat/toolEval/jev.ts":
    "лише константи URL Jev; тіло будує src/scripts/toolEvalJev.ts",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "test" ||
        entry === "__fixtures__" ||
        entry === "__tests__"
      )
        continue;
      walk(full, out);
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    if (entry.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

function sources(): Array<{ path: string; src: string }> {
  return ROOTS.flatMap((root) => walk(join(SERVER_ROOT, root))).map((file) => ({
    path: file.slice(SERVER_ROOT.length + 1).replaceAll("\\", "/"),
    src: readFileSync(file, "utf8"),
  }));
}

describe("заборона збереження даних у OpenRouter: покриття", () => {
  it("кожен файл із виходом в OpenRouter бере provider із хелпера", () => {
    const missing = sources()
      .filter(({ path }) => path !== HELPER_FILE)
      .filter(({ src }) => EXIT_MARKERS.some((m) => src.includes(m)))
      .filter(({ path }) => !(path in NO_REQUEST_BODY))
      .filter(({ src }) => !HELPER_TOKENS.some((t) => src.includes(t)))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it("винятки реєстру існують і досі мають маркер (реєстр не стає архівом)", () => {
    const byPath = new Map(sources().map((s) => [s.path, s.src]));
    for (const [path, why] of Object.entries(NO_REQUEST_BODY)) {
      expect(
        why.trim().length,
        `порожнє пояснення для ${path}`,
      ).toBeGreaterThan(0);
      const src = byPath.get(path);
      expect(src, `${path} не існує`).toBeDefined();
      expect(
        EXIT_MARKERS.some((m) => src?.includes(m)),
        `${path} більше не має маркера — прибери з реєстру`,
      ).toBe(true);
    }
  });

  it("літерал data_collection: живе лише в хелпері", () => {
    const offenders = sources()
      .filter(({ path }) => path !== HELPER_FILE)
      .filter(({ src }) => /\bdata_collection\s*:/.test(src))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("літерал quantizations: живе лише в хелпері", () => {
    // Список рівнів від 8 біт (рішення власника 2026-11-19) — одне джерело,
    // щоб відкат `OPENROUTER_QUANTIZATION_FLOOR=off` діяв усюди однаково.
    const offenders = sources()
      .filter(({ path }) => path !== HELPER_FILE)
      .filter(({ src }) => /\bquantizations\s*:/.test(src))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("обидва транспорти шлюзу підключені до хелпера", () => {
    const byPath = new Map(sources().map((s) => [s.path, s.src]));
    for (const transport of [
      "src/lib/anthropic.ts",
      "src/lib/llm/provider.ts",
    ]) {
      expect(byPath.get(transport)).toContain("withOpenRouterProviderPrefs");
    }
  });
});
