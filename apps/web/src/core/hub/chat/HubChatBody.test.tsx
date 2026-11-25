/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HubChatBodyProps } from "./HubChatBody";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

vi.mock("../../components/ChatMessage", () => ({
  ChatMessage: ({
    message,
    onRetry,
  }: {
    message: { id: string; text: string };
    onRetry?: (text: string) => void;
  }) => (
    <div data-testid={`msg-${message.id}`} data-retry={onRetry ? "1" : "0"}>
      {message.text}
    </div>
  ),
  TypingIndicator: ({ label }: { label?: string | null }) => (
    <div data-testid="typing-indicator">{label ?? ""}</div>
  ),
}));

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: () => <span data-testid="icon" />,
}));

vi.mock("@shared/components/ui/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { HubChatBody } from "./HubChatBody";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Msg = HubChatBodyProps["messages"][number];

function msg(id: string, role: "user" | "assistant", text: string): Msg {
  return { id, role, text } as unknown as Msg;
}

function renderBody(overrides: Partial<HubChatBodyProps> = {}) {
  const props: HubChatBodyProps = {
    messages: [],
    loading: false,
    onSpeak: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<HubChatBody {...props} />), props };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubChatBody", () => {
  afterEach(() => cleanup());

  // Регресія з browser-QA 2026-09-02: розкриття «це AI» (EU AI Act ст. 50(1))
  // жило всередині `ChatEmpty`, а `normalizeStoredMessages` підставляла
  // привітальну репліку в кожну порожню сесію — тож порожній стан був
  // недосяжний, і розкриття не показувалось ЖОДНОГО разу. Підстановку
  // прибрано в PR-A7, але розкриття лишається безумовним навмисно (defense
  // in depth) — тест і далі перевіряє стан, де в стрічці вже є повідомлення.
  it("shows the AI disclosure even when the greeting message is present", () => {
    renderBody({
      messages: [
        msg("greet", "assistant", "Привіт! Я твій особистий асистент."),
      ],
    });
    expect(screen.getByText(/Відповідає ШІ, не людина/)).toBeInTheDocument();
  });

  it("shows the AI disclosure while the assistant is answering", () => {
    renderBody({ messages: [msg("1", "user", "Питання")], loading: true });
    expect(screen.getByText(/Відповідає ШІ, не людина/)).toBeInTheDocument();
  });

  // Регресія з browser-QA 2026-09-02: стрічка лежить у статичному
  // `role="region"`, а єдина жива область казала лише «Асистент відповідає…».
  // Тобто незрячий користувач чув, що відповідь іде, і не чув, ЯКА вона.
  it("announces the finished assistant reply to screen readers", () => {
    renderBody({
      messages: [
        msg("1", "user", "Скільки я витратив?"),
        msg("2", "assistant", "Цього тижня 1 240 гривень."),
      ],
      loading: false,
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Цього тижня 1 240 гривень.");
  });

  // Фікстура саме з ЧАСТКОВОЮ відповіддю: `useChatSend` дописує повідомлення
  // асистента, поки `loading` ще `true`, тож без цього випадку тест не
  // доводив би головного — що недописаний текст у живу область не тече.
  // Матчер якірний: підрядок пройшов би й тоді, коли поруч лежить обривок
  // відповіді (ревʼю PR #1053).
  it("announces progress, not content, while the reply is streaming", () => {
    renderBody({
      messages: [
        msg("1", "user", "Скільки я витратив?"),
        msg("2", "assistant", "Цього тижня 1 2"),
      ],
      loading: true,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Сержант відповідає…$/,
    );
  });

  it("does not announce a failure through the reply region", () => {
    const failure = {
      ...msg("1", "assistant", "Асистент зараз недоступний."),
      error: true,
    } as unknown as Msg;
    renderBody({ messages: [failure], loading: false });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("renders all provided messages", () => {
    renderBody({
      messages: [msg("1", "user", "Привіт"), msg("2", "assistant", "Вітаю")],
    });
    expect(screen.getByTestId("msg-1")).toHaveTextContent("Привіт");
    expect(screen.getByTestId("msg-2")).toHaveTextContent("Вітаю");
  });

  it("shows TypingIndicator and cancel pill while loading", () => {
    renderBody({ messages: [], loading: true });
    expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Скасувати поточний запит/i }),
    ).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    renderBody({ messages: [], loading: true, onCancel });
    fireEvent.click(
      screen.getByRole("button", { name: /Скасувати поточний запит/i }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides cancel pill when not loading", () => {
    renderBody({ messages: [msg("1", "user", "Привіт")], loading: false });
    expect(
      screen.queryByRole("button", { name: /Скасувати поточний запит/i }),
    ).not.toBeInTheDocument();
  });

  it("sets aria-busy when loading", () => {
    const { container } = renderBody({ loading: true });
    const scrollable = container.querySelector('[aria-busy="true"]');
    expect(scrollable).toBeInTheDocument();
  });

  it("keeps the scrollable message list reachable from the keyboard", () => {
    // axe `scrollable-region-focusable`: без tabIndex стрічку без
    // фокусованих елементів не прогорнути клавіатурою.
    const { container } = renderBody({ loading: false });
    const scrollable = container.querySelector('[aria-busy="false"]');
    expect(scrollable).toHaveAttribute("tabindex", "0");
  });

  it("has aria-live polite region for screen reader announcements", () => {
    const { container } = renderBody({ loading: true });
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).toHaveTextContent("Сержант відповідає…");
    const scrollContainer = container.querySelector('[aria-busy="true"]');
    expect(scrollContainer).not.toHaveAttribute("aria-live");
  });

  // С-1 (б): крок інструмента оголошується тією самою чемною областю,
  // а не окремою, щоб не дублювати оголошення.
  it("passes the current step to the indicator and announces it politely", () => {
    const { container } = renderBody({ loading: true, step: "Шукаю операцію" });
    expect(screen.getByTestId("typing-indicator")).toHaveTextContent(
      "Шукаю операцію",
    );
    const live = container.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveTextContent(/^Шукаю операцію$/);
  });

  it("falls back to the neutral announcement when there is no step", () => {
    const { container } = renderBody({ loading: true, step: null });
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      /^Сержант відповідає…$/,
    );
  });

  it("clears live region text when not loading", () => {
    const { container } = renderBody({ loading: false });
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion).toHaveTextContent("");
  });

  // С-1 (а): «Ще раз» на обірваній відповіді діє лише поза ходом у польоті.
  it("передає onRetry бульбашкам лише коли хід не в польоті", () => {
    const onRetry = vi.fn();
    const messages = [msg("a1", "assistant", "Цього тижня")];
    const { rerender, props } = renderBody({ messages, onRetry });
    expect(screen.getByTestId("msg-a1").dataset["retry"]).toBe("1");
    rerender(<HubChatBody {...props} loading />);
    expect(screen.getByTestId("msg-a1").dataset["retry"]).toBe("0");
  });
});
