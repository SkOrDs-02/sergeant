// @vitest-environment jsdom
/**
 * «Відкрити» в понеділковій картці «Підсумок минулого тижня» (`weekly_digest_*`)
 * мусить щось робити.
 *
 * Знахідка: рекомендація несла `action: "reports"`, а «Відкрити» йде через
 * `openInsightTarget` → `openModule`, який мовчки ігнорує все, що не є id
 * модуля (`isHubModuleId`). Тож кнопка не робила нічого: ні переходу, ні події,
 * ні розгорнутого блоку. Тест проганяє справжній ланцюжок — рушій
 * рекомендацій → `useNowItems` → `NowPile` → справжній `useHubNavigation` — і
 * міряє спостережуваний ефект кліку, а не внутрішню форму дії.
 *
 * Рішення власника 2026-10-01: «Відкрити звіт тижня» веде в блок «Порада й звіт
 * тижня» на хабі (подія `openWeekReport`), як і тижнева картка про темп (f3).
 * Коли блок вимкнено в налаштуваннях (`showInsights`), подію не слухає ніхто, і
 * крос-модульна картка (модуля в неї немає) веде у вкладку «Звіти» хабу.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import type { Workout } from "@sergeant/fizruk-domain";
import { onHubBus } from "@shared/lib/modules/hubBus";
import { useHubNavigation } from "../../hooks/useHubNavigation";
import { writeHubPrefsBag } from "../../settings/hubPrefs";
import { NowPile } from "./NowPile";
import { useNowItems } from "./useNowItems";

// Побічні ефекти навігації (аналітика, «нещодавні модулі») — не предмет цього
// тесту; лишаємо справжні `openModule` / `isHubModuleId` / `emitHubBus`.
vi.mock("../../observability/posthog", () => ({
  capturePostHogEvent: vi.fn(),
}));
vi.mock("../../lib/recentModules", () => ({ recordModuleOpen: vi.fn() }));
vi.mock("../../observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: { MODULE_OPENED: "module_opened" },
}));

/** Те саме, що `useHubDashboardState.openInsightTarget`, на справжньому `openModule`. */
function Harness() {
  const nav = useHubNavigation();
  const location = useLocation();
  const now = useNowItems();
  return (
    <>
      <NowPile
        now={now}
        onOpenTarget={(module, hash) =>
          hash ? nav.openModule(module, { hash }) : nav.openModule(module)
        }
      />
      <output data-testid="active-module">{nav.activeModule ?? "-"}</output>
      <output data-testid="location">
        {location.pathname + location.search}
      </output>
    </>
  );
}

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Harness />
    </MemoryRouter>,
  );
}

/** Понеділок 2026-04-27 09:00 за годинником пристрою: вікно картки 07:00–12:00. */
const MONDAY_MORNING = new Date(2026, 3, 27, 9, 0, 0, 0);

describe("weekly_digest_*: «Відкрити» щось робить", () => {
  const busEvents: string[] = [];
  let offBus: () => void;

  beforeEach(() => {
    localStorage.clear();
    busEvents.length = 0;
    offBus = onHubBus("openWeekReport", () => busEvents.push("openWeekReport"));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MONDAY_MORNING);
    // Тренування минулого тижня (20–26.04) — єдине, що живить картку.
    __setFizrukSqliteCacheForTests({
      workouts: [
        {
          id: "w1",
          // Нд 26.04 — вчора: інсайт «N днів без тренування» ще не з'являється
          // і не заважає купі з однієї картки.
          startedAt: "2026-04-26T10:00:00.000Z",
          endedAt: "2026-04-26T11:00:00.000Z",
          items: [],
        },
      ] as unknown as Workout[],
      refreshedAt: MONDAY_MORNING.toISOString(),
    } as Parameters<typeof __setFizrukSqliteCacheForTests>[0]);
  });

  afterEach(() => {
    offBus();
    vi.useRealTimers();
    clearFizrukSqliteCache();
    localStorage.clear();
  });

  /** Усе, що людина могла побачити після кліку: подія хабу, перехід, відкритий модуль. */
  const effectsOfClick = () => {
    const effects: string[] = [...busEvents];
    const location = screen.getByTestId("location").textContent;
    if (location !== "/") effects.push(`navigate ${location}`);
    const active = screen.getByTestId("active-module").textContent;
    if (active !== "-") effects.push(`module ${active}`);
    return effects;
  };

  it("картка «Підсумок минулого тижня» є в купі «Зараз»", () => {
    renderHub();
    expect(screen.getByText("Підсумок минулого тижня")).toBeInTheDocument();
  });

  /**
   * Основна кнопка картки. Підпис («Подивитись» / «Відкрити звіт тижня») —
   * частина того, що тут перевіряється, тож шукаємо кнопку за назвою картки, а
   * не за підписом: aria-label hero — `<підпис>: <заголовок>`.
   */
  const primaryButton = () =>
    screen.getByRole("button", { name: /: Підсумок минулого тижня$/ });

  it("клік не лишається без ефекту (інваріант: «Відкрити» ніколи не мовчить)", () => {
    renderHub();
    act(() => {
      fireEvent.click(primaryButton());
    });
    expect(effectsOfClick()).not.toEqual([]);
  });

  it("клік шле подію «Звіт тижня» — блок розгорнеться, а кнопка так і називається", () => {
    renderHub();
    expect(primaryButton()).toHaveAccessibleName(
      "Відкрити звіт тижня: Підсумок минулого тижня",
    );
    act(() => {
      fireEvent.click(primaryButton());
    });
    expect(effectsOfClick()).toEqual(["openWeekReport"]);
  });

  it("блок «Порада й тиждень» вимкнено: веде у вкладку «Звіти», а не нікуди", () => {
    writeHubPrefsBag({ showInsights: false });
    renderHub();
    act(() => {
      fireEvent.click(primaryButton());
    });
    expect(busEvents).toEqual([]);
    expect(screen.getByTestId("location")).toHaveTextContent("/?tab=reports");
  });
});
