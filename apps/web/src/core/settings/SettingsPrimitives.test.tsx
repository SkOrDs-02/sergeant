// @vitest-environment jsdom
//
// PR-A v2-polish-redesign — SettingsPrimitives icon prop + glass surface.
// Covers: SettingsGroup renders the design-system <Icon>; module badge applies
// the correct scoped surface class.
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  SettingsGroup,
  SettingsGroupDefaultOpenContext,
  SettingsSubGroup,
  ToggleRow,
  SectionSkeleton,
} from "./SettingsPrimitives";

// Icon is a thin wrapper; stub it so tests don't need an SVG sprite.
vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name, size }: { name: string; size?: number }) => (
    <span data-testid="icon" data-name={name} data-size={size} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingsGroup — icon prop", () => {
  it("renders an <Icon> when `icon` is provided", () => {
    render(
      <SettingsGroup title="Профіль" icon="user">
        <div>child</div>
      </SettingsGroup>,
    );

    const icons = screen.getAllByTestId("icon");
    // First icon belongs to the icon badge; second is the ChevronIcon.
    const badgeIcon = icons.find((el) => el.dataset["name"] === "user");
    expect(badgeIcon).toBeTruthy();
    expect(badgeIcon?.dataset["size"]).toBe("18");
  });

  it("applies module soft-surface class on the icon badge span", () => {
    render(
      <SettingsGroup title="Фінанси" icon="wallet" module="finyk">
        <div>child</div>
      </SettingsGroup>,
    );

    // The badge span wrapping the Icon should carry the finyk soft bg class.
    const badge = document.querySelector("span.bg-finyk-soft");
    expect(badge).toBeTruthy();
  });

  it("uses neutral surface class when no module is given", () => {
    render(
      <SettingsGroup title="Загальне" icon="settings">
        <div>child</div>
      </SettingsGroup>,
    );

    const badge = document.querySelector("span.bg-surface-soft-glass");
    expect(badge).toBeTruthy();
  });

  it("expands children on button click", () => {
    render(
      <SettingsGroup title="Тест" icon="info">
        <p>прихований контент</p>
      </SettingsGroup>,
    );

    const btn = screen.getByRole("button", { name: /Тест/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  // L-7 parity (адверсарне ревʼю 2026-08-08, знахідка №4): CollapsibleSection
  // закрив tab-trap для свого акордеона через `inert`, але SettingsGroup зі
  // спільним `grid-rows-[0fr] overflow-hidden`-патерном лишався непокритим —
  // Tab від згорнутого заголовка провалювався у приховані контроли.
  //
  // Round-trip в одному тесті: перевірка "після кліку inert знято" сама по
  // собі нічого не доводить, якщо inert ніколи не виставлявся взагалі —
  // ловимо регресію, лише зафіксувавши "виставлено" ДО кліку.
  it("ставить inert+aria-hidden на вміст, коли група монтується згорнутою (default), і знімає обидва при розгортанні", () => {
    render(
      <SettingsGroup title="Дашборд" icon="layout">
        <button type="button">Приховане поле</button>
      </SettingsGroup>,
    );
    const btn = screen.getByRole("button", { name: /Дашборд/ });
    // Дефект №5 (адверсарне ревʼю 2026-08-08): кнопка тепер живе всередині
    // `<h2 className="contents">`, тож `btn.nextElementSibling` — вже не
    // контент-панель (у h2 кнопка єдина дитина), а `btn.parentElement`
    // (`<h2>`)'s наступний сиблінг лишається тим самим контент-`<div>`.
    const content = btn.parentElement?.nextElementSibling ?? null;
    expect(content).not.toBeNull();
    expect(content).toHaveAttribute("inert");
    expect(content).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(btn);
    expect(content).not.toHaveAttribute("inert");
    expect(content).not.toHaveAttribute("aria-hidden");
  });

  it("не ставить inert/aria-hidden, коли група монтується розгорнутою, і ставить обидва при згортанні", () => {
    render(
      <SettingsGroup title="Профіль" icon="user" defaultOpen>
        <button type="button">Видиме поле</button>
      </SettingsGroup>,
    );
    const btn = screen.getByRole("button", { name: /Профіль/ });
    const content = btn.parentElement?.nextElementSibling ?? null;
    expect(content).not.toBeNull();
    expect(content).not.toHaveAttribute("inert");
    expect(content).not.toHaveAttribute("aria-hidden");

    fireEvent.click(btn);
    expect(content).toHaveAttribute("inert");
    expect(content).toHaveAttribute("aria-hidden", "true");
  });
});

// Варіант A (profile/settings deep audit 2026-08-08, рішення власника №4 —
// `docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md` §0.1):
// `SettingsSubGroup` більше не другий рівень акордеона — немає кнопки,
// `aria-expanded`, стану розкриття чи `inert`-логіки. Це підписана група:
// заголовок + завжди видимий вміст.
describe("SettingsSubGroup", () => {
  it("рендерить заголовок як текст (не кнопку) і одразу показує вміст без взаємодії", () => {
    render(
      <SettingsSubGroup title="Деталі">
        <p>вміст</p>
      </SettingsSubGroup>,
    );

    // Немає кнопки-тригера другого рівня взагалі — весь вміст видимий одразу.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("вміст")).toBeInTheDocument();
    const heading = screen.getByText("Деталі");
    expect(heading.tagName).toBe("H3");
  });

  it("не ставить inert/aria-hidden на вміст — на відміну від SettingsGroup, підгрупа ніколи не згорнута", () => {
    render(
      <SettingsSubGroup title="Розділи на головній">
        <button type="button">Кнопка всередині</button>
      </SettingsSubGroup>,
    );

    const innerButton = screen.getByRole("button", {
      name: "Кнопка всередині",
    });
    expect(innerButton).toBeInTheDocument();
    expect(innerButton.closest("[inert]")).toBeNull();
    expect(innerButton.closest('[aria-hidden="true"]')).toBeNull();
  });
});

describe("SettingsGroupDefaultOpenContext", () => {
  it("тримає значення true за замовчуванням у SettingsGroup, коли провайдер задає defaultOpen: true", () => {
    render(
      <SettingsGroupDefaultOpenContext.Provider value={{ defaultOpen: true }}>
        <SettingsGroup title="Перша секція" icon="compass">
          <p>вміст першої секції</p>
        </SettingsGroup>
      </SettingsGroupDefaultOpenContext.Provider>,
    );

    const btn = screen.getByRole("button", { name: /Перша секція/ });
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("не впливає на SettingsGroup, змонтовану без провайдера (дефолт контексту — { defaultOpen: false })", () => {
    render(
      <SettingsGroup title="Секція без провайдера" icon="compass">
        <p>вміст</p>
      </SettingsGroup>,
    );

    const btn = screen.getByRole("button", {
      name: /Секція без провайдера/,
    });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  // Дефект №3 (адверсарне ревʼю 2026-08-08): без цього зворотного виклику
  // власник контексту (`HubSettingsPage`) не мав способу дізнатись, що
  // юзер сам, явно, згорнув чи розгорнув секцію — і тому не міг
  // запамʼятати цей вибір і зберегти його між ремаунтами (перемикання
  // вкладки, search). Перевіряємо саме межу SettingsGroup↔контекст, не
  // повну персистентність (та — на рівні HubSettingsPage.test.tsx).
  it("викликає onUserToggle з новим станом open щоразу, коли юзер сам клікає заголовок", () => {
    const onUserToggle = vi.fn();
    render(
      <SettingsGroupDefaultOpenContext.Provider
        value={{ defaultOpen: false, onUserToggle }}
      >
        <SettingsGroup title="Секція" icon="compass">
          <p>вміст</p>
        </SettingsGroup>
      </SettingsGroupDefaultOpenContext.Provider>,
    );

    const btn = screen.getByRole("button", { name: /Секція/ });
    expect(onUserToggle).not.toHaveBeenCalled();

    fireEvent.click(btn);
    expect(onUserToggle).toHaveBeenLastCalledWith(true);

    fireEvent.click(btn);
    expect(onUserToggle).toHaveBeenLastCalledWith(false);
    expect(onUserToggle).toHaveBeenCalledTimes(2);
  });

  // CodeRabbit-ревʼю PR #757: раніше `onUserToggle` викликався ВСЕРЕДИНІ
  // функціонального апдейтера `setOpen`, а updater мусить лишатись
  // ЧИСТИМ — React 18 (незалежно від dev/prod) інколи обчислює апдейтер
  // "eager" — одразу в обробнику диспатчу, щоб перевірити, чи справді
  // змінюється стан, а потім ЩЕ РАЗ під час самого рендеру. Емпірично це
  // не проявляється на першому кліку по щойно змонтованому компоненту
  // (React ще не має "eager"-шляху для першого dispatch на fiber-і), але
  // проявляється на ДРУГОМУ й наступних — тому тест клікає двічі:
  // перевіряємо, що юзер, який клікнув двічі, бачить РІВНО два виклики,
  // а не три через побічний ефект, що подвоївся всередині апдейтера.
  // Сьогоднішній `HubSettingsPage` цього не бачить лише тому, що його
  // `setSectionOpenOverrides` ідемпотентний (той самий `next` двічі —
  // той самий підсумковий стан), але будь-який лічильник тапів чи
  // аналітична подія на цьому колбеку задвоїлась би.
  it("викликає onUserToggle рівно один раз на кожен клік, а не більше через побічний ефект усередині апдейтера setOpen (CodeRabbit PR #757)", () => {
    const onUserToggle = vi.fn();
    render(
      <StrictMode>
        <SettingsGroupDefaultOpenContext.Provider
          value={{ defaultOpen: false, onUserToggle }}
        >
          <SettingsGroup title="Секція" icon="compass">
            <p>вміст</p>
          </SettingsGroup>
        </SettingsGroupDefaultOpenContext.Provider>
      </StrictMode>,
    );

    const btn = screen.getByRole("button", { name: /Секція/ });
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(onUserToggle).toHaveBeenCalledTimes(2);
    expect(onUserToggle).toHaveBeenNthCalledWith(1, true);
    expect(onUserToggle).toHaveBeenNthCalledWith(2, false);
  });

  // Дефект №5 (адверсарне ревʼю 2026-08-08): найближчий заголовок вище на
  // сторінці Налаштувань — sr-only `<h1>`; заголовок секції малювався як
  // голий `<span>` усередині кнопки (не заголовок узагалі), тож аутлайн
  // стрибав h1 → h3 (заголовок SettingsSubGroup) і axe `heading-order` це
  // ловив. Канонічний disclosure-патерн — `<h2><button aria-expanded>…`.
  it("рендерить заголовок секції як h2>button, а не голий span (дефект №5, axe heading-order)", () => {
    render(
      <SettingsGroup title="Дашборд" icon="layout">
        <p>вміст</p>
      </SettingsGroup>,
    );

    const btn = screen.getByRole("button", { name: /Дашборд/ });
    const heading = btn.closest("h2");
    expect(heading).not.toBeNull();
    expect(heading?.tagName).toBe("H2");
  });
});

describe("ToggleRow", () => {
  it("calls onChange when the label is clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow label="Сповіщення" checked={false} onChange={onChange} />,
    );

    // Switch renders an input[type=checkbox] inside the label.
    const input = document.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("Switch input not found");
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalled();
  });

  // Регресія на `[critical] label: Form elements must have labels` — axe
  // ловив це на `/settings` у всіх трьох темах. Причина: рядок сам є
  // `label` і обгортає `Switch`, який малює власний `label htmlFor`;
  // вкладені `label` невалідні за контент-моделлю HTML, внутрішній
  // explicit-label перемагає, і Chrome не давав інпуту доступного імені
  // взагалі. Лікується явним `aria-labelledby` на підпис рядка.
  //
  // Запит `getByRole(..., { name })` резолвиться тим самим accname-
  // алгоритмом, що й axe, тож перевіряє рівно те, що падало в гейті.
  it("gives the switch an accessible name from the row label", () => {
    render(<ToggleRow label="Сповіщення" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Сповіщення" })).toBeTruthy();
  });

  it("toggles when the visible label text is clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow label="Сповіщення" checked={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText("Сповіщення"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("SectionSkeleton — Suspense fallback (0017 Sprint 1.1)", () => {
  it("renders with default minHeight 72px and aria-busy", () => {
    render(<SectionSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.style.minHeight).toBe("72px");
  });

  it("honours a custom minH for tall sections that should not cause CLS", () => {
    render(<SectionSkeleton minH={240} />);
    const status = screen.getByRole("status");
    expect(status.style.minHeight).toBe("240px");
  });

  it("uses the default localized aria-label when none provided", () => {
    render(<SectionSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("Завантажую розділ");
  });

  it("uses a caller-provided aria-label when given (e.g. section-specific copy)", () => {
    render(<SectionSkeleton ariaLabel="Завантажую розділ Finyk" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("Завантажую розділ Finyk");
  });
});
