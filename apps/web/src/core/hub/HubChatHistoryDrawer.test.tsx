/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

  it("previews the last meaningful reply, prefixing the user's own", () => {
    const endsWithUser = session({
      id: "u",
      title: "Моя остання",
      updatedAt: 2000,
      messages: [
        userMsg("скільки я витратив"),
        assistantMsg("1 200 ₴"),
        userMsg("а вчора?"),
      ],
    });
    const endsWithError = session({
      id: "e",
      title: "Зі збоєм",
      updatedAt: 1000,
      messages: [
        userMsg("привіт"),
        assistantMsg("вітаю"),
        {
          id: "err",
          role: "assistant",
          text: "Асистент недоступний",
          error: true,
        },
      ],
    });
    renderDrawer({ open: true, sessions: [endsWithUser, endsWithError] });
    expect(screen.getByText("Ти: а вчора?")).toBeInTheDocument();
    // Збій — не репліка бесіди, прев'ю бере попередню відповідь.
    expect(screen.getByText("вітаю")).toBeInTheDocument();
    expect(screen.queryByText(/недоступний/)).not.toBeInTheDocument();
  });

  it("falls back to the user message count when there is nothing to preview", () => {
    const one = session({
      id: "one",
      title: "Один",
      updatedAt: 2000,
      messages: [userMsg("   "), assistantMsg(""), assistantMsg(" ")],
    });
    const many = session({
      id: "many",
      title: "Багато",
      updatedAt: 1000,
      messages: [userMsg(""), userMsg(" "), assistantMsg("")],
    });
    renderDrawer({ open: true, sessions: [one, many] });
    expect(screen.getByText(/1 повідомлення/)).toBeInTheDocument();
    expect(screen.getByText(/2 повідомлень/)).toBeInTheDocument();
  });

  it("groups sessions by Kyiv day: Сьогодні / Вчора / Раніше", () => {
    vi.useFakeTimers();
    // Полудень за Києвом — далеко від межі доби, тож ±24 год це рівно
    // сусідні календарні дні.
    vi.setSystemTime(new Date("2026-09-03T09:00:00Z"));
    try {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const today = session({ id: "t", title: "Сьогоднішня", updatedAt: now });
      const yesterday = session({
        id: "y",
        title: "Вчорашня",
        updatedAt: now - day,
      });
      const old = session({
        id: "o",
        title: "Давня",
        updatedAt: now - 5 * day,
      });
      renderDrawer({ open: true, sessions: [old, today, yesterday] });

      const todayGroup = screen.getByRole("region", { name: "Сьогодні" });
      const yesterdayGroup = screen.getByRole("region", { name: "Вчора" });
      const earlierGroup = screen.getByRole("region", { name: "Раніше" });
      expect(within(todayGroup).getByText("Сьогоднішня")).toBeInTheDocument();
      expect(within(yesterdayGroup).getByText("Вчорашня")).toBeInTheDocument();
      expect(within(earlierGroup).getByText("Давня")).toBeInTheDocument();

      const headings = screen
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
      expect(headings).toEqual(["Сьогодні", "Вчора", "Раніше"]);
      expect(
        screen.getByText("3 бесіди на цьому пристрої"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
