/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubChatHistoryDrawer } from "./HubChatHistoryDrawer";
import type { HubChatSession } from "./hubChatSessions";
import type { ChatMessage } from "../lib/hubChatUtils";

function userMsg(text: string): ChatMessage {
  return { id: `u_${text}`, role: "user", text };
}
function assistantMsg(text: string): ChatMessage {
  return { id: `a_${text}`, role: "assistant", text };
}

function session(over: Partial<HubChatSession> = {}): HubChatSession {
  const now = Date.now();
  return {
    id: over.id ?? "s1",
    title: over.title ?? "Бесіда про каву",
    titleSource: over.titleSource,
    createdAt: over.createdAt ?? now,
    updatedAt: over.updatedAt ?? now,
    messages: over.messages ?? [userMsg("привіт"), assistantMsg("вітаю")],
  };
}

interface Handlers {
  onClose: ReturnType<typeof vi.fn<() => void>>;
  onSelect: ReturnType<typeof vi.fn<(id: string) => void>>;
  onCreate: ReturnType<typeof vi.fn<() => void>>;
  onDelete: ReturnType<typeof vi.fn<(id: string) => void>>;
}

function renderDrawer(
  props: {
    open?: boolean;
    sessions?: HubChatSession[];
    activeId?: string | null;
  } = {},
) {
  const h: Handlers = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
  };
  const view = render(
    <HubChatHistoryDrawer
      open={props.open ?? true}
      sessions={props.sessions ?? []}
      activeId={props.activeId ?? null}
      onClose={h.onClose}
      onSelect={h.onSelect}
      onCreate={h.onCreate}
      onDelete={h.onDelete}
    />,
  );
  return { ...view, handlers: h };
}

describe("HubChatHistoryDrawer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = renderDrawer({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog shell and empty state with no sessions", () => {
    renderDrawer({ open: true, sessions: [] });
    expect(
      screen.getByRole("dialog", { name: "Історія чатів" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Поки немає інших бесід/)).toBeInTheDocument();
  });

  it("sorts sessions newest-first by updatedAt", () => {
    const older = session({
      id: "old",
      title: "Старіша",
      updatedAt: 1000,
    });
    const newer = session({
      id: "new",
      title: "Новіша",
      updatedAt: 2000,
    });
    renderDrawer({ open: true, sessions: [older, newer] });
    const titles = screen
      .getAllByText(/Старіша|Новіша/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["Новіша", "Старіша"]);
  });

  it("pluralizes user message count (1 vs many) and counts only user messages", () => {
    const one = session({
      id: "one",
      title: "Один",
      updatedAt: 2000,
      messages: [userMsg("a"), assistantMsg("b"), assistantMsg("c")],
    });
    const many = session({
      id: "many",
      title: "Багато",
      updatedAt: 1000,
      messages: [userMsg("a"), userMsg("b"), assistantMsg("c")],
    });
    renderDrawer({ open: true, sessions: [one, many] });
    expect(screen.getByText(/1 повідомлення/)).toBeInTheDocument();
    expect(screen.getByText(/2 повідомлень/)).toBeInTheDocument();
  });

  it("marks the active session with aria-current", () => {
    const s = session({ id: "s1", title: "Активна" });
    renderDrawer({ open: true, sessions: [s], activeId: "s1" });
    const btn = screen
      .getByText("Активна")
      .closest("button") as HTMLButtonElement;
    expect(btn).toHaveAttribute("aria-current", "true");
  });

  it("fires onSelect when a session row is clicked", () => {
    const s = session({ id: "s1", title: "Вибери мене" });
    const { handlers } = renderDrawer({ open: true, sessions: [s] });
    fireEvent.click(screen.getByText("Вибери мене"));
    expect(handlers.onSelect).toHaveBeenCalledWith("s1");
  });

  it("fires onCreate from the new-conversation button", () => {
    const { handlers } = renderDrawer({ open: true, sessions: [] });
    fireEvent.click(screen.getByRole("button", { name: /Нова бесіда/ }));
    expect(handlers.onCreate).toHaveBeenCalledTimes(1);
  });

  it("fires onDelete (and not onSelect) when the delete button is clicked", () => {
    const s = session({ id: "s1", title: "Видали мене" });
    const { handlers } = renderDrawer({ open: true, sessions: [s] });
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити бесіду Видали мене" }),
    );
    expect(handlers.onDelete).toHaveBeenCalledWith("s1");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("closes on Escape keydown and via the close button / backdrop", () => {
    const { handlers } = renderDrawer({ open: true, sessions: [] });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Закрити список бесід" }),
    );
    expect(handlers.onClose.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
