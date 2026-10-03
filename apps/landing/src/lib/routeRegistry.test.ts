import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../App";
import { ROUTE_META } from "./pageMeta";

/**
 * Гейт двох реєстрів. `ROUTES` (App.tsx) і `routeMeta.json` незалежні, а
 * розходження між ними тихе при зеленому білді:
 *
 * - маршрут лише в `routeMeta` → `dist/<route>/index.html` дістає правильний
 *   title і тіло 404;
 * - маршрут лише в `ROUTES` → per-route HTML не генерується взагалі, і
 *   Vercel віддає `dist/404.html` зі статусом 404 на маршрут, який код
 *   вважає живим (catch-all rewrite прибрано 2026-09-02; до того це був
 *   точний дубль головної на новому URL).
 *
 * Обидва провали мовчазні, тож звірка живе тестом, а не оком рецензента.
 *
 * Сюди ж — третій реєстр, `public/llms.txt`: він рукописний, і GEO-аудит
 * 2026-09-14 застав його відсталим на каталог гайдів. Файл читають ШІ-агенти
 * як карту сайту, тож пропущений маршрут для них означає «сторінки немає».
 */
const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
);

/**
 * Маршрути поза llms.txt і поза межами довжин: `/beta` має `noindex` і живе
 * лише як гейт конверсії, `/404` — технічна сторінка. Обидва навмисно не
 * потрапляють ні в sitemap, ні в карту для агентів.
 */
const UNLISTED = new Set(["/beta", "/404"]);

const indexedRoutes = Object.entries(ROUTE_META).filter(
  ([route]) => !UNLISTED.has(route),
);

describe("реєстри маршрутів", () => {
  it("ROUTES і routeMeta.json описують той самий набір маршрутів", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(ROUTE_META).sort());
  });

  it("llms.txt перелічує кожен індексований маршрут і жодного зайвого", () => {
    const llms = readFileSync(path.join(PUBLIC_DIR, "llms.txt"), "utf8");
    const listed = new Set(
      [...llms.matchAll(/https:\/\/sergeant\.com\.ua(\/[a-z0-9\-/]*)?/g)].map(
        (match) => match[1] ?? "/",
      ),
    );

    expect(
      indexedRoutes
        .map(([route]) => route)
        .filter((route) => !listed.has(route)),
    ).toEqual([]);
    expect([...listed].filter((route) => !(route in ROUTE_META))).toEqual([]);
  });

  it("текст посилання кожного гайда в llms.txt дорівнює його title", () => {
    // Три імені одного гайда (мета, каталог, llms.txt) – знахідка ради
    // 2026-09-15. Каталог тепер читає title з routeMeta; llms.txt рукописний,
    // тож рівність тримає цей тест.
    const llms = readFileSync(path.join(PUBLIC_DIR, "llms.txt"), "utf8");
    const mismatched = indexedRoutes
      .filter(([route]) => route.startsWith("/guides/"))
      .flatMap(([route, meta]) => {
        const match = llms.match(
          new RegExp(
            String.raw`\[([^\]]+)\]\(https://sergeant\.com\.ua${route}\)`,
          ),
        );
        const text = match?.[1];
        return text === meta.title
          ? []
          : [`${route}: «${text}» ≠ «${meta.title}»`];
      });
    expect(mismatched).toEqual([]);
  });

  it("title і description кожного індексованого маршруту в межах видачі", () => {
    // 30–60 і 120–160 символів: коротший title пошуковик замінює власним
    // рядком зі сторінки, довший — ріже. Ті самі межі перевіряє GEO-аудит.
    const outOfRange = indexedRoutes.flatMap(([route, meta]) => {
      const title = [...meta.title].length;
      const description = [...meta.description].length;
      const problems: string[] = [];
      if (title < 30 || title > 60) problems.push(`title=${title}`);
      if (description < 120 || description > 160) {
        problems.push(`description=${description}`);
      }
      return problems.length ? [`${route}: ${problems.join(", ")}`] : [];
    });

    expect(outOfRange).toEqual([]);
  });

  it("title маршрутів не повторюються", () => {
    const titles = indexedRoutes.map(([, meta]) => meta.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
