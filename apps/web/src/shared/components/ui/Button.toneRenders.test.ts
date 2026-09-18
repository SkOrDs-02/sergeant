/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Гейт на одне: щоб `tone`, написаний у виклику, справді щось означав.
 *
 * Знайдено при роботі над залишком аудиту PR-C1. Сам аудит рахував лише
 * розбіжність «однаковий підпис — різні варіанти», і повз нього пройшло
 * гірше: **API приймає комбінації, яких не вміє, і мовчить про це**.
 *
 * Два різні механізми мовчання, обидва в `resolveStyleKey`:
 *
 * 1. **Legacy-гілка відкидає `tone` не читаючи.** `ghost` стоїть ОДНОЧАСНО
 *    в канонічних emphasis-словах і в `LEGACY_VARIANTS`, а legacy-перевірка
 *    йде першою. Тому `variant="ghost" tone="finyk"` — рівно та форма, яку
 *    документує канонічна вісь — давала звичайний нейтральний ghost. Шість
 *    викликів у Фініку просили акцент і тихо його не отримували.
 *
 * 2. **Канонічна гілка падає в `?? "primary"`.** У `outline` і `ghost` є
 *    лише клітинка `neutral`, тож `variant="outline" tone="fizruk"` не
 *    знаходив нічого й ставав СУЦІЛЬНОЮ брендовою кнопкою — тобто
 *    найгучнішою на екрані там, де автор написав «стримана обведена».
 *    Три виклики (Фізрук, Їжа ×2) виглядали саме так.
 *
 * Друге гірше за перше: перше нічого не робить, друге робить протилежне
 * написаному. Обидва однаково невидимі в рев'ю — пропси виглядають
 * правильними, бо API їх приймає.
 *
 * Тест НЕ про смак: він не каже, який варіант мусить мати «Зберегти» (це
 * відкрита половина PR-C1 і рішення власника). Він каже лише, що написане
 * і намальоване не мають розходитись мовчки.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../../..", import.meta.url).pathname;

/**
 * Дзеркало `EMPHASIS_TONE_MAP` і `LEGACY_VARIANTS` із `Button.tsx`.
 *
 * Свідома копія, а не імпорт: обидві структури там не експортуються, і
 * експортувати їх заради тесту означало б розширити публічний API
 * компонента. Розходження ловить третій тест нижче.
 */
const EMPHASIS_TONES: Record<string, ReadonlySet<string>> = {
  solid: new Set([
    "neutral",
    "ink",
    "danger",
    "finyk",
    "fizruk",
    "routine",
    "nutrition",
  ]),
  soft: new Set([
    "danger",
    "success",
    "finyk",
    "fizruk",
    "routine",
    "nutrition",
  ]),
  outline: new Set(["neutral"]),
  ghost: new Set(["neutral"]),
};

const LEGACY_VARIANTS = new Set([
  "primary",
  "secondary",
  "ghost",
  "danger",
  "destructive",
  "success",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "finyk-soft",
  "fizruk-soft",
  "routine-soft",
  "nutrition-soft",
  "primary-ink",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (
      (full.endsWith(".tsx") || full.endsWith(".ts")) &&
      !full.includes(".test.") &&
      !full.includes(".stories.") &&
      !full.includes("/DesignShowcase/")
    ) {
      out.push(full);
    }
  }
  return out;
}

interface Offender {
  where: string;
  variant: string;
  tone: string;
  why: string;
}

/**
 * Читає відкривні теги `<Button …>` з урахуванням вкладених `{}`.
 *
 * Наївний `/<Button.*?>/` ламається на будь-якому `onClick={() => …}` —
 * той самий трюк уже стоїть у `Button.destructiveStyling.test.ts`.
 */
