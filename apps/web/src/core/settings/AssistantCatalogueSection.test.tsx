/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@shared/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: () => <span />,
}));

import { AssistantCatalogueSection } from "./AssistantCatalogueSection";

describe("AssistantCatalogueSection", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  afterEach(() => cleanup());

  it("navigates to the assistant catalogue route", () => {
    render(
      <MemoryRouter>
        <AssistantCatalogueSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("open-assistant-catalogue"));
    expect(navigateMock).toHaveBeenCalledWith("/assistant");
  });
});
