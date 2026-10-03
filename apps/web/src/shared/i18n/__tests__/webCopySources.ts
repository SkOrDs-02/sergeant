import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Спільний обхід джерел для тестів копії (`standaloneErrorWord`,
 * `referencedButtonLabel`). Дерево те саме, по якому ходить
 * `sergeant-design/ukrainian-copy`, і винятки ті самі, що в
 * `eslint.web.js`: `core/DesignShowcase` (демо дизайн-системи, не продукт)
 * і `core/legal` (юридичний регістр). Тести, stories і `__tests__` поза
 * обходом, бо копія там запінена навмисно.
 */
export const WEB_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
/**
 * `@sergeant/shared`: частина спільних рядків інтерфейсу живе там, а не у
 * вебі (наприклад, підпис кнопки undo-тосту `UNDO_TOAST_DEFAULT_LABEL`).
 * Для перевірок, яким потрібні ПІДПИСИ, це друге джерело; для перевірок
 * тону копії вебу воно зайве.
 */
export const SHARED_PKG_SRC = resolve(WEB_SRC, "../../../packages/shared/src");

const EXCLUDED_DIRS = new Set(["node_modules", "__tests__"]);
const EXCLUDED_PREFIXES = ["core/DesignShowcase/", "core/legal/"];

export function collectSourceFiles(
  root: string = WEB_SRC,
  out: string[] = [],
  dir: string = root,
): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      collectSourceFiles(root, out, full);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (entry.includes(".test.") || entry.includes(".stories.")) continue;
    const rel = toPosix(relative(root, full));
    if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
    out.push(full);
  }
  return out;
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/**
 * Прибирає коментарі перед пошуком. Без цього гейти ловили б власні
 * пояснення: тести й сусідні коментарі цитують заборонені форми, щоб їх
 * пояснити, і це не порушення. Переноси рядків у блочних коментарях
 * лишаються, щоб номер рядка у знахідці збігався з файлом.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export interface CopySource {
  /** Шлях відносно `apps/web/src`, завжди з прямими слешами. */
  rel: string;
  /** Джерело без коментарів. */
  clean: string;
}

export function* copySources(root: string): Generator<CopySource> {
  for (const file of collectSourceFiles(root)) {
    yield {
      rel: toPosix(relative(root, file)),
      clean: stripComments(readFileSync(file, "utf8")),
    };
  }
}

export const webCopySources = (): Generator<CopySource> => copySources(WEB_SRC);

/** Номер рядка (від 1) для зсуву в тексті. */
export function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Рядкові літерали джерела: подвійні й одинарні лапки, template-літерали
 * (з `${…}` як є). Екрановані символи входять у літерал, інакше `\n` чи
 * `\"` усередині одного рядка зсувають розбір і наступний літерал
 * склеюється з кодом між ними: саме так «Помилка серверу при recall» у
 * `serverActions.ts` проходила повз перший варіант перевірки.
 */
const QUOTED_LITERAL =
  /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

export interface SourceLiteral {
  value: string;
  index: number;
}

export function* literalsIn(clean: string): Generator<SourceLiteral> {
  for (const m of clean.matchAll(QUOTED_LITERAL)) {
    const value = m[1] ?? m[2] ?? m[3];
    if (value == null) continue;
    yield { value, index: m.index ?? 0 };
  }
}
