import { describe, expect, it } from "vitest";

import { isPathBasedModulePath } from "../app/appPaths";
import { KNOWN_PATHS } from "../app/routes";
import { ALL_CAPABILITIES, CAPABILITY_GROUPS } from "./capabilityRegistry";

/**
 * Каталог можливостей — рекламна вітрина застосунку. Найгірший його стан не
 * «застарілий текст», а картка, що веде в нікуди: юзер тапає обіцянку і
 * отримує 404. Цей тест і є той гейт, який спека вимагає замість ручної
 * перевірки — реєстр статичний, тож перевірити його можна повністю.
 */
describe("capabilityRegistry", () => {
  /**
   * Топ-рівневі сегменти, які володіє САМ роутер (`core/app/router.tsx`), а
   * не `StandaloneRoutes`. `KNOWN_PATHS` їх не бачить, бо виводиться лише зі
   * standalone-таблиці. Список короткий і майже не змінюється, тож тримати
   * його тут дешевше, ніж моделювати весь роутер; головна помилка, яку ловить
   * цей тест, — це все одно одруківка в href.
   */
  const ROUTER_OWNED_SEGMENTS = ["insights", "settings", "onboarding"];

  it("кожен href веде на реальний маршрут", () => {
    for (const item of ALL_CAPABILITIES) {
      // Порівнюємо лише pathname: `?group=…#settings-…` — це deep-link
      // всередині сторінки налаштувань, роутер його не розрізняє.
      const pathname = item.href.split(/[?#]/)[0] ?? "";
      const firstSegment = pathname.split("/")[1] ?? "";
      const reachable =
        KNOWN_PATHS.has(pathname) ||
        isPathBasedModulePath(pathname) ||
        ROUTER_OWNED_SEGMENTS.includes(firstSegment);
      expect(
        reachable,
        `«${item.title}» веде на ${item.href}, якого немає серед маршрутів`,
      ).toBe(true);
    }
  });

  it("id унікальні — вони є React-ключами і testid-ами", () => {
    const ids = ALL_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("жодна група не порожня", () => {
    for (const group of CAPABILITY_GROUPS) {
      expect(
        group.items.length,
        `група «${group.title}» порожня`,
      ).toBeGreaterThan(0);
    }
  });

  it("кожен запис має текст, який щось пояснює", () => {
    for (const item of ALL_CAPABILITIES) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      // Однослівний опис — це назва, а не пояснення користі.
      expect(
        item.description.trim().split(/\s+/).length,
        `опис «${item.title}» надто короткий`,
      ).toBeGreaterThan(5);
    }
  });
});
