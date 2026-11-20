/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Сторож: публічний перелік обробників ШІ ↔ внутрішній реєстр ↔ дефолти
 * моделей сервера.
 *
 * Клас поломки, заради якого тест існує (2026-11-19): чеки й виписки
 * переїхали на модель OpenAI (`OPENROUTER_RECEIPT_MODEL`), реєстр
 * `docs/governance/security/llm-subprocessors.md` це записав, а політика
 * приватності й блок у Налаштуваннях далі називали інших. Тепер:
 *
 * 1. Блок `public-ai-processors` реєстру і `legalShared.ts` мусять називати
 *    тих самих прямих обробників, тих самих постачальників моделей за
 *    шлюзом і тих самих постачальників для чеків (з чинним за
 *    замовчуванням).
 * 2. Кожна дефолтна модель OpenRouter у сервері (`vendor/model`) мусить мати
 *    постачальника з реєстру, а дефолт чеків — збігатися з позначеним
 *    «за замовчуванням».
 *
 * Чому vitest поруч із текстами, а не `node`-гейт у `scripts/`: тест імпортує
 * `legalShared.ts` як є (TS, без окремого парсера), біжить у `pnpm check`
 * через тести вебу і не потребує правки ланцюжка `pnpm lint`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AI_GATEWAY_VENDORS,
  AI_PROCESSORS,
  RECEIPT_VISION_VENDORS,
} from "./legalShared";

const REPO_ROOT = new URL("../../../../../", import.meta.url);
const REGISTRY_PATH = "docs/governance/security/llm-subprocessors.md";
const BLOCK_START = "<!-- public-ai-processors-start -->";
const BLOCK_END = "<!-- public-ai-processors-end -->";

const KIND_PROCESSOR = "обробник";
const KIND_GATEWAY = "модель за шлюзом";
const RECEIPT_DEFAULT = "за замовчуванням";
const RECEIPT_ROLLBACK = "відкат";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, REPO_ROOT)), "utf8");
}

interface RegistryRow {
  kind: string;
  name: string;
  slug: string | null;
  receipts: string | null;
}

