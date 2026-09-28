/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Гейт на одне: **дія-блок у Налаштуваннях не має лежати голою на фоні.**
 *
 * Знахідка власника 2026-09-15: «в налаштуваннях модулів є кнопки як то
 * оновити чеки, які голі лежать на фоні». Замір підтвердив клас із десяти
 * викликів — `variant="ghost"` на кнопці, яка займає весь рядок блока
 * (`w-full`) або половину пари (`flex-1`).
 *
 * Чому саме ghost тут неправильний. `ghost` — це
 * `bg-transparent text-muted` без бордера: фон секції видно наскрізь, і
 * єдине, що відрізняє кнопку від абзаца поруч, — це підпис у `text-muted`,
 * тобто ТИХІШИЙ за звичайний текст. Доки ghost стоїть усередині вже
 * обмеженої коробки (рядок «лейбл — Скопіювати» в рамці), це працює: межу
 * дає контейнер. Дія-блок, яка займає весь рядок, такої рамки не має.
 *
 * Сусідство з гучною кнопкою межі НЕ замінює — рішення власника
 * 2026-09-15; перша редакція цього докстрінга стверджувала протилежне, і
 * розійшлася з кодом: із 11 кнопок «Скасувати» десять уже були
 * `secondary`.
 *
 * Найгірше це читалось у парах: «Оновити чеки» (`ghost`) поруч із
 * «Відключити» (`danger`, з фоном і бордером) — рядок виглядав як ОДНА
 * кнопка і підпис біля неї. Рівно та сама пара стояла у Monobank-вебхуці
 * («Синхронізувати історію») і в PWA («Технічна діагностика»).
 *
 * Канонічна відповідь — `secondary`, і вона вже описана в самому
 * `Button.tsx`: його `bg-panel` навмисно той самий токен, що й поверхня
 * під ним, бо відділяє не заливка, а `border-border-strong` + `shadow-e1`.
 * Саме тому два виклики в репо (`NutritionSection`, `FizrukDayPlanSheet`)
 * домальовували `border border-line` руками поверх `ghost` — люди хотіли
 * `secondary` і збирали його вручну, гіршою копією.
 *
 * Скоуп навмисно вузький — секції Налаштувань. Там немає футера аркуша,
 * тож немає й легітимного «full-width ghost = Закрити/Скасувати», який
 * робить таку перевірку шумною в модулях (`FizrukDayPlanSheet` footer,
 * `InputDialog`, `PantryVariantChoiceSheet` — усі коректні ghost-и).
 * Через це гейт не потребує жодного allowlist-у: у скоупі має бути НУЛЬ
 * збігів. Тест не каже, який саме варіант обрати — лише що межа має бути.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// `URL.pathname` на Windows дає `/D:/…`, і `join` склеював `D:\D:\…`.
const SRC = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Поверхні, де кнопка стоїть у секції Налаштувань — тека або окремий файл.
 *
 * `core/feedback` узято ФАЙЛОМ, не текою: секція Налаштувань там лише
 * `FeedbackSection`, а сусідній `FeedbackDialog` — діалог, і його
 * «Скопіювати» всередині червоної рамки помилки — рівно той коректний
 * ghost, що описаний у шапці. Тека цілком дала б хибний збіг.
 */
const SCOPE = ["core/settings", "core/feedback/FeedbackSection.tsx"];

/** `w-full` / `flex-1` у className = кнопка тримає весь рядок блока. */
const BLOCK_WIDTH = /\b(w-full|flex-1)\b/;

function tsxFiles(target: string): string[] {
  if (!statSync(target).isDirectory()) return [target];
  const dir = target;
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Знаходить `<Button …>` відкривні теги і повертає ті, що несуть
 * одночасно `variant="ghost"` і блокову ширину.
 *
 * Розбір навмисно примітивний (від `<Button` до першого `>` поза рядком):
 * повний парсер JSX тут був би більшим за саму перевірку, а форма виклику
 * в цих файлах однорідна — пропси в стовпчик, без вкладених дженериків.
 */
function bareBlockGhosts(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  const re = /<Button\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const tag = match[0];
    if (!/variant="ghost"/.test(tag)) continue;
    const className = /className="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (!BLOCK_WIDTH.test(className)) continue;
    hits.push({
      line: source.slice(0, match.index).split("\n").length,
      text: tag.replace(/\s+/g, " ").slice(0, 120),
    });
  }
  return hits;
}

describe("дія-блок у Налаштуваннях несе межу", () => {
  it("жодна повноширинна кнопка секції не лишається ghost", () => {
    const offenders: string[] = [];
    for (const scope of SCOPE) {
      for (const file of tsxFiles(join(SRC, scope))) {
        for (const hit of bareBlockGhosts(readFileSync(file, "utf8"))) {
          offenders.push(
            `${relative(SRC, file)}:${hit.line} — ${hit.text}\n` +
              `      → візьми "secondary" (нейтральна дія), "danger" ` +
              `(деструктивна) або "primary" (головна дія блока). ` +
              `"ghost" лишається для дії ВСЕРЕДИНІ вже обмеженої коробки ` +
              `або для тихої половини пари.`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
