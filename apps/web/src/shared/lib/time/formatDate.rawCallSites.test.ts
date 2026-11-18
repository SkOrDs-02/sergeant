import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Гейт на сирі формати дати поза `shared/lib/time/` — знахідка PR-C3
 * наскрізного огляду 2026-09-13, хвиля 8 «Система».
 *
 * Міграція 2026-09-15 (#38, #41) звела 45 call-site-ів на сім іменованих
 * форматів `formatDate.ts`, але гейта не поставила. За два місяці назад
 * наросло шість сирих викликів, кожен — точна копія вже іменованого формату
 * (`{day, month:short, hour, minute}` = `formatDateTimeShort`,
 * `{day, month:long, year}` = `formatDateFull`, `{day, month:short}` =
 * `formatDateShort`). Тобто механізм «новий виклик копіює найближчий
 * сусідній», описаний у шапці `formatDate.ts`, працює і після міграції.
 *
 * Що ловить: `toLocaleDateString(`, `toLocaleTimeString(`,
 * `toLocaleString("uk-UA", {` і `new Intl.DateTimeFormat(` у продуктовому
 * коді. Числа (`n.toLocaleString("uk-UA")` без опцій) не ловить.
 *
 * Новий формат дати — новий іменований хелпер у `formatDate.ts` (або
 * `uaWeekdayDate.ts` для дня тижня), а не запис у `ALLOWED`. Запис у
 * `ALLOWED` — для форми, яка свідомо не має імені (одна згадка на весь
 * застосунок не варта імені, див. шапку `formatDate.ts`), з причиною.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");

/** Каталоги, де форматери ВИЗНАЧАЮТЬСЯ, а не викликаються. */
const OWNER_DIRS = ["shared/lib/time/"];
const OWNER_FILES = ["shared/lib/format/relativeTime.uk.ts"];

const RAW_DATE_FORMAT =
  /\.toLocaleDateString\(|\.toLocaleTimeString\(|\.toLocaleString\(\s*"uk-UA"\s*,\s*\{|new Intl\.DateTimeFormat\(/g;

/** Файл → причина. Без номерів рядків, щоб не протухав від правок. */
const ALLOWED: Record<string, string> = {
  "modules/routine/components/HabitHeatmap.tsx":
    "підпис осі: лише короткий місяць без дня",
  "modules/finyk/components/analytics/MonthlyTrendBars.tsx":
    "підписи стовпців: місяць без дня (короткий, повний, родовий)",
  "modules/finyk/pages/budgets/BudgetsLimitsSection.tsx":
    "заголовок періоду: повний місяць без дня й року",
  "modules/finyk/components/SilpoReceiptPickerSheet.tsx":
    "дворозрядний рік у щільному списку чеків",
  "modules/finyk/pages/AssetsTxPickerView.tsx":
    "en-CA = день-ключ YYYY-MM-DD як ДАНІ (ADR-0078), не підпис",
  "modules/fizruk/components/dashboard/HeroRecoveryBars.tsx":
    "лише короткий день тижня під стовпцем",
  "modules/routine/components/RoutineCalendarPanel.tsx":
    "короткий день тижня з датою («пн, 13 вер.»): скорочення дня не відмінюється",
  "modules/fizruk/pages/Body/JournalEntryCard.tsx":
    "короткий день тижня з датою і роком у картці журналу тіла",
  "shared/lib/ui/export.ts": "час генерації PDF із секундами у футері звіту",
};

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      collectFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.(test|stories)\.tsx?$/.test(entry) || entry.endsWith(".d.ts")) {
      continue;
    }
    out.push(full);
  }
  return out;
}

/** Рядок без коментарів: `//` до кінця рядка і рядки докстрінгів `*`. */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function collectRawSites(): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const file of collectFiles(WEB_SRC)) {
    const rel = relative(WEB_SRC, file).replace(/\\/g, "/");
    if (OWNER_DIRS.some((d) => rel.startsWith(d))) continue;
    if (OWNER_FILES.includes(rel)) continue;
    if (rel.includes("DesignShowcase")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (isCommentLine(line)) return;
      if (!line.match(RAW_DATE_FORMAT)) return;
      const sites = byFile.get(rel) ?? [];
      sites.push(`${rel}:${idx + 1}`);
      byFile.set(rel, sites);
    });
  }
  return byFile;
}

const RAW = collectRawSites();

describe("formatDate — сирі формати дати не наростають", () => {
  it("сирий формат дати живе лише у файлах із записаною причиною", () => {
    const offenders = [...RAW.entries()]
      .filter(([file]) => !ALLOWED[file])
      .flatMap(([, sites]) => sites);
    expect(offenders).toEqual([]);
  });

  it("кожен виняток ще живий (список не протухає мовчки)", () => {
    const stale = Object.keys(ALLOWED).filter((file) => !RAW.has(file));
    expect(stale).toEqual([]);
  });
});
