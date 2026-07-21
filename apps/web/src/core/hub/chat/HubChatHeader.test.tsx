/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { HubChatHeader, type HubChatHeaderProps } from "./HubChatHeader";

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@shared/components/ui/Popover", () => ({
  Popover: ({
    open,
    onOpenChange,
    trigger,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <button
        type="button"
        aria-label="toggle-details"
        onClick={() => onOpenChange(!open)}
      >
        {trigger}
      </button>
      {open && <div role="menu">{children}</div>}
    </div>
  ),
  PopoverDivider: () => <hr />,
  PopoverItem: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

function makeProps(overrides: Partial<HubChatHeaderProps> = {}) {
  return {
    detailsOpen: false,
    onDetailsOpenChange: vi.fn(),
    contextState: { status: "ready", ts: 1 },
    hasData: true,
    sessionInfo: { historyCount: 4, chars: 1234 },
    sessionsCount: 3,
    onOpenHistory: vi.fn(),
    onClearChat: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  } satisfies HubChatHeaderProps;
}

describe("HubChatHeader", () => {
  afterEach(() => cleanup());

  it("renders the assistant trigger and toggles the details popover", () => {
    const props = makeProps();
    render(<HubChatHeader {...props} />);

    expect(screen.getByText("Асистент")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "toggle-details" }));

    expect(props.onDetailsOpenChange).toHaveBeenCalledWith(true);
  });

  it("shows ready context details and opens chat history from the popover", () => {
    const props = makeProps({ detailsOpen: true });
    render(<HubChatHeader {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("Контекст готовий");
    expect(screen.getByText(/4 з останніх 10 повідомлень/)).toBeInTheDocument();
    expect(screen.getByText(/~1.2k символів/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Усі бесіди (3)" }));

    expect(props.onDetailsOpenChange).toHaveBeenCalledWith(false);
    expect(props.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("surfaces building/no-data states and secondary header actions", () => {
    const props = makeProps({
      detailsOpen: true,
      contextState: { status: "building", ts: 2 },
      hasData: false,
    });
    render(<HubChatHeader {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("Готую контекст…");
    expect(screen.getByText(/Mono не підключено/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Нова бесіда" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрити асистента" }));

    expect(props.onClearChat).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the waiting status when context is neither ready nor building", () => {
    render(
      <HubChatHeader
        {...makeProps({
          detailsOpen: true,
          contextState: { status: "idle", ts: 3 },
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Очікую");
  });
});
