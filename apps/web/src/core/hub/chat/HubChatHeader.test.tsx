/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    sessionInfo: { historyCount: 4, chars: 1234 },
    sessionsCount: 3,
    onOpenHistory: vi.fn(),
    onClearChat: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  } satisfies HubChatHeaderProps;
}

function renderHeader(props: HubChatHeaderProps) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HubChatHeader {...props} />
    </QueryClientProvider>,
  );
}

describe("HubChatHeader", () => {
  afterEach(() => cleanup());

  it("renders the assistant trigger and toggles the details popover", () => {
    const props = makeProps();
    renderHeader(props);

    expect(screen.getByText("Асистент")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "toggle-details" }));

    expect(props.onDetailsOpenChange).toHaveBeenCalledWith(true);
  });

  it("shows ready context details and opens chat history from the popover", () => {
    const props = makeProps({ detailsOpen: true });
    renderHeader(props);

    expect(screen.getByRole("status")).toHaveTextContent("Контекст готовий");
    expect(screen.getByText(/4 з останніх 10 повідомлень/)).toBeInTheDocument();
    expect(screen.getByText(/~1.2k символів/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Усі бесіди (3)" }));

    expect(props.onDetailsOpenChange).toHaveBeenCalledWith(false);
    expect(props.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("surfaces the building state and secondary header actions", () => {
    const props = makeProps({
      detailsOpen: true,
      contextState: { status: "building", ts: 2 },
    });
    renderHeader(props);

    expect(screen.getByRole("status")).toHaveTextContent("Готую контекст…");
    // Звіт власника 2026-09-03: попередження про Mono читало LS-кеш, а не
    // підключення, і брехало. Його прибрано разом із пропом `hasData`.
    expect(screen.queryByText(/Mono/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Нова бесіда" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрити асистента" }));

    expect(props.onClearChat).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the waiting status when context is neither ready nor building", () => {
    renderHeader(
      makeProps({
        detailsOpen: true,
        contextState: { status: "idle", ts: 3 },
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Очікую");
  });
  // Regression (browser QA 2026-08-23): на 393px шапка тиснула заголовок до
  // «Ас…» (scrollWidth 85 vs clientWidth 43). jsdom не має layout-у, тож
  // пінимо контракт, який до цього привів: назва не стискається, дефіцит
  // ширини поглинає правий кластер, а кнопки лишаються цілими.
  it("keeps the title unshrinkable so 393px cannot clip it to «Ас…»", () => {
    renderHeader(makeProps());

    const title = screen.getByText("Асистент");
    expect(title.className).toContain("whitespace-nowrap");
    expect(title.className).not.toContain("truncate");
    // Група «назва + шеврон» не віддає ширину.
    expect(title.parentElement!.className).toContain("shrink-0");

    // Праворуч — навпаки: кластер стискається, кнопки ні.
    const newChat = screen.getByRole("button", { name: "Нова бесіда" });
    const closeBtn = screen.getByRole("button", { name: "Закрити асистента" });
    expect(newChat.className).toContain("shrink-0");
    expect(closeBtn.className).toContain("shrink-0");
    const cluster = newChat.parentElement!;
    expect(cluster.className).toContain("min-w-0");
    expect(cluster.className).not.toContain("shrink-0");
  });
});