/** Рядки таблиці між маркерами; заголовок і роздільник пропускаються. */
function parseRegistryBlock(markdown: string): RegistryRow[] {
  const start = markdown.indexOf(BLOCK_START);
  const end = markdown.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${BLOCK_START} … ${BLOCK_END} not found`);
  }
  const rows = markdown
    .slice(start + BLOCK_START.length, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((cell) => cell.trim().replace(/^`|`$/g, "")),
    )
    // Заголовок і рядок `| --- |`.
    .slice(2);
  return rows.map((cells) => {
    if (cells.length !== 4) {
      throw new Error(`Registry row must have 4 cells: ${cells.join(" | ")}`);
    }
    const [kind, name, slug, receipts] = cells as [
      string,
      string,
      string,
      string,
    ];
    return {
      kind,
      name,
      slug: slug === "-" ? null : slug,
      receipts: receipts === "-" ? null : receipts,
    };
  });
}

/**
 * Префікси постачальників дефолтних моделей OpenRouter у сервері. Беремо
 * лише форми, якими дефолт задається в коді (не коментарі):
 * `stringWithDefault("v/m")`, `envStr("NAME", "v/m")`, `openrouter: "v/m"`,
 * `const …_MODEL = "v/m"`.
 */
const SERVER_MODEL_SOURCES = [
  "apps/server/src/env/aiRoutingEnv.ts",
  "apps/server/src/env/chatModels.ts",
  "apps/server/src/env/env.ts",
  "apps/server/src/modules/chat/aiQuotaTierModels.ts",
] as const;

const DEFAULT_SLUG_PATTERNS = [
  /stringWithDefault\(\s*"([a-z0-9-]+)\/[^"]+"/g,
  /envStr\(\s*"[A-Z_]+",\s*"([a-z0-9-]+)\/[^"]+"/g,
  /openrouter:\s*"([a-z0-9-]+)\/[^"]+"/g,
  /const [A-Z_]+_MODEL\s*=\s*"([a-z0-9-]+)\/[^"]+"/g,
];

function defaultModelVendorSlugs(source: string): string[] {
  return DEFAULT_SLUG_PATTERNS.flatMap((re) =>
    [...source.matchAll(re)].map((m) => m[1] as string),
  );
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

const registry = parseRegistryBlock(read(REGISTRY_PATH));

describe("публічний перелік обробників ШІ ↔ реєстр субпроцесорів", () => {
  it("реєстр має блок для звірки з обома видами рядків", () => {
    expect(registry.some((r) => r.kind === KIND_PROCESSOR)).toBe(true);
    expect(registry.some((r) => r.kind === KIND_GATEWAY)).toBe(true);
    for (const row of registry) {
      expect([KIND_PROCESSOR, KIND_GATEWAY]).toContain(row.kind);
    }
  });

  it("прямі обробники збігаються", () => {
    expect(sorted(AI_PROCESSORS.map((p) => p.registryName))).toEqual(
      sorted(
        registry.filter((r) => r.kind === KIND_PROCESSOR).map((r) => r.name),
      ),
    );
  });

  it("постачальники моделей за шлюзом збігаються (назва і слаг)", () => {
    expect(
      sorted(AI_GATEWAY_VENDORS.map((v) => `${v.name} ${v.slug}`)),
    ).toEqual(
      sorted(
        registry
          .filter((r) => r.kind === KIND_GATEWAY)
          .map((r) => `${r.name} ${r.slug ?? ""}`),
      ),
    );
  });

  it("постачальники для чеків і виписок збігаються, чинний позначено", () => {
    const gateway = registry.filter((r) => r.kind === KIND_GATEWAY);
    const defaults = gateway.filter((r) => r.receipts === RECEIPT_DEFAULT);
    expect(defaults.map((r) => r.slug)).toEqual([
      RECEIPT_VISION_VENDORS.defaultSlug,
    ]);
    expect(
      sorted(
        gateway
          .filter((r) => r.receipts === RECEIPT_ROLLBACK)
          .map((r) => r.slug ?? ""),
      ),
    ).toEqual(sorted(RECEIPT_VISION_VENDORS.rollbackSlugs));
  });
});

describe("дефолтні моделі сервера ↔ реєстр субпроцесорів", () => {
  const registrySlugs = new Set(
    registry.filter((r) => r.kind === KIND_GATEWAY).map((r) => r.slug),
  );

  it.each(SERVER_MODEL_SOURCES)(
    "%s: кожна дефолтна модель OpenRouter має постачальника з реєстру",
    (path) => {
      const slugs = defaultModelVendorSlugs(read(path));
      const unknown = slugs.filter((slug) => !registrySlugs.has(slug));
      expect(unknown).toEqual([]);
    },
  );

  it("дефолт OPENROUTER_RECEIPT_MODEL — постачальник, позначений «за замовчуванням»", () => {
    const source = read("apps/server/src/env/aiRoutingEnv.ts");
    const match = source.match(
      /OPENROUTER_RECEIPT_MODEL:\s*stringWithDefault\(\s*"([a-z0-9-]+)\//,
    );
    expect(match?.[1]).toBe(RECEIPT_VISION_VENDORS.defaultSlug);
  });

  it("розбір дефолтів бачить усі пʼять наявних постачальників", () => {
    // Захист від тихого «зеленого»: якщо форма дефолтів у сервері зміниться
    // і регекси перестануть ловити, перевірка вище пройде на порожньому
    // списку. Тут вимагаємо, щоб розбір знайшов реальні дефолти.
    const found = sorted(
      SERVER_MODEL_SOURCES.flatMap((path) =>
        defaultModelVendorSlugs(read(path)),
      ),
    );
    expect(found).toEqual(sorted(AI_GATEWAY_VENDORS.map((v) => v.slug)));
  });
});

describe("parseRegistryBlock", () => {
  it("кидає, коли маркерів немає", () => {
    expect(() => parseRegistryBlock("# nothing")).toThrow(/not found/);
  });

  it("читає комірки з бектиками і дефісом як порожні", () => {
    const md = [
      BLOCK_START,
      "| Вид | Назва | Слаг шлюзу | Чеки й виписки |",
      "| --- | --- | --- | --- |",
      "| модель за шлюзом | OpenAI | `openai` | за замовчуванням |",
      "| обробник | Groq | - | - |",
      BLOCK_END,
    ].join("\n");
    expect(parseRegistryBlock(md)).toEqual([
      {
        kind: KIND_GATEWAY,
        name: "OpenAI",
        slug: "openai",
        receipts: RECEIPT_DEFAULT,
      },
      { kind: KIND_PROCESSOR, name: "Groq", slug: null, receipts: null },
    ]);
  });
});
