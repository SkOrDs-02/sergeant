/**
 * Гейт на КАНОНІЧНУ НАЗВУ ТАРИФУ в копії для людини.
 *
 * Рішення D3: людина бачить «Premium», серверний id лишається `pro`. Воно
 * вже було ухвалене й уже було порушене: `TrialBanner.tsx` містить коментар
 * «Тут стояло "Pro", через що один тариф звався по-різному» — тобто це фікс
 * того самого дефекту. А 2026-09-11 його внесли вдруге, у
 * `core/access/accessDenialCopy.ts` («Ця дія входить у Pro» ×3).
 *
 * Урок не про рядок, а про форму захисту: **коментар у виправленому файлі
 * не боронить сусідній файл**. Тому пін живе окремо від обох і дивиться на
 * все дерево.
 *
 * Що саме ловимо: рядковий літерал, у якому Є кирилиця (тобто це копія для
 * людини, а не ідентифікатор) І окреме слово `Pro`. Англійські імена
 * (`ProviderProps`, `processPro…`) під це не підпадають, бо кирилиці в них
 * немає; серверний id `"pro"` теж (інший регістр і теж без кирилиці).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, "../..");

const CYRILLIC = /[Ѐ-ӿ]/;
/** Рядкові літерали в одинарних, подвійних і зворотних лапках. */
const STRING_LITERAL = /"([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'|`([^`\\]|\\.)*`/g;
const STANDALONE_PRO = /(^|[^\p{L}\p{N}_])Pro([^\p{L}\p{N}_]|$)/u;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    // Тести описують сценарії словами розробника, не копією для людини:
    // назва «ховає кнопку на щасливому шляху Pro» — це опис тарифу як
    // ГІЛКИ КОДУ, і вимагати там «Premium» означало б ганяти автора за
    // згадку. Перший прогін цього піна спіймав рівно три такі назви й
    // жодного справжнього порушення — тобто без винятку він ловив би
    // прозу, а не копію. `.stories.tsx` НЕ виключаємо: сторі рендеряться
    // в showcase, тобто їхній текст людина бачить.
    if (/\.test\.tsx?$/.test(entry) || full.includes(`${sep}__tests__${sep}`))
      continue;
    out.push(full);
  }
  return out;
}

describe("канонічна назва плану", () => {
  it("у копії для людини немає слова Pro — тільки Premium", () => {
    const offenders: string[] = [];
    for (const file of walk(WEB_SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.match(STRING_LITERAL) ?? []) {
        if (!CYRILLIC.test(m)) continue;
        if (!STANDALONE_PRO.test(m)) continue;
        offenders.push(`${relative(WEB_SRC, file)}: ${m.slice(0, 70)}`);
      }
    }
    expect(
      offenders,
      "Рішення D3: людина бачить «Premium», серверний id лишається `pro`.",
    ).toEqual([]);
  });

  it("сам сканер щось бачить — інакше пін порожній", () => {
    // Нижня межа проти зламаного обходу: якщо файлів нуль, попередній тест
    // зелений завжди й нічого не означає.
    expect(walk(WEB_SRC).length).toBeGreaterThan(500);
  });
});
