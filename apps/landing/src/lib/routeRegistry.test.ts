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
 */
describe("реєстри маршрутів", () => {
  it("ROUTES і routeMeta.json описують той самий набір маршрутів", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(ROUTE_META).sort());
  });
});
