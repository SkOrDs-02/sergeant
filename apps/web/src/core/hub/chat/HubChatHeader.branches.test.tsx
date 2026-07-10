/** @vitest-environment jsdom */
/**
 * Branch coverage for HubChatHeader — context status dots, Mono warning,
 * history popover item, and primary actions.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { HubChatHeader } from "./HubChatHeader";

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@shared/components/ui/Popover", () => ({
  Popover: ({
    trigger,
    children,
    open,
    onOpenChange,
  }: {
    trigger: React.ReactNode;
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div>
      <div
        data-testid="popover-trigger"
        onClick={() => onOpenChange(!open)}
        onKeyDown={() => {}}
        role="button"
        tabIndex={0}
      >
        {trigger}
      </div>
      {open ? <div data-testid="popover-panel">{children}</div> : null}
    </div>
  ),
  PopoverDivider: () => <hr />,
  PopoverItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

function renderHeader(
  overrides: Partial<Parameters<typeof HubChatHeader>[0]> = {},
) {
  const onDetailsOpenChange = vi.fn();
  const onOpenHistory = vi.fn();
  const onClearChat = vi.fn();
  const onClose = vi.fn();
  const props = {
    detailsOpen: false,
    onDetailsOpenChange,
    contextState: { status: "ready", ts: Date.now() },
    hasData: true,
    sessionInfo: { historyCount: 3, chars: 1200 },
    sessionsCount: 2,
    onOpenHistory,
    onClearChat,
    onClose,
    ...overrides,
  };
  render(<HubChatHeader {...props} />);
  return { onDetailsOpenChange, onOpenHistory, onClearChat, onClose };
}

describe("HubChatHeader", () => {
  afterEach(() => cleanup());

  it("shows building status copy when context is still assembling", () => {
    renderHeader({
      detailsOpen: true,
      contextState: { status: "building", ts: Date.now() },
    });
    expect(screen.getByText("Готую контекст…")).toBeInTheDocument();
  });

  it("warns when Mono data is missing", () => {
    renderHeader({ detailsOpen: true, hasData: false });
    expect(screen.getByText(/Mono не підключено/i)).toBeInTheDocument();
  });

  it("opens history from the details popover and closes details first", () => {
    const { onDetailsOpenChange, onOpenHistory } = renderHeader({
      detailsOpen: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /Усі бесіди/i }));
    expect(onDetailsOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenHistory).toHaveBeenCalled();
  });

  it("starts a new chat and closes the overlay from header actions", () => {
    const { onClearChat, onClose } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /Нова бесіда/i }));
    expect(onClearChat).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Закрити асистента/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders session context stats inside the details panel", () => {
    renderHeader({ detailsOpen: true });
    const panel = screen.getByTestId("popover-panel");
    expect(
      within(panel).getByText(/3 з останніх 10 повідомлень/i),
    ).toBeInTheDocument();
  });
});
