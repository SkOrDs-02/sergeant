import { describe, expect, it } from "vitest";
import {
  SHARED_PKG_SRC,
  copySources,
  lineOf,
  literalsIn,
  webCopySources,
} from "./__tests__/webCopySources";

/**
 * §2.13 аудиту копії вебу (2026-09-23): інструкція називає кнопку, якої
 * немає. «Спочатку натисни «+ Нове»», «через кнопку «+ Додати»», «Кнопка
 * «Інфо» праворуч»: жодного з цих підписів на екрані нема, і жоден гейт
 * цього не бачив, бо сам рядок бездоганний: правильний тон, без тире, на
 * «ти». Помилка тут не у формі, а у ФАКТІ, тож і перевірка фактична: кожен
 * підпис у лапках після «кнопк…», «натисни» чи «тапни» мусить існувати як
 * окремий рядковий літерал або JSX-текст.
 *
 * Де саме мусить існувати. Інструкція з `modules/<m>/**` шукає підпис у
 * своєму модулі, у `core/**`, `shared/**` (спільні кнопки й каталог
 * `uk.core.ts`) та в `@sergeant/shared` (підпис undo-тосту живе там), але
 * НЕ в інших модулях і не в їхніх каталогах: кнопка «+ Додати» є у
 * Фініку, а інструкція стоїть на екрані Фізрука, де такої кнопки нема.
 * Інструкція поза модулями може посилатись на будь-який підпис.
 *
 * Підписом вважається рядковий літерал (разом з `aria-label` і каталогом)
 * або текст між тегами, після trim. Збіг точний і з урахуванням регістру:
 * «Інфо» в інструкції та `aria-label="Деталі вправи"` на кнопці це різні
 * назви, і скрінрідер назве другу. Кнопка з іконкою та текстом «Додати»
 * теж не є кнопкою «+ Додати»: людина шукає те, що написано.
 */
const REFERENCE = /(?:[Кк]нопк[а-яіїєґ]*|[Нн]атисни|[Тт]апни)\s+«([^»]+)»/g;
const JSX_TEXT = />([^<>{}]+)</g;

const MODULES = new Set(["finyk", "fizruk", "nutrition", "routine"]);
const SHARED = "*";

/** Модуль, якому належить файл (разом із його каталогом), або спільний. */
function scopeOf(rel: string): string {
  const inModule = /^modules\/([^/]+)\//.exec(rel)?.[1];
  if (inModule) return inModule;
  const catalog = /^shared\/i18n\/uk\.([^.]+)\.ts$/.exec(rel)?.[1];
  return catalog && MODULES.has(catalog) ? catalog : SHARED;
}

interface Reference {
  file: string;
  line: number;
  label: string;
  scope: string;
}

function collect(): { labels: Map<string, Set<string>>; refs: Reference[] } {
  const labels = new Map<string, Set<string>>();
  const refs: Reference[] = [];
  const add = (raw: string | undefined, scope: string) => {
    const label = (raw ?? "").trim();
    if (!label) return;
    let scopes = labels.get(label);
    if (!scopes) labels.set(label, (scopes = new Set()));
    scopes.add(scope);
  };
  for (const { clean } of copySources(SHARED_PKG_SRC)) {
    for (const { value } of literalsIn(clean)) add(value, SHARED);
  }
  for (const { rel, clean } of webCopySources()) {
    const scope = scopeOf(rel);
    for (const { value } of literalsIn(clean)) add(value, scope);
    for (const m of clean.matchAll(JSX_TEXT)) add(m[1], scope);
    for (const m of clean.matchAll(REFERENCE)) {
      refs.push({
        file: rel,
        line: lineOf(clean, m.index ?? 0),
        label: m[1] ?? "",
        scope,
      });
    }
  }
  return { labels, refs };
}

function exists(
  labels: Map<string, Set<string>>,
  { label, scope }: Reference,
): boolean {
  const scopes = labels.get(label);
  if (!scopes) return false;
  return scope === SHARED || scopes.has(scope) || scopes.has(SHARED);
}

describe("інструкція «кнопка «X»» посилається на наявний підпис (аудит 2026-09-23 §2.13)", () => {
  const { labels, refs } = collect();

  it("сканер знаходить інструкції, інакше перевірка порожня", () => {
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });

  it("кожен названий підпис існує у своєму модулі або серед спільних", () => {
    const missing = refs
      .filter((r) => !exists(labels, r))
      .map((r) => `${r.file}:${r.line} «${r.label}»`);
    expect(missing).toEqual([]);
  });
});
