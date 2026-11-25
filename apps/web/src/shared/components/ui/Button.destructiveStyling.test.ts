import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Контракт на ЧЕРВОНУ кнопку — знахідка PR-C1 (аудит 2026-09-13).
 *
 * Аудит стверджував, що `danger` і `destructive` — «два імені однієї ролі», і
 * пропонував звести їх в одне. Замір показав протилежне:
 *   `danger`      → `bg-danger-soft text-danger-soft-fg border border-danger/30`
 *   `destructive` → `bg-danger-strong text-white shadow-sm`
 * Це різні клітинки канонічної сітки (`EMPHASIS_TONE_MAP`: `soft.danger` і
 * `solid.danger`), і різницю ВЖЕ піне `Button.test.tsx` («soft/danger renders
 * the inline danger chip (not solid)»). Злиття імен було б візуальною
 * регресією, а не прибиранням — тому цей файл нічого не зводить докупи.
 *
 * Справжня знахідка інша: частина деструктивних кнопок не користується
 * жодною з двох червоних клітинок, а домальовує червоний колір руками поверх
 * НЕчервоного варіанта. Нижче — три інваріанти, кожен з яких закриває
 * конкретний зламаний стан, поміряний, а не припущений.
 *
 * Тест сканує вихідний код, а не рендерить: усі три дефекти живуть у тому, ЩО
 * автор написав у `className`, і жоден не видно з одного відрендереного
 * компонента. Той самий підхід, що в `uk.core.eagerImports.test.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");

/** Класи Tailwind, що фарбують ТЕКСТ у червоне в базовому стані (без модифікатора). */
const BASE_DANGER_TEXT = /(?:^|\s)text-danger[\w-]*(?:\/\d+)?(?=\s|$)/;
/** Той самий колір, але під `hover:` — саме він переживає ховер варіанта. */
const HOVER_DANGER_TEXT = /(?:^|\s)hover:text-danger[\w-]*(?:\/\d+)?(?=\s|$)/;
/** `text-xs!` і родичі — розмір шрифту з important-модифікатором Tailwind 4. */
const IMPORTANT_TEXT_SIZE =
  /(?:^|\s)text-(?:xs|sm|base|lg|xl|[2-9]xl)!(?=\s|$)/;

interface ButtonUsage {
  file: string;
  line: number;
  variant: string;
  tone: string;
  className: string;
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
    out.push(full);
  }
  return out;
}

/**
 * Витягує відкривальні теги `<Button …>` разом із `variant` і `className`.
 *
 * Балансуємо фігурні дужки, бо пропси регулярно містять `>` усередині
 * виразів (`onClick={() => …}`), і наївний пошук першого `>` різав би тег
 * посередині — тобто мовчки пропускав би саме ті кнопки, де є обробник.
 */
function collectButtonUsages(): ButtonUsage[] {
  const usages: ButtonUsage[] = [];
  for (const file of collectTsxFiles(WEB_SRC)) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/<Button\b/g)) {
      const start = match.index;
      let depth = 0;
      let i = start;
      for (; i < src.length; i += 1) {
        const ch = src[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        else if (ch === ">" && depth === 0) break;
      }
      const tag = src.slice(start, i + 1);
      const className = /className="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (!className) continue;
      usages.push({
        file: relative(WEB_SRC, file),
        line: src.slice(0, start).split("\n").length,
        variant: /variant="([^"]*)"/.exec(tag)?.[1] ?? "(default:solid)",
        tone: /tone="([^"]*)"/.exec(tag)?.[1] ?? "(default:neutral)",
        className,
      });
    }
  }
  return usages;
}

const USAGES = collectButtonUsages();

describe("Button — деструктивний вигляд", () => {
  it("сканер бачить достатньо кнопок, щоб інваріанти нижче щось означали", () => {
    // Захист від тихого нуля: якщо тег `<Button` перейменують або сканер
    // зламається, решта тестів стане зеленою на порожньому списку.
    expect(USAGES.length).toBeGreaterThan(100);
  });

  // Дефект 1 (`secondary` + `text-danger-*` фарбувався брендом на ховері
  // через `hover:border-brand-200`) окремого тесту більше не має: імʼя
  // `secondary` знято з `ButtonVariant` 2026-11-22, а канонічний `outline`
  // брендового ховера не несе. Червоний текст на будь-якому варіанті
  // однаково тримає дефект 2 нижче.

  /**
   * Дефект 2. Червоний текст без червоного ховера зникає під курсором.
   *
   * `ghost` несе `hover:text-text`, `solid` — `text-bg` тощо. Базовий
   * `text-danger-strong` із className переживає merge, а ховер варіанта —
   * ні, тож:
   *
   *   cn(ghost, "text-danger-strong") →
   *     "… hover:text-text … text-danger-strong"
   *
   * Кнопка червона в спокої і звичайна під курсором. Лікування — не міняти
   * варіант (ghost для іконки в рядку списку обраний свідомо), а дописати
   * `hover:text-danger`.
   */
  it("кожен базовий text-danger має власний hover:text-danger", () => {
    const offenders = USAGES.filter(
      (u) =>
        BASE_DANGER_TEXT.test(u.className) &&
        !HOVER_DANGER_TEXT.test(u.className) &&
        u.tone !== "danger",
    );
    expect(
      offenders.map((o) => `${o.file}:${o.line} — ${o.className}`),
    ).toEqual([]);
  });

  /**
   * Дефект 3. `text-xs!` поруч із кольором тексту зникає мовчки.
   *
   * Tailwind 4 пише important як суфікс (`text-xs!`), і tailwind-merge у цій
   * формі не впізнає розмір шрифту — кладе його в ту саму групу, що й колір,
   * і лишає останній клас:
   *
   *   cn("text-xs! text-danger-strong") → "text-danger-strong"   ← розмір зник
   *   cn("text-xs  text-danger-strong") → "text-xs text-danger-strong"
   *
   * Тобто саме important-форма ламає merge. У списку звичок це давало дві
   * сусідні кнопки різного кегля («В архів» лишалась `text-xs`, «Видалити» —
   * ні), чого ніхто не писав. `cn.ts` уже несе коментар про цю саму родину
   * тихих strip-ів для `text-style-*` — тут та сама пастка з іншого боку.
   */
  it("не ставить important-розмір тексту поруч із кольором тексту", () => {
    const offenders = USAGES.filter(
      (u) =>
        IMPORTANT_TEXT_SIZE.test(u.className) &&
        BASE_DANGER_TEXT.test(u.className),
    );
    expect(
      offenders.map((o) => `${o.file}:${o.line} — ${o.className}`),
    ).toEqual([]);
  });
});
