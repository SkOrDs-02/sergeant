/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CrossModuleLinkCard } from "./CrossModuleLinkCard";
import { MIN_N, REPEATING_N, STABLE_N } from "./crossModuleLinkTiers";

const poleA = {
  module: "fizruk" as const,
  label: "Фізрук",
  value: "3+",
  unit: "тренування / тиждень",
};
const poleB = {
  module: "finyk" as const,
  label: "Фінік",
  value: "−18%",
  unit: "витрат на доставку",
};

describe("CrossModuleLinkCard — напрямок зв'язку", () => {
  afterEach(cleanup);

  // `phrase` — єдине місце в картці, де видно НАПРЯМОК: товщина містка
  // несе впевненість, а знак `strength` сам по собі невидимий. Без цих
  // тестів r=+0.74 і r=−0.74 знову могли б виглядати однаково.
  it("показує формулювання над словом ступеня", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={STABLE_N}
        strength={-0.74}
        phrase="У дні тренувань ти витрачаєш менше"
      />,
    );

    const phrase = screen.getByText("У дні тренувань ти витрачаєш менше");
    const tier = screen.getByText("Тримається стабільно");
    expect(phrase).toBeInTheDocument();
    // Порядок у DOM: спершу що саме збігається, потім наскільки впевнено.
    expect(
      phrase.compareDocumentPosition(tier) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("без формулювання мовчить про напрямок, а не вигадує його", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={STABLE_N}
        strength={-0.74}
      />,
    );

    expect(screen.getByText("Тримається стабільно")).toBeInTheDocument();
    expect(screen.queryByText(/витрачаєш/)).toBeNull();
  });
});

describe("CrossModuleLinkCard — перевірка доказів", () => {
  afterEach(cleanup);

  const days = [
    { key: "2026-08-03", valueA: "1,5", valueB: "380" },
    { key: "2026-08-02", valueA: "1,0", valueB: "520" },
  ];

  it("дні сховані, поки не попросили, і показуються після тапу", async () => {
    const user = userEvent.setup();
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={STABLE_N}
        strength={0.62}
        days={days}
      />,
    );

    expect(screen.queryByText("3 серп.")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Показати ці дні" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    expect(screen.getByText("3 серп.")).toBeInTheDocument();
    expect(screen.getByText("2 серп.")).toBeInTheDocument();
    expect(screen.getByText("380")).toBeInTheDocument();
    // Підпис пояснює, чому днів саме стільки, а не 60.
    expect(
      screen.getByText("Дні, коли ти записав і те, і те"),
    ).toBeInTheDocument();
  });

  it("без днів кнопки немає — нема чого розгортати", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={STABLE_N}
        strength={0.62}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Показати ці дні/ }),
    ).toBeNull();
  });
});

describe("CrossModuleLinkCard — три ступені градації", () => {
  afterEach(cleanup);

  it("tier 1 — «поки що збіг» щойно за порогом мовчання", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={MIN_N}
        strength={0.4}
        weeks={2}
      />,
    );

    expect(screen.getByText("Поки що збіг")).toBeInTheDocument();
    expect(screen.getByText("2 тижні · 5 спостережень")).toBeInTheDocument();
    // Обидва полюси видно з їхнім значенням і одиницею.
    expect(screen.getByText("Фізрук")).toBeInTheDocument();
    expect(screen.getByText("3+")).toBeInTheDocument();
    expect(screen.getByText("Фінік")).toBeInTheDocument();
    expect(screen.getByText("−18%")).toBeInTheDocument();
  });

  it("tier 2 — «повторюється» за 2x поріг, ще не пів вікна і не сильна кореляція", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={REPEATING_N}
        strength={0.5}
      />,
    );

    expect(screen.getByText("Повторюється")).toBeInTheDocument();
    // Без переданого `weeks` метадані обмежуються спостереженнями — право
    // мовчати діє і на похідні цифри, не лише на show/hide.
    expect(screen.getByText("10 спостережень")).toBeInTheDocument();
  });

  it("tier 3 — «тримається стабільно», коли покрито половину вікна аналізу", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={STABLE_N}
        strength={0.42}
        weeks={9}
      />,
    );

    expect(screen.getByText("Тримається стабільно")).toBeInTheDocument();
    expect(
      screen.getByText("9 тижнів поспіль · 30 спостережень"),
    ).toBeInTheDocument();
  });

  it("tier 3 — сильна кореляція (|r|≥0.7) досягає стабільного ступеня і без великого n", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={REPEATING_N}
        strength={-0.7}
      />,
    );

    expect(screen.getByText("Тримається стабільно")).toBeInTheDocument();
  });
});

describe("CrossModuleLinkCard — право мовчати (порожній стан)", () => {
  afterEach(cleanup);

  it("рендерить гідний порожній стан, а не порожній список, коли n < MIN_N", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={2}
        strength={0.9}
      />,
    );

    expect(screen.getByText("Поки що зв'язків не бачу")).toBeInTheDocument();
    expect(screen.getByText(/2 з 5 спостережень/)).toBeInTheDocument();
    // Полюси лишаються — контекст «що саме перевіряємо» не зникає, лише
    // конкретні значення/одиниці мовчать.
    expect(screen.getByText("Фізрук")).toBeInTheDocument();
    expect(screen.getByText("Фінік")).toBeInTheDocument();
    // Але сама тіла картки не стверджує ступінь впевненості.
    expect(screen.queryByText("Поки що збіг")).toBeNull();
    expect(screen.queryByText("Повторюється")).toBeNull();
    expect(screen.queryByText("Тримається стабільно")).toBeNull();
  });

  it("залишається мовчазним, коли спостережень достатньо, але зв'язку не видно (|r| < NOTABLE_R)", () => {
    render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={40}
        strength={0.1}
      />,
    );

    expect(screen.getByText("Поки що зв'язків не бачу")).toBeInTheDocument();
    // Прогрес-бар не бреше: спостережень уже достатньо (5 з 5), проблема
    // не в кількості даних, а у відсутності самого зв'язку.
    expect(screen.getByText("5 з 5 спостережень")).toBeInTheDocument();
  });

  it("не показує доказову смугу чи місток у порожньому стані", () => {
    const { container } = render(
      <CrossModuleLinkCard
        poleA={poleA}
        poleB={poleB}
        observations={1}
        strength={0}
      />,
    );

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });
});
