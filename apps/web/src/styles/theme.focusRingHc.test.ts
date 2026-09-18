/**
 * Status: Active
 *
 * High-contrast фокус-індикатор МУСИТЬ бути ширшим за базовий.
 *
 * **Що було зламано.** `html.hc` перевизначає `--focus-ring-width` через
 * `--ring-width-hc`, і канон дизайн-системи (`03-spacing-elevation-theming.md`
 * § 8.2, пункт 3) прямо каже: «Усі примітиви, які читають
 * `--focus-ring-width`, автоматично отримують ШИРШИЙ фокус-індикатор».
 * До 2026-09-13 обидва значення дорівнювали 3px — тобто swap підставляв
 * ідентичне число, жоден примітив нічого не отримував, а документація
 * стверджувала протилежне.
 *
 * Помітити це на око неможливо: механізм виглядає робочим (токен є, оверайд
 * є, індирекція є), і тільки порівняння двох чисел показує, що вони рівні.
 * Знайдено при розборі PR-C4 продуктового аудиту 2026-09-13 — сама знахідка
 * C4 («рукописні кільця не бачать HC-ширини») спиралась на цей механізм і
 * тому була беззмістовною: міняти не було чого.
 *
 * **Чому саме тест, а не коментар.** Дефект — це рівність двох чисел у
 * різних блоках одного файлу, за 400 рядків одне від одного. Наступний, хто
 * підійме базову ширину до 5px «для кращої видимості», мовчки поверне рівно
 * той самий стан. Коментар цього не спинить, порівняння спинить.
 *
 * **Друга частина (2026-09-13, PR-C4 по суті).** Полагоджений вище токен
 * доходив лише до 60 місць із 302 — тих, що беруть утиліту `.focus-ring`.
 * Решта 242 пишуть ширину руками (`focus-visible:ring-2`), а Tailwind 4
 * запікає туди літерал `2px`, до якого `--focus-ring-width` не дотягується
 * взагалі. Механізм доводить правило в кінці `theme.css`; його форму й
 * ЛОКАЦІЮ пінить друга група тестів нижче.
 *
 * Локація критична, і це не педантизм: копія того самого правила всередині
 * `@layer base` програє `.ring-2` з шару `utilities` незалежно від
 * специфічності. Перевірено break-тестом у Chromium — рукописне кільце
 * лишалось 4px у HC, тобто правило мовчки не робило нічого. Рівно той клас
 * відмови, заради якого існує перша група тестів.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

/** Останнє присвоєння змінної у файлі (усі вони в px). */
function pxVar(name: string): number {
  const matches = [
    ...css.matchAll(new RegExp(`--${name}:\\s*(\\d+)px\\s*;`, "g")),
  ];
  expect(
    matches.length,
    `--${name} не знайдено в theme.css — змінну перейменували, онови тест разом із нею`,
  ).toBeGreaterThan(0);
  return Number(matches[matches.length - 1]![1]);
}

describe("focus-ring: high contrast ширший за базу", () => {
  const base = pxVar("focus-ring-width");
  const hc = pxVar("ring-width-hc");

  it("базова ширина лишається щонайменше 3px", () => {
    // WCAG 2.2 SC 2.4.11 вимагає периметр щонайменше 2px; 3px — наш власний
    // поріг, і опускати його заради «контрасту» з HC не можна: це погіршило б
    // видимість фокуса всім, хто HC не вмикає.
    expect(base).toBeGreaterThanOrEqual(3);
  });

  it("HC-ширина СТРОГО більша за базову", () => {
    // Головний інваріант. Рівність тут — не «однакове оформлення», а мовчазна
    // відмова механізму: `html.hc` формально перевизначає токен, фактично не
    // змінюючи нічого.
    expect(hc).toBeGreaterThan(base);
  });

  it("різниця відчутна на око, а не формальна", () => {
    // +1px на 3px — це 33%, що на м'якому teal-кільці читається як «здалося».
    // Мета HC — індикатор, який видно з відстані, тож вимагаємо принаймні
    // півтора базових ширини.
    expect(hc).toBeGreaterThanOrEqual(Math.ceil(base * 1.5));
  });

  it("усі три HC-скоупи несуть однакову ширину", () => {
    // `html.hc` і два `[data-theme-preview="hc-*"]` (їх рендерить
    // `DesignShowcase`) мусять збігатись, інакше прев'ю показує не той HC,
    // який побачить користувач.
    const all = [...css.matchAll(/--ring-width-hc:\s*(\d+)px\s*;/g)].map((m) =>
      Number(m[1]),
    );
    expect(all).toHaveLength(3);
    expect(new Set(all).size).toBe(1);
  });
});