function buttonTags(src: string): Array<{ tag: string; line: number }> {
  const out: Array<{ tag: string; line: number }> = [];
  const re = /<Button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = re.lastIndex;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
      i += 1;
    }
    out.push({
      tag: src.slice(m.index, i),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

/**
 * Можливі значення `variant` у тезі.
 *
 *  - `variant="solid"`            → `["solid"]`
 *  - `variant={c ? "a" : "b"}`    → `["a", "b"]` (перевіряємо обидві гілки)
 *  - `variant={someVar}`          → `null` (не читається — не вгадуємо)
 *  - пропа немає                  → `["primary"]` (справжній дефолт компонента)
 */
function variantCandidates(tag: string): string[] | null {
  const literal = /\bvariant="([^"]+)"/.exec(tag);
  if (literal) return [literal[1] as string];

  const expr = /\bvariant=\{/.exec(tag);
  if (!expr) return ["primary"]; // пропа немає — діє дефолт `variant = "primary"`

  // Вміст `{...}` з урахуванням вкладених дужок.
  let i = expr.index + expr[0].length;
  let depth = 1;
  const start = i;
  while (i < tag.length && depth > 0) {
    if (tag[i] === "{") depth += 1;
    else if (tag[i] === "}") depth -= 1;
    i += 1;
  }
  const body = tag.slice(start, i - 1);
  const strings = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
  return strings.length > 0 ? strings : null;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<Button")) continue;
    for (const { tag, line } of buttonTags(src)) {
      // Лише літеральні пропси: `tone={expr}` тест не розбирає й не
      // вгадує — інакше він рапортував би хибні спрацьовки на цілком
      // справних кнопках (на цьому я вже спіймався вручну з `AssetsBars`).
      const tone = /\btone="([^"]+)"/.exec(tag)?.[1];
      if (!tone) continue;
      const where = `${file.replace(SRC, "")}:${line}`;

      // Той самий принцип «не вгадуй», що й для `tone` вище, але для
      // `variant` він доти НЕ діяв: відсутність літерала трактувалась як
      // дефолт `primary`, тобто НЕВІДОМЕ рахувалось за легасі. На кнопці
      // `variant={cond ? "solid" : "soft"} tone="finyk"` — цілком справній,
      // де обидві гілки канонічні — це давало хибне спрацювання
      // (`FinykSection.tsx:99`, міграція C-секції 2026-09-16).
      //
      // Тому замість «літерал або дефолт» тут ПЕРЕЛІК можливих значень:
      // з `variant={a ? "x" : "y"}` дістаємо обидві гілки й перевіряємо
      // кожну. Це сильніше за пропуск динамічних тегів — реальний
      // порушник `variant={c ? "primary" : "secondary"} tone="finyk"`
      // лишається спійманим по обох гілках.
      const variants = variantCandidates(tag);
      if (variants === null) continue; // справді не читається — не вгадуємо

      for (const variant of variants) {
        if (LEGACY_VARIANTS.has(variant)) {
          offenders.push({
            where,
            variant,
            tone,
            why: "legacy-варіант: `tone` відкидається не читаючи",
          });
          continue;
        }
        const allowed = EMPHASIS_TONES[variant];
        if (allowed && !allowed.has(tone)) {
          offenders.push({
            where,
            variant,
            tone,
            why: "немає такої клітинки: мовчки стане суцільною primary",
          });
        }
      }
    }
  }
  return offenders;
}

describe("Button: `tone` мусить щось означати (PR-C1, побічна знахідка)", () => {
  it("жоден виклик не передає `tone`, який не буде застосовано", () => {
    const offenders = findOffenders();
    expect(
      offenders.map(
        (o) => `${o.where}  variant=${o.variant} tone=${o.tone} — ${o.why}`,
      ),
    ).toEqual([]);
  });

  it("сканер справді бачить кнопки — інакше зелений нічого не вартий", () => {
    // Без цієї перевірки зламаний walk/парсер дав би порожній список
    // порушників і вічне зелене — рівно та хвороба, яку тест і лікує.
    const seen = walk(SRC)
      .map((f) => readFileSync(f, "utf8"))
      .filter((s) => s.includes("<Button"))
      .reduce((n, s) => n + buttonTags(s).length, 0);
    expect(seen).toBeGreaterThan(100);
  });

  it("дзеркальні таблиці не розійшлися з Button.tsx", () => {
    const btn = readFileSync(
      join(SRC, "shared/components/ui/Button.tsx"),
      "utf8",
    );
    // `outline` і `ghost` навмисно бідні — саме на цьому і горіли виклики.
    // Якщо в них зʼявиться модульна клітинка, копію треба оновити.
    const map = /const EMPHASIS_TONE_MAP[\s\S]*?\n};/.exec(btn)?.[0] ?? "";
    expect(map).toContain("outline: {");
    expect(map).toContain("ghost: {");
    for (const [emphasis, tones] of Object.entries(EMPHASIS_TONES)) {
      const block =
        new RegExp(`${emphasis}: \\{([\\s\\S]*?)\\}`).exec(map)?.[1] ?? "";
      const actual = new Set(
        [...block.matchAll(/^\s*"?([a-z]+)"?:/gm)].map((m) => m[1]!),
      );
      expect([...tones].sort()).toEqual([...actual].sort());
    }
  });
});
