import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Контракт «текст-роль ↔ variant» для «Зберегти» — заголовок знахідки PR-C1
 * наскрізного огляду 2026-09-13 («Зберегти має сім різних візуальних форм»),
 * хвиля 8 «Система».
 *
 * Правило вже записане, бракувало гейта:
 *  - рішення власника 2026-09-15 (`04-components.md § Button`, «Який варіант
 *    брати»): «Зберегти» / «Скасувати» у формах нейтральні і в Хабі, і в
 *    модулях; головна дія блока = `solid`, пара скасування = `outline`;
 *  - redesign v3.1/v3.2: головна дія = `solid` чорнилом, hue модуля на
 *    кнопці заборонено (`hueOnButton = 0` у `check-ui-canon-ratchet.mjs`).
 *
 * Тобто «Зберегти» = `solid` (тон `neutral`, `ink` або без тону; без `variant`
 * кнопка теж `solid` + `neutral` через дефолт `primary`). У світлій і темній
 * темі `neutral` і `ink` дають ту саму заливку чорнилом (`--c-text` =
 * `--c-ink-strong`), тож для людини це одна форма.
 *
 * Винятки — лише з причиною в `ALLOWED` нижче: «Зберегти» тут не головна
 * дія екрана, а одна з рівних дій рядка або дія вкладеної підформи.
 *
 * Скан, а не рендер: дрейф живе в тому, що автор написав у тегу, і з одного
 * відрендереного компонента його не видно (той самий підхід, що
 * `Button.destructiveStyling.test.ts`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");

/**
 * Підпис «Зберегти…» літералом або ключем каталогу з `save` у назві
 * (`copy.save`, `t.saveCta`, `t.newActivitySave`, `COPY.save`).
 */
const SAVE_LABEL = /Зберегти|\.save(?:Cta)?\b|\.\w*Save\b/;

/** Дозволені клітинки: головна дія чорнилом. */
const SOLID_TONES = new Set(["neutral", "ink", "(none)"]);

/** `file:variant` → причина. Ключ без номера рядка, щоб не протухав від правок. */
const ALLOWED: Record<string, string> = {
  "modules/nutrition/components/RecipesCard.Generator.tsx:outline":
    "рядок згенерованого рецепта: «Зберегти» і «У журнал» — дві рівні дії рядка",
  "modules/fizruk/components/workouts/LogPastWorkoutSheet.tsx:outline":
    "вкладена підформа «Нове заняття»; головна дія аркуша — його власний solid-сабміт",
};

interface SaveButton {
  site: string;
  file: string;
  variant: string;
  tone: string;
}

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      collectTsxFiles(full, out);
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    if (full.includes("DesignShowcase")) continue;
    out.push(full);
  }
  return out;
}

/** Кінець відкривального тега з балансом фігурних дужок. */
function openTagEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return i;
  }
  return src.length;
}

function collectSaveButtons(): SaveButton[] {
  const out: SaveButton[] = [];
  for (const file of collectTsxFiles(WEB_SRC)) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/<Button\b/g)) {
      const start = match.index;
      const end = openTagEnd(src, start);
      const tag = src.slice(start, end + 1);
      if (tag.endsWith("/>")) continue;
      const close = src.indexOf("</Button>", end);
      if (close === -1) continue;
      // Вміст без JSX-коментарів: у них «Зберегти» трапляється як пояснення.
      const children = src
        .slice(end + 1, close)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      if (!SAVE_LABEL.test(children)) continue;
      const rel = relative(WEB_SRC, file);
      out.push({
        site: `${rel}:${src.slice(0, start).split("\n").length}`,
        file: rel,
        variant: /\bvariant="([^"]*)"/.exec(tag)?.[1] ?? "(default:solid)",
        tone: /\btone="([^"]*)"/.exec(tag)?.[1] ?? "(none)",
      });
    }
  }
  return out;
}

const SAVES = collectSaveButtons();

describe("Button — «Зберегти» має одну форму", () => {
  it("сканер бачить достатньо кнопок «Зберегти», щоб контракт щось означав", () => {
    expect(SAVES.length).toBeGreaterThan(30);
  });

  it("«Зберегти» — solid чорнилом, поза записаними винятками", () => {
    const offenders = SAVES.filter((b) => {
      const isSolid = b.variant === "solid" || b.variant === "(default:solid)";
      if (isSolid && SOLID_TONES.has(b.tone)) return false;
      return !ALLOWED[`${b.file}:${b.variant}`];
    }).map((b) => `${b.site} — variant=${b.variant} tone=${b.tone}`);
    expect(offenders).toEqual([]);
  });

  it("кожен виняток ще живий (список не протухає мовчки)", () => {
    const live = new Set(SAVES.map((b) => `${b.file}:${b.variant}`));
    const stale = Object.keys(ALLOWED).filter((key) => !live.has(key));
    expect(stale).toEqual([]);
  });
});