/**
 * `theme.css` без коментарів.
 *
 * Шукати правило в сирому тексті не можна: пояснювальний коментар перед ним
 * ЦИТУЄ і Tailwind-овий `--tw-ring-shadow: var(--tw-ring-inset,)`, і приклад
 * із зашитим `2px`. Перша версія цього тесту на цьому й спіймалась —
 * `search()` знаходив цитату, і перевірка локації проходила з правильним
 * результатом із неправильної причини. Тому всі пошуки нижче — по `code`.
 */
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Глибина вкладеності `@layer` для позиції в `code`. 0 = поза шарами.
 */
function layerDepthAt(index: number): number {
  const head = code.slice(0, index).replace(/"[^"]*"/g, '""');
  const openLayers: boolean[] = [];
  for (const m of head.matchAll(/@layer[^{;]*\{|\{|\}/g)) {
    const tok = m[0];
    if (tok.startsWith("@layer")) openLayers.push(true);
    else if (tok === "{") openLayers.push(false);
    else openLayers.pop();
  }
  return openLayers.filter(Boolean).length;
}

describe("focus-ring: HC-ширина доходить і до рукописних кілець", () => {
  const RULE = /--tw-ring-shadow:\s*var\(--tw-ring-inset,\s*\)/;

  it("правило існує", () => {
    // Без нього HC-токен лишається чинним лише для `.focus-ring` (60 місць
    // із 302), а контракт HC §3 у theme.css обіцяє ширший індикатор усьому
    // застосунку.
    expect(code).toMatch(RULE);
  });

  it("правило рівно одне", () => {
    // Друга копія означала б, що хтось продублював механізм замість
    // розширити селектор — і тоді порядок у файлі вирішує, яка з них діє.
    expect([...code.matchAll(new RegExp(RULE, "g"))]).toHaveLength(1);
  });

  it("правило стоїть ПОЗА `@layer` — інакше воно мовчки не діє", () => {
    // Головний інваріант цієї групи. Усередині будь-якого шару правило
    // програє `.ring-2` з `utilities` НЕЗАЛЕЖНО від специфічності, і провал
    // невидимий: кільце просто лишається базовим. Саме тому перевіряємо
    // локацію, а не лише наявність.
    expect(layerDepthAt(code.search(RULE))).toBe(0);
  });

  it("покриті всі три HC-скоупи", () => {
    // `html.hc` — те, що бачить користувач; два `[data-theme-preview="hc-*"]`
    // — плитки `DesignShowcase`. Розбіжність означала б, що прев'ю показує не
    // той HC, який приїде в продакшн.
    const sel = String.raw`\*:focus-visible:not\(\.focus-ring\)`;
    const scopes = [
      new RegExp(String.raw`html\.hc\s+` + sel),
      new RegExp(String.raw`\[data-theme-preview="hc-light"\]\s+` + sel),
      new RegExp(String.raw`\[data-theme-preview="hc-dark"\]\s+` + sel),
    ];
    for (const rx of scopes) expect(code).toMatch(rx);
  });

  it("навмисне придушення кільця лишається придушеним", () => {
    // `DateField`/`TimeField` глушать кільце внутрішнього інпута
    // (`focus-visible:ring-0`), бо його малює обгортка. Без цього винятку HC
    // домальовував би друге кільце всередині першого.
    expect(code).toMatch(/:not\(\.focus-visible\\:ring-0\)/);
  });

  it("ширину беремо з токена, а не літералом", () => {
    // Сенс правила — саме індирекція: підняв `--ring-width-hc`, отримав
    // ширше кільце всюди. Зашитий px повернув би вихідну проблему.
    const at = code.search(RULE);
    const decl = code.slice(at, code.indexOf("}", at));
    expect(decl).toContain("var(--focus-ring-width)");
    expect(decl).not.toMatch(/0 0 0\s+\d+px/);
  });
});
