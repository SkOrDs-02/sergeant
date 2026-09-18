import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Гейт доступності по ВСІХ маршрутах лендінга.
 *
 * Чому по всіх, а не по чотирьох представниках, як в `apps/web`: сторінки
 * тут не мають спільного каркаса поверх layout-а, кожна пише свою розмітку
 * руками, і саме тому одна зламана ієрархія заголовків або кнопка без
 * назви живе на одній сторінці й не ловиться на сусідній. Тридцять
 * статичних сторінок скануються за хвилини – дешевше, ніж вибірка.
 *
 * Джерело списку – `routeMeta.json`, той самий реєстр, з якого будуються
 * sitemap і prerender. Додав маршрут – він одразу під гейтом, забути
 * неможливо.
 */
// JSON читається з диска, а не через `import`: раннер Playwright ходить
// нативним ESM, де JSON-імпорт вимагає import attribute, а той у свою
// чергу не проходить через `isolatedModules` бандлера. Один `readFileSync`
// дешевший за окремий шлях збірки для одного тесту.
const META_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "lib",
  "routeMeta.json",
);
const ROUTE_META = JSON.parse(readFileSync(META_PATH, "utf8")) as Record<
  string,
  unknown
>;
const ROUTES = Object.keys(ROUTE_META).filter((route) => route !== "/404");

/** WCAG 2.1 AA + best-practice, як у гейті `apps/web`. */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

/**
 * Блокують лише `serious` і `critical`. `minor`/`moderate` лишаються
 * видимими у звіті, але не валять PR: інакше гейт червонітиме на
 * стилістичних дрібницях і повторить долю «червоний завжди = вимкнений».
 */
const BLOCKING = new Set(["serious", "critical"]);

test.describe("доступність лендінга", () => {
  for (const route of ROUTES) {
    test(`axe: ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "load" });
      expect(response?.status(), `${route} має віддаватись як 200`).toBe(200);

      const { violations } = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .analyze();

      const blocking = violations.filter((v) => BLOCKING.has(v.impact ?? ""));
      const summary = blocking.map(
        (v) =>
          `${v.impact}: ${v.id} – ${v.help} (${v.nodes.length} вузлів)\n` +
          v.nodes
            .slice(0, 3)
            .map((n) => `    ${n.target.join(" ")}`)
            .join("\n"),
      );

      expect(summary, `${route}\n${summary.join("\n")}`).toEqual([]);
    });
  }
});
