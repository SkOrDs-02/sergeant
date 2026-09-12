/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  resetVisualKeyboardInsetAdapter,
  setVisualKeyboardInsetAdapter,
} from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { HubBottomNav } from "./HubBottomNav";

const STORAGE_KEY = "sergeant.hub.reportsTabRevealedAt";

// Читаємо мітку з каталогу, а не прибиваємо рядком: вкладку вже
// перейменовували («Звіти» → «Звʼязки», 2026-08-05), і тест має ловити
// зникнення вкладки, а не зміну її назви.
const REPORTS_TAB = new RegExp(messages.nav.reports);

type TestHubView = "dashboard" | "reports" | "profile" | "settings";

function renderNav(props: {
  hubView?: TestHubView;
  showReports?: boolean;
  showProfile?: boolean;
  onChange?: (v: TestHubView) => void;
  onShowAuth?: (() => void) | undefined;
}) {
  const onChange = props.onChange ?? vi.fn();
  return {
    onChange,
    ...render(
      <HubBottomNav
        hubView={props.hubView ?? "dashboard"}
        onChange={onChange}
        showReports={props.showReports ?? true}
        showProfile={props.showProfile}
        onShowAuth={props.onShowAuth}
      />,
    ),
  };
}

describe("HubBottomNav", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("рендерить три таби за замовчуванням", () => {
    renderNav({});
    expect(screen.getByRole("tab", { name: /Головна/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: REPORTS_TAB })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Налаштування/ }),
    ).toBeInTheDocument();
  });

  it("ховає «Звіти» коли showReports=false", () => {
    renderNav({ showReports: false });
    expect(screen.queryByRole("tab", { name: REPORTS_TAB })).toBeNull();
  });

  it("ховає «Профіль» за замовчуванням (гість)", () => {
    renderNav({});
    expect(screen.queryByRole("tab", { name: /Профіль/ })).toBeNull();
  });

  it("показує «Профіль» коли showProfile=true (залогінений)", () => {
    renderNav({ showProfile: true });
    expect(screen.getByRole("tab", { name: /Профіль/ })).toBeInTheDocument();
  });

  it("виклик onChange при кліку на «Профіль»", () => {
    const { onChange } = renderNav({ showProfile: true });
    fireEvent.click(screen.getByRole("tab", { name: /Профіль/ }));
    expect(onChange).toHaveBeenCalledWith("profile");
  });

  it("активний таб має aria-selected=true", () => {
    renderNav({ hubView: "reports" });
    const reports = screen.getByRole("tab", { name: REPORTS_TAB });
    expect(reports).toHaveAttribute("aria-selected", "true");

    const dashboard = screen.getByRole("tab", { name: /Головна/ });
    expect(dashboard).toHaveAttribute("aria-selected", "false");
  });

  it("позначає активний таб суцільною заливкою (border-transparent), решту — без неї", () => {
    renderNav({ hubView: "settings" });

    const settings = screen.getByRole("tab", { name: /Налаштування/ });
    const settingsPill = settings.firstElementChild as HTMLElement;
    // Fix spec v2 § 1: light mirrors dark — solid emerald fill + ink-on-
    // cream foreground, not an outline. `text-bg` is theme-aware, so one
    // bare class covers both themes' foreground.
    expect(settingsPill.className).toContain("bg-brand-strong");
    expect(settingsPill.className).toContain("dark:bg-brand-400");
    expect(settingsPill.className).toContain("text-bg");

    const home = screen.getByRole("tab", { name: /Головна/ });
    const homePill = home.firstElementChild as HTMLElement;
    expect(homePill.className).toContain("bg-transparent");
    expect(homePill.className).not.toContain("bg-brand-strong");
    expect(homePill.className).not.toContain("dark:bg-brand-400");
  });

  // Founder-аудит R1 (2026-09-11): контейнер раніше розкладав таби через
  // `flex` із `flex-initial` (активний) / `flex-1` (неактивні) — інший
  // алгоритм, ніж grid у `ModuleBottomNav` — і піл під активним табом
  // ріс за вмістом замість фіксованого боксу. Обидва наві виглядали
  // однаково (та сама оболонка), але розкладались по-різному, і зазор
  // між пілюлями стрибав так само, як описано в R1 для модульних навів.
  describe("однакова геометрія табів (R1 fix, 2026-09-11)", () => {
    it("контейнер розкладає таби через CSS grid із рівними колонками, як ModuleBottomNav", () => {
      const { container } = renderNav({});
      const grid = container.querySelector("nav > div") as HTMLElement;

      expect(grid).not.toBeNull();
      expect(grid.className).toContain("grid");
      expect(grid.className).not.toMatch(/(?:^|\s)flex(?:\s|$)/);
      // Базовий стан (гість, showProfile=false, onShowAuth не надано) —
      // рівно 3 таби: Головна, «Звʼязки» (слот завжди в DOM-і, навіть
      // прихований), Налаштування.
      expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    });

    it("рахує колонку і для action-табу «Увійти», який рендериться поза масивом tabs", () => {
      const { container } = renderNav({ onShowAuth: vi.fn() });
      const grid = container.querySelector("nav > div") as HTMLElement;

      expect(grid.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    });

    // Regression guard: до фіксу активний піл ріс за вмістом
    // (`flex-initial` на кнопці + сам піл без фіксованої ширини), а
    // неактивний ділив залишок (`flex-1`) — жоден із двох не мав
    // однакового `w-full`/`h-full` боксу. Той самий дефект, що і в
    // `ModuleBottomNav` (лише інша механіка розпирання).
    it("дає активній і неактивній пілюлі однаковий бокс, інакше зазор між ними стрибає", () => {
      renderNav({ hubView: "settings" });

      const settingsPill = screen.getByRole("tab", { name: /Налаштування/ })
        .firstElementChild as HTMLElement;
      const homePill = screen.getByRole("tab", { name: /Головна/ })
        .firstElementChild as HTMLElement;

      expect(settingsPill.className).toContain("w-full");
      expect(settingsPill.className).toContain("h-full");
      expect(homePill.className).toContain("w-full");
      expect(homePill.className).toContain("h-full");
    });
  });

  it("виклик onChange при кліку на таб", () => {
    const { onChange } = renderNav({});
    fireEvent.click(screen.getByRole("tab", { name: /Налаштування/ }));
    expect(onChange).toHaveBeenCalledWith("settings");
  });

  it("renders as a bottom-nav-shell — inset, rounded, framed", () => {
    renderNav({});
    const nav = screen.getByRole("navigation");
    const settingsTab = screen.getByRole("tab", { name: /Налаштування/ });

    // bottom-nav-shell utility (utilities.css) handles floating-pill
    // layout in browser mode and edge-to-edge dock in PWA standalone.
    // The styles are applied via CSS (not Tailwind classes), so we
    // assert the utility class name and the co-applied surface classes.
    expect(nav.className).toContain("bottom-nav-shell");
    expect(nav.className).toContain("bg-panel");
    expect(nav.className).toContain("border");
    expect(settingsTab.className).toContain("justify-center");
    expect(settingsTab.firstElementChild).toHaveClass("rounded-2xl", "py-1");
  });

  it("tablist semantics: кожен таб має aria-controls", () => {
    renderNav({});
    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      expect(tab).toHaveAttribute("aria-controls");
    }
  });

  it("ставить прапор у localStorage коли reports зʼявляється", () => {
    const { rerender, onChange } = renderNav({ showReports: false });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    rerender(
      <HubBottomNav
        hubView="dashboard"
        onChange={onChange}
        showReports={true}
      />,
    );
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("не показує ««Звіти» тепер доступні» toast при reveal-і (UX roast 2026-Q2 R1)", () => {
    const { rerender, onChange } = renderNav({ showReports: false });
    rerender(
      <HubBottomNav
        hubView="dashboard"
        onChange={onChange}
        showReports={true}
      />,
    );
    expect(screen.queryByText(/«Звіти» тепер доступні/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("все ще запускає bounce-анімацію на «Звіти» при першому reveal-і", () => {
    const { rerender, onChange } = renderNav({ showReports: false });
    rerender(
      <HubBottomNav
        hubView="dashboard"
        onChange={onChange}
        showReports={true}
      />,
    );
    const reports = screen.getByRole("tab", { name: REPORTS_TAB });
    expect(reports.className).toContain("animate-bounce-in");
  });

  it("не показує toast вдруге: якщо прапор вже у localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "123");
    renderNav({ showReports: true });
    // Bounce class = .animate-bounce-in. Без прапора й без transition «false→true»
    // анімація не повинна ставитись.
    const reports = screen.getByRole("tab", { name: REPORTS_TAB });
    expect(reports.className).not.toContain("animate-bounce-in");
  });

  // PR-23 / §7.2 — Layout shift fix on Reports tab reveal.
  describe("шар-резерв слота для «Звіти» (CLS-fix, UX-roast §7.2)", () => {
    it("слот «Звіти» рендериться у DOM навіть коли showReports=false (як invisible)", () => {
      const { container } = renderNav({ showReports: false });
      // AT не бачить hidden-слот: `getByRole("tab", ..)` за замовчуванням
      // ігнорує елементи з `visibility: hidden` (computed style).
      expect(screen.queryByRole("tab", { name: REPORTS_TAB })).toBeNull();
      // Але слот реально існує у DOM — це і фіксує геометрію tab-strip-у.
      const hiddenReports =
        container.querySelector<HTMLButtonElement>("#hub-tab-reports");
      expect(hiddenReports).not.toBeNull();
      expect(hiddenReports!).toBeInTheDocument();
      expect(hiddenReports!.style.visibility).toBe("hidden");
      expect(hiddenReports!.className).toContain("invisible");
      expect(hiddenReports!.className).toContain("pointer-events-none");
      expect(hiddenReports!.tabIndex).toBe(-1);
    });

    it("кількість слотів у tablist стабільна між showReports=false → true (без CLS)", () => {
      const { container, rerender, onChange } = renderNav({
        showReports: false,
      });
      const slotsBefore = container.querySelectorAll('[role="tab"]').length;

      rerender(
        <HubBottomNav
          hubView="dashboard"
          onChange={onChange}
          showReports={true}
        />,
      );
      const slotsAfter = container.querySelectorAll('[role="tab"]').length;
      expect(slotsAfter).toBe(slotsBefore);
    });

    it("слот «Звіти» не виконує onChange при кліку, поки прихований", () => {
      const { container, onChange } = renderNav({ showReports: false });
      const hiddenReports =
        container.querySelector<HTMLButtonElement>("#hub-tab-reports");
      expect(hiddenReports).not.toBeNull();
      fireEvent.click(hiddenReports!);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ─── onShowAuth — «Увійти» action tab ───────────────────────────────────────

  describe("onShowAuth action tab (guest «Увійти»)", () => {
    it("рендерить «Увійти» коли onShowAuth надано і showProfile=false", () => {
      const onShowAuth = vi.fn();
      renderNav({ onShowAuth });
      const signIn = screen.getByRole("button", { name: /Увійти/ });
      expect(signIn).toBeInTheDocument();
    });

    it("«Увійти» — action tab: не має role=tab і aria-selected", () => {
      const onShowAuth = vi.fn();
      renderNav({ onShowAuth });
      const signIn = screen.getByRole("button", { name: /Увійти/ });
      expect(signIn).not.toHaveAttribute("role", "tab");
      expect(signIn).not.toHaveAttribute("aria-selected");
    });

    it("«Увійти» відсутній коли showProfile=true (залогінений)", () => {
      const onShowAuth = vi.fn();
      renderNav({ onShowAuth, showProfile: true });
      expect(screen.queryByRole("button", { name: /Увійти/ })).toBeNull();
    });

    it("«Увійти» відсутній коли onShowAuth не надано", () => {
      renderNav({});
      expect(screen.queryByRole("button", { name: /Увійти/ })).toBeNull();
    });

    it("клік на «Увійти» викликає onShowAuth", () => {
      const onShowAuth = vi.fn();
      renderNav({ onShowAuth });
      fireEvent.click(screen.getByRole("button", { name: /Увійти/ }));
      expect(onShowAuth).toHaveBeenCalledOnce();
    });

    it("клік на «Увійти» НЕ викликає onChange", () => {
      const onChange = vi.fn();
      const onShowAuth = vi.fn();
      renderNav({ onChange, onShowAuth });
      fireEvent.click(screen.getByRole("button", { name: /Увійти/ }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ─── Keyboard navigation (WAI-ARIA roving tabindex) ──────────────────────────

  describe("keyboard navigation — ArrowLeft/ArrowRight/Home/End", () => {
    it("ArrowRight переміщує фокус на наступний таб", () => {
      renderNav({ hubView: "dashboard" });
      const dashboard = screen.getByRole("tab", { name: /Головна/ });
      dashboard.focus();
      fireEvent.keyDown(dashboard, { key: "ArrowRight" });
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: REPORTS_TAB }),
      );
    });

    it("ArrowLeft переміщує фокус на попередній таб", () => {
      renderNav({ hubView: "reports" });
      const reports = screen.getByRole("tab", { name: REPORTS_TAB });
      reports.focus();
      fireEvent.keyDown(reports, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /Головна/ }),
      );
    });

    it("Home переміщує фокус на перший таб", () => {
      renderNav({ hubView: "settings" });
      const settings = screen.getByRole("tab", { name: /Налаштування/ });
      settings.focus();
      fireEvent.keyDown(settings, { key: "Home" });
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /Головна/ }),
      );
    });

    it("End переміщує фокус на останній таб", () => {
      renderNav({ hubView: "dashboard" });
      const dashboard = screen.getByRole("tab", { name: /Головна/ });
      dashboard.focus();
      fireEvent.keyDown(dashboard, { key: "End" });
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /Налаштування/ }),
      );
    });

    it("ArrowRight зациклюється: останній → перший", () => {
      renderNav({ hubView: "settings" });
      const settings = screen.getByRole("tab", { name: /Налаштування/ });
      settings.focus();
      fireEvent.keyDown(settings, { key: "ArrowRight" });
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /Головна/ }),
      );
    });

    it("ArrowLeft зациклюється: перший → останній", () => {
      renderNav({ hubView: "dashboard" });
      const dashboard = screen.getByRole("tab", { name: /Головна/ });
      dashboard.focus();
      fireEvent.keyDown(dashboard, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /Налаштування/ }),
      );
    });

    it("нерелевантні клавіші не переміщують фокус", () => {
      renderNav({ hubView: "dashboard" });
      const dashboard = screen.getByRole("tab", { name: /Головна/ });
      dashboard.focus();
      fireEvent.keyDown(dashboard, { key: "Enter" });
      expect(document.activeElement).toBe(dashboard);
    });

    it("ArrowRight від незфокусованого tablist переміщується на перший таб (currentIndex===-1 branch)", () => {
      renderNav({ hubView: "settings" });
      // Ensure no tab is focused so currentIndex will be -1.
      (document.activeElement as HTMLElement)?.blur?.();
      const settings = screen.getByRole("tab", { name: /Налаштування/ });
      fireEvent.keyDown(settings, { key: "ArrowRight" });
      // With currentIndex=-1 the handler falls back to nextIndex=0 (Головна).
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /Головна/ }),
      );
    });
  });

  // ─── Migration / cold-start path for Reports tab ─────────────────────────────

  describe("Reports tab cold-start migration path", () => {
    it("silently sets localStorage flag when mounted with showReports=true and no flag (cold-start/migration)", () => {
      // No flag in localStorage; component mounts with showReports already=true.
      // This is the migration path — the tab was already unlocked in a prior session
      // but the flag wasn't written. No animation; flag is set silently.
      localStorage.clear();
      renderNav({ showReports: true });
      // Flag must be written so the next mount doesn't re-run migration.
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      // No bounce animation on cold-start mount.
      const reports = screen.getByRole("tab", { name: REPORTS_TAB });
      expect(reports.className).not.toContain("animate-bounce-in");
    });

    it("does not overwrite flag when localStorage already has a timestamp", () => {
      localStorage.setItem(STORAGE_KEY, "999");
      renderNav({ showReports: true });
      // Value should remain exactly "999" (not overwritten).
      expect(localStorage.getItem(STORAGE_KEY)).toBe("999");
    });
  });

  // ─── handleTablistKeyDown guards ─────────────────────────────────────────────

  describe("handleTablistKeyDown — guard branches", () => {
    it("does nothing when no role=tab elements are visible in the tablist (empty tabs guard)", () => {
      // Use showReports=false and no profile — renders dashboard + hidden-reports-slot + settings.
      // The visible tabs are Головна and Налаштування. This test exercises the path
      // where all tabs happen to be hidden (we force this via a custom setup).
      const { container } = renderNav({ showReports: false });

      // Manually hide all tabs via inline style to make visibleTabs.length === 0.
      const allTabButtons = container.querySelectorAll<HTMLButtonElement>(
        'button[id^="hub-tab-"]',
      );
      const originalStyles: string[] = [];
      allTabButtons.forEach((btn) => {
        originalStyles.push(btn.style.visibility);
        btn.style.visibility = "hidden";
      });

      const dashboard =
        container.querySelector<HTMLButtonElement>("#hub-tab-dashboard")!;
      // KeyDown on a tab when all tabs are hidden — should not throw.
      expect(() =>
        fireEvent.keyDown(dashboard, { key: "ArrowRight" }),
      ).not.toThrow();

      // Restore styles.
      allTabButtons.forEach((btn, i) => {
        btn.style.visibility = originalStyles[i] ?? "";
      });
    });

    it("action tab (Увійти) does not receive keyboard navigation handler", () => {
      const onShowAuth = vi.fn();
      renderNav({ onShowAuth });
      const signIn = screen.getByRole("button", { name: /Увійти/ });
      // Firing a keyboard event on the action tab should not throw and
      // should NOT call onShowAuth (keyboard handler is not attached to action tabs).
      expect(() =>
        fireEvent.keyDown(signIn, { key: "ArrowRight" }),
      ).not.toThrow();
      expect(onShowAuth).not.toHaveBeenCalled();
    });
  });

  // ─── On-screen keyboard hide (spec keyboard-and-scroll.md § design decision 2) ───

  describe("on-screen keyboard hide", () => {
    afterEach(() => {
      resetVisualKeyboardInsetAdapter();
    });

    it("slides out of view and drops every tab out of the tab order while the keyboard is open", () => {
      setVisualKeyboardInsetAdapter((active) => (active ? 320 : 0));
      renderNav({});

      // `aria-hidden` removes the subtree from the accessibility tree —
      // `{ hidden: true }` opts back in to assert on the DOM state; the
      // accessible *name* also zeroes out on an aria-hidden element, so
      // this drops the `name` filter (only one `<nav>` renders here).
      const nav = screen.getByRole("navigation", { hidden: true });
      expect(nav).toHaveAttribute("aria-label", messages.nav.hubSections);
      expect(nav).toHaveAttribute("aria-hidden", "true");
      expect(nav.className).toContain("translate-y-full");
      expect(
        screen.getByRole("tab", { name: /Головна/, hidden: true }),
      ).toHaveAttribute("tabindex", "-1");
    });

    it("stays visible and reachable when the keyboard is closed", () => {
      setVisualKeyboardInsetAdapter(() => 0);
      renderNav({});

      const nav = screen.getByRole("navigation", {
        name: messages.nav.hubSections,
      });
      expect(nav).not.toHaveAttribute("aria-hidden");
      expect(nav.className).not.toContain("translate-y-full");
      expect(screen.getByRole("tab", { name: /Головна/ })).toHaveAttribute(
        "tabindex",
        "0",
      );
    });
  });

  describe("видимий підпис «Налаштування» (R1)", () => {
    /**
     * Видимий текст таба = весь його текст МІНУС `sr-only`-дубль.
     *
     * AI-NOTE: `getByText("Головна")` тут не працює — підпис лежить у
     * ДВОХ вузлах (видимий span + `sr-only` з доступною назвою), тож
     * запит падає на «found multiple elements». Саме через цю двоїстість і
     * потрібен окремий хелпер: без нього легко написати тест, що читає
     * `sr-only` і мовчки проходить, хоч видимий підпис зламано.
     */
    const visibleTextOf = (tab: HTMLElement): string => {
      const srOnly = tab.querySelector(".sr-only")?.textContent ?? "";
      return (tab.textContent ?? "").replace(srOnly, "").trim();
    };

    // AI-DANGER: ці два очікування — пара, і саме пара є суттю правки.
    // Видимий підпис скорочено до «Опції», бо «Налаштування» не влазило в
    // свою колонку на ≤375px; доступна назва мусить лишитись повною. Тест,
    // що перевіряє лише одне з двох, пропустить рівно ту помилку, якої тут
    // бояться: зведення `label` і `visibleLabel` в одне поле.
    it("рендерить «Опції», а доступна назва лишається повною", () => {
      renderNav({ hubView: "settings" });

      const settings = screen.getByRole("tab", { name: /Налаштування/ });
      expect(settings.querySelector(".sr-only")?.textContent).toBe(
        "Налаштування",
      );
      expect(visibleTextOf(settings)).toBe("Опції");
    });

    it("сусідні таби підписів не міняли", () => {
      renderNav({ hubView: "dashboard" });

      // Скорочення торкається ОДНОГО таба. Якби хтось скоротив і решту,
      // цей рядок це зловить — а `getByRole` по доступній назві ні, бо
      // вона й далі повна в усіх.
      expect(visibleTextOf(screen.getByRole("tab", { name: /Головна/ }))).toBe(
        "Головна",
      );
    });
  });
});
