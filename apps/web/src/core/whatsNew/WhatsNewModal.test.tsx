/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WhatsNewModal } from "./WhatsNewModal";
import type { WhatsNewRelease } from "./releases";

const baseRelease: WhatsNewRelease = {
  id: "2026-05-06-cold-start",
  date: "2026-05-06",
  title: "Test release",
  summary: "Test summary text",
  items: [
    { kind: "feature", text: "Шукана нова фіча" },
    { kind: "fix", text: "Виправлений баг" },
    { kind: "improvement", text: "Покращення UX" },
  ],
  cta: {
    label: "Спробувати",
    href: "https://example.com/path",
  },
};

function renderModal(
  overrides: Partial<Parameters<typeof WhatsNewModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onCtaClick = vi.fn();
  const utils = render(
    <MemoryRouter>
      <WhatsNewModal
        open={true}
        release={baseRelease}
        onClose={onClose}
        onCtaClick={onCtaClick}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { onClose, onCtaClick, ...utils };
}

describe("<WhatsNewModal />", () => {
  it("renders title, summary and item rows", () => {
    renderModal();
    expect(screen.getByText("Test release")).toBeInTheDocument();
    expect(screen.getByText("Test summary text")).toBeInTheDocument();
    expect(screen.getByText("Шукана нова фіча")).toBeInTheDocument();
    expect(screen.getByText("Виправлений баг")).toBeInTheDocument();
    expect(screen.getByText("Покращення UX")).toBeInTheDocument();
  });

  it("returns null when release is missing", () => {
    const { container } = renderModal({ release: null });
    expect(container.firstChild).toBeNull();
  });

  it("calls onCtaClick + opens external href in new tab when CTA pressed", () => {
    const open = vi.fn();
    const orig = window.open;
    window.open = open;
    const { onCtaClick } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Спробувати" }));
    expect(onCtaClick).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "https://example.com/path",
      "_blank",
      "noopener,noreferrer",
    );
    window.open = orig;
  });

  it("calls onClose('close') when dismiss button is pressed", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    expect(onClose).toHaveBeenCalledWith("close");
  });

  it("renders only the dismiss button when no CTA is present", () => {
    const { onCtaClick } = renderModal({
      release: { ...baseRelease, cta: undefined },
    });
    expect(screen.queryByRole("button", { name: "Спробувати" })).toBeNull();
    expect(onCtaClick).not.toHaveBeenCalled();
  });
});
