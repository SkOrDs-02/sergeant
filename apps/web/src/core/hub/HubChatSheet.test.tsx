/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    onClose,
    closeLabel,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    closeLabel: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        <button onClick={onClose} aria-label={closeLabel}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("@shared/components/ui/SuspenseWithMinDelay", () => ({
  SuspenseWithMinDelay: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../app/PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));

vi.mock("../lib/lazyImport", () => ({
  lazyDefault: (
    factory: () => Promise<{ default: React.ComponentType<unknown> }>,
  ) => {
    const Stub = (props: Record<string, unknown>) => (
      <div data-testid="hub-chat-stub" data-props={JSON.stringify(props)}>
        <button
          type="button"
          onClick={() =>
            (props["onOpenCatalogue"] as (() => void) | undefined)?.()
          }
        >
          catalogue
        </button>
      </div>
    );
    Stub.displayName = "LazyHubChat";
    void factory;
    return Stub;
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { HubChatSheet } from "./HubChatSheet";

afterEach(() => cleanup());

function renderSheet(
  overrides: Partial<Parameters<typeof HubChatSheet>[0]> = {},
) {
  const props = {
    onClose: vi.fn(),
    onOpenCatalogue: vi.fn(),
    initialMessage: "",
    autoSendInitial: false,
    preset: undefined,
    ...overrides,
  };
  render(<HubChatSheet {...props} />);
  return props;
}

/**
 * Покриття, що переїхало сюди разом із кодом: аркуш рендериться відкритим,
 * віддає свої дві дії назовні й прокидає префіл у чат. Логіка оверлея
 * (намір повернення з каталогу, ефект маршруту) лишилась у
 * `HubChatOverlay.test.tsx`.
 */
describe("HubChatSheet", () => {
  it("renders the sheet open with HubChat inside", () => {
    renderSheet();
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
    expect(screen.getByTestId("hub-chat-stub")).toBeInTheDocument();
  });

  it("forwards onClose from the sheet chrome", () => {
    const { onClose } = renderSheet();
    act(() => {
      screen.getByRole("button", { name: "Закрити чат" }).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards onOpenCatalogue from the chat composer", () => {
    const { onOpenCatalogue } = renderSheet();
    act(() => {
      screen.getByRole("button", { name: "catalogue" }).click();
    });
    expect(onOpenCatalogue).toHaveBeenCalledTimes(1);
  });

  it("hands the prefill down to HubChat", () => {
    renderSheet({
      initialMessage: "скільки я витратив",
      autoSendInitial: true,
    });
    const props = JSON.parse(
      screen.getByTestId("hub-chat-stub").getAttribute("data-props") ?? "{}",
    ) as { initialMessage?: string; autoSendInitial?: boolean };
    expect(props.initialMessage).toBe("скільки я витратив");
    expect(props.autoSendInitial).toBe(true);
  });
});
