/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-09
 * Status: Active
 *
 * Регресія B1 прийомного прогону бети 2026-08-09
 * (`docs/90-work/audits/2026-08-09-beta-acceptance-run.md`).
 *
 * Секція звʼязків читає ряди з кешів SQLite Фініка, Їжі та Фізрука, а ті —
 * синглтони ДОКУМЕНТА: після повного завантаження сторінки вони порожні й
 * наповнюються вже після першого рендера. З `useMemo(..., [])` секція
 * рахувала рівно один раз, по холодному кешу, і більше ніколи — тож при
 * повній базі впевнено заявляла «Поки що звʼязків не бачу · 0 з N
 * спостережень». SPA-перехід із модуля (кеш теплий) давав правильну
 * відповідь на тому самому екрані. Тобто відповідь залежала від шляху
 * навігації, і закладка / hard reload / холодний старт PWA брехали.
 *
 * Тест пінить КОНТРАКТ, а не картинку: перерахунок відбувається за подією
 * оновлення кешу. Через модульні кеші стану холодний старт не змоделюєш
 * очищенням `localStorage` — дані лишаються в памʼяті, — тому рахуємо
 * виклики `buildCrossModuleSeries` напряму. Окремий файл, бо мок модуля
 * зіпсував би сусідній інтеграційний тест.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

import { emitHubBus } from "@shared/lib/modules/hubBus";
import CrossModuleLinksSection from "./CrossModuleLinksSection";
import { buildCrossModuleSeries } from "./digestCorrelations";
import {
  notifyFinykSqliteCacheRefresh,
  __resetFinykSqliteReadGateForTests,
} from "../../modules/finyk/lib/sqliteReadGate";
import {
  notifyNutritionSqliteCacheRefresh,
  __resetNutritionSqliteReadGateForTests,
} from "../../modules/nutrition/lib/sqliteReadGate";
import {
  notifyFizrukSqliteCacheRefresh,
  __resetFizrukSqliteReadGateForTests,
} from "../../modules/fizruk/lib/sqliteReadGate";

vi.mock("./digestCorrelations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./digestCorrelations")>();
  return {
    ...actual,
    buildCrossModuleSeries: vi.fn(actual.buildCrossModuleSeries),
  };
});

const buildSpy = vi.mocked(buildCrossModuleSeries);

describe("CrossModuleLinksSection — перерахунок за прогрівом кешу", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetFinykSqliteReadGateForTests();
    __resetNutritionSqliteReadGateForTests();
    __resetFizrukSqliteReadGateForTests();
    buildSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("перераховує ряди, коли кеш Фініка повідомляє про оновлення", () => {
    render(<CrossModuleLinksSection />);
    const afterMount = buildSpy.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);

    act(() => {
      notifyFinykSqliteCacheRefresh();
    });

    // Саме тут падав баг: до фіксу лічильник не рухався НІКОЛИ, тож
    // холодний перший рендер ставав остаточною відповіддю.
    expect(buildSpy.mock.calls.length).toBeGreaterThan(afterMount);
  });

  it("перераховує і на кеші Їжі, і на кеші Фізрука", () => {
    render(<CrossModuleLinksSection />);
    const afterMount = buildSpy.mock.calls.length;

    act(() => {
      notifyNutritionSqliteCacheRefresh();
    });
    const afterNutrition = buildSpy.mock.calls.length;
    expect(afterNutrition).toBeGreaterThan(afterMount);

    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    expect(buildSpy.mock.calls.length).toBeGreaterThan(afterNutrition);
  });

  it("перераховує на hub-сигналі сховища (ряди Рутини — не з SQLite)", () => {
    render(<CrossModuleLinksSection />);
    const afterMount = buildSpy.mock.calls.length;

    // Рутина пише через `emitRoutineStorage` → hubBus, а не через тік
    // SQLite. Саме через це самих тіків не вистачало: при повному
    // завантаженні `/insights` порожніми були ВСІ ряди («0 з 5»), і
    // гідрація Рутини не будила секцію взагалі.
    act(() => {
      emitHubBus("storageUpdated", undefined);
    });

    expect(buildSpy.mock.calls.length).toBeGreaterThan(afterMount);
  });

  it("без події оновлення зайвих перерахунків не робить", () => {
    const { rerender } = render(<CrossModuleLinksSection />);
    const afterMount = buildSpy.mock.calls.length;

    rerender(<CrossModuleLinksSection />);

    // Тіки — це подія ДАНИХ, а не «рахуй на кожен рендер»: 60 днів × 10
    // метрик зі сховища на кожен перемальовок повернули б іншу проблему.
    expect(buildSpy.mock.calls.length).toBe(afterMount);
  });
});
