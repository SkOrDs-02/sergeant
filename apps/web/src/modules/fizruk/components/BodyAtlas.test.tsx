// @vitest-environment jsdom
/**
 * BodyAtlas a11y tests — audit-06 F2
 *
 * Covers:
 *  - Toggle buttons have aria-pressed and update it correctly.
 *  - Every selectable muscle in the current view is keyboard-focusable
 *    (present in the DOM with role="button" / as a <button>).
 *  - Enter and Space activate muscle selection (updates selected state).
 *  - aria-labels include both the muscle name and its recovery status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BodyAtlas } from "./BodyAtlas";

// body-highlighter calls document.createElementNS and appends DOM nodes.
// In jsdom that works without issues but we mock the module to avoid
// triggering the real imperative SVG build (which is unrelated to these tests).
vi.mock("body-highlighter", () => ({
  default: vi.fn(() => ({
    destroy: vi.fn(),
  })),
}));

const STATUS_BY_MUSCLE = {
  chest: "red",
  biceps: "yellow",
  abs: "green",
  quadriceps: "red",
} as const;

function renderAtlas(
  statusByMuscle: Record<string, string> = STATUS_BY_MUSCLE,
) {
  return render(<BodyAtlas statusByMuscle={statusByMuscle} height={320} />);
}

beforeEach(cleanup);

describe("BodyAtlas · toggle buttons", () => {
  it("renders both toggle buttons with aria-pressed", () => {
    renderAtlas();

    const anteriorBtn = screen.getByRole("button", {
      name: /вигляд спереду/i,
    });
    const posteriorBtn = screen.getByRole("button", {
      name: /вигляд ззаду/i,
    });

    expect(anteriorBtn).toBeInTheDocument();
    expect(posteriorBtn).toBeInTheDocument();
  });

  it("anterior toggle starts as aria-pressed=true, posterior as false", () => {
    renderAtlas();

    const anteriorBtn = screen.getByRole("button", {
      name: /вигляд спереду/i,
    });
    const posteriorBtn = screen.getByRole("button", {
      name: /вигляд ззаду/i,
    });

    expect(anteriorBtn).toHaveAttribute("aria-pressed", "true");
    expect(posteriorBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking posterior sets posterior aria-pressed=true and anterior to false", () => {
    renderAtlas();

    const posteriorBtn = screen.getByRole("button", {
      name: /вигляд ззаду/i,
    });
    fireEvent.click(posteriorBtn);

    expect(posteriorBtn).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /вигляд спереду/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking anterior after posterior resets aria-pressed correctly", () => {
    renderAtlas();

    fireEvent.click(screen.getByRole("button", { name: /вигляд ззаду/i }));
    fireEvent.click(screen.getByRole("button", { name: /вигляд спереду/i }));

    expect(
      screen.getByRole("button", { name: /вигляд спереду/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /вигляд ззаду/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("BodyAtlas · keyboard-accessible muscle list (anterior view)", () => {
  it("renders sr-only muscle buttons for anterior muscles", () => {
    renderAtlas();

    // Chest is an anterior muscle — must be present in the DOM with an
    // aria-label that contains the Ukrainian name.
    const chestBtn = screen.getByRole("button", { name: /грудні/i });
    expect(chestBtn).toBeInTheDocument();
  });

  it("muscle buttons include recovery status in aria-label", () => {
    renderAtlas();

    // chest = "red" → status label = "уникати"
    const chestBtn = screen.getByRole("button", {
      name: /грудні.*уникати/i,
    });
    expect(chestBtn).toBeInTheDocument();

    // biceps = "yellow" → "відновлюється"
    const bicepsBtn = screen.getByRole("button", {
      name: /біцепс.*відновлюється/i,
    });
    expect(bicepsBtn).toBeInTheDocument();

    // abs = "green" → "готовий"
    const absBtn = screen.getByRole("button", { name: /прес.*готовий/i });
    expect(absBtn).toBeInTheDocument();
  });

  it("Enter key activates muscle selection", () => {
    renderAtlas();

    const chestBtn = screen.getByRole("button", { name: /грудні.*уникати/i });
    fireEvent.keyDown(chestBtn, { key: "Enter" });

    // After selection the "Обрано:" readout should appear with the muscle key.
    expect(screen.getByText(/Обрано:/)).toBeInTheDocument();
    expect(screen.getByText("chest")).toBeInTheDocument();
  });

  it("Space key activates muscle selection", () => {
    renderAtlas();

    const absBtn = screen.getByRole("button", { name: /прес.*готовий/i });
    fireEvent.keyDown(absBtn, { key: " " });

    expect(screen.getByText(/Обрано:/)).toBeInTheDocument();
    expect(screen.getByText("abs")).toBeInTheDocument();
  });

  it("click on muscle button activates selection", () => {
    renderAtlas();

    const quadBtn = screen.getByRole("button", {
      name: /квадрицепс.*уникати/i,
    });
    fireEvent.click(quadBtn);

    expect(screen.getByText(/Обрано:/)).toBeInTheDocument();
    expect(screen.getByText("quadriceps")).toBeInTheDocument();
  });

  it("selected muscle gets aria-pressed=true", () => {
    renderAtlas();

    const chestBtn = screen.getByRole("button", { name: /грудні.*уникати/i });
    expect(chestBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chestBtn);
    expect(chestBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("only one muscle has aria-pressed=true after selection", () => {
    renderAtlas();

    const chestBtn = screen.getByRole("button", { name: /грудні.*уникати/i });
    const bicepsBtn = screen.getByRole("button", {
      name: /біцепс.*відновлюється/i,
    });

    fireEvent.click(chestBtn);
    expect(chestBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(bicepsBtn);
    expect(bicepsBtn).toHaveAttribute("aria-pressed", "true");
    expect(chestBtn).toHaveAttribute("aria-pressed", "false");
  });
});

describe("BodyAtlas · posterior view muscle list", () => {
  it("shows posterior-specific muscles after switching view", () => {
    renderAtlas();

    fireEvent.click(screen.getByRole("button", { name: /вигляд ззаду/i }));

    // "upper-back" is a posterior muscle — should appear after switching.
    expect(
      screen.getByRole("button", { name: /верхня спина/i }),
    ).toBeInTheDocument();

    // "chest" is anterior-only — should NOT appear in posterior list.
    expect(
      screen.queryByRole("button", { name: /грудні/i }),
    ).not.toBeInTheDocument();
  });

  it("gluteal muscle appears in posterior view", () => {
    renderAtlas();

    fireEvent.click(screen.getByRole("button", { name: /вигляд ззаду/i }));

    expect(
      screen.getByRole("button", { name: /сідниці/i }),
    ).toBeInTheDocument();
  });
});

describe("BodyAtlas · muscle map container", () => {
  it("muscle map container has aria-label attribute", () => {
    renderAtlas();

    // The wrapping div around the SVG and sr-only list should carry
    // aria-label="Карта м'язів". A plain div does not get a landmark
    // role, so we query the DOM directly.
    const mapCard = document.querySelector('[aria-label="Карта м\'язів"]');
    expect(mapCard).not.toBeNull();
  });

  it("sr-only list has its own aria-label", () => {
    renderAtlas();

    const list = document.querySelector('[aria-label="Список м\'язів"]');
    expect(list).not.toBeNull();
  });

  it("visual SVG container is aria-hidden", () => {
    renderAtlas();

    // The inner div wrapping the body-highlighter SVG must be aria-hidden
    // so AT skips the SVG polygons in favour of the sr-only list.
    const hiddenDivs = document.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenDivs.length).toBeGreaterThan(0);
  });
});
