/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const closeChatMock = vi.fn();
const openChatMock = vi.fn();
const overlayState = {
  open: false,
  initialMessage: "",
  autoSendInitial: false,
  openChat: openChatMock,
  closeChat: closeChatMock,
};

vi.mock("./useHubChatOverlay", () => ({
  useHubChatOverlay: () => overlayState,
}));

// Аркуш чату — лінивий (`HubChatSheet`, він тримає `Sheet` і весь його стек
// поза критичним шляхом; розбір — AI-DANGER у `HubChatOverlay.tsx`). Тут
// гасимо саму лінивість, щоб тести лишились синхронними: стуб грає роль
// аркуша і віддає ті самі дві дії, які з нього доступні людині.
vi.mock("../lib/lazyImport", () => ({
  lazyDefault: (
    factory: () => Promise<{ default: React.ComponentType<unknown> }>,
  ) => {
    const Stub = (props: Record<string, unknown>) => (
      <div data-testid="chat-sheet-stub" data-props={JSON.stringify(props)}>
        <button
          type="button"
          aria-label="Закрити"
          onClick={() => (props["onClose"] as (() => void) | undefined)?.()}
        >
          close
        </button>
        {/* «?» у композері чату — єдиний вхід у каталог із самого чату. */}
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
    Stub.displayName = "LazyHubChatSheet";
    // Attach preload to satisfy React.lazy interface
    void factory;
    return Stub;
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { HubChatOverlay } from "./HubChatOverlay";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderOverlay(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HubChatOverlay />
    </MemoryRouter>,
  );
}

/** Шар навколо оверлея: показує поточний шлях і вміє крок назад. */
function Harness() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
      <button type="button" onClick={() => navigate("/pricing")}>
        to-pricing
      </button>
      <button type="button" onClick={() => navigate("/")}>
        to-home
      </button>
      <HubChatOverlay />
    </>
  );
}

function renderHarness() {
  const tree = (
    <MemoryRouter initialEntries={["/"]}>
      <Harness />
    </MemoryRouter>
  );
  const utils = render(tree);
  return { ...utils, rerender: () => utils.rerender(tree) };
}

function click(name: string) {
  act(() => {
    screen.getByRole("button", { name }).click();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubChatOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlayState.open = false;
    overlayState.initialMessage = "";
    overlayState.autoSendInitial = false;
  });

  afterEach(() => cleanup());

  it("renders nothing when overlay is closed", () => {
    overlayState.open = false;
    renderOverlay();
    expect(screen.queryByTestId("chat-sheet-stub")).not.toBeInTheDocument();
  });

  it("mounts the lazy chat sheet when overlay is open", () => {
    overlayState.open = true;
    renderOverlay();
    expect(screen.getByTestId("chat-sheet-stub")).toBeInTheDocument();
  });

  // Звіт власника 2026-09-15: «?» у чаті веде в каталог, а свайп/стрілка
  // назад викидали на хаб замість чату. Чат тут — не маршрут, а лист, тож
  // історія про нього нічого не знає; намір повернення живе в оверлеї.
  describe("повернення з каталогу можливостей", () => {
    it("піднімає чат назад, коли людина повернулась на той самий шлях", () => {
      overlayState.open = true;
      const { rerender } = renderHarness();

      click("catalogue");
      expect(screen.getByTestId("path")).toHaveTextContent("/assistant");
      // Навігація знімає лист — це наявна поведінка, не нова.
      expect(closeChatMock).toHaveBeenCalledTimes(1);

      overlayState.open = false;
      rerender();
      expect(openChatMock).not.toHaveBeenCalled();

      click("back");
      expect(screen.getByTestId("path")).toHaveTextContent("/");
      expect(openChatMock).toHaveBeenCalledTimes(1);
    });

    it("не піднімає чат, якщо людина закрила його сама", () => {
      overlayState.open = true;
      const { rerender } = renderHarness();

      click("catalogue");
      overlayState.open = true;
      rerender();
      // Явне закриття скасовує намір повернення.
      click("Закрити");
      overlayState.open = false;
      rerender();

      click("back");
      expect(screen.getByTestId("path")).toHaveTextContent("/");
      expect(openChatMock).not.toHaveBeenCalled();
    });

    it("забуває намір, якщо з каталогу пішли деінде", () => {
      overlayState.open = true;
      const { rerender } = renderHarness();

      click("catalogue");
      overlayState.open = false;
      rerender();

      // З каталогу пішли на тариф — намір більше не чинний. Без цього чат
      // сплив би сам собою, коли людина колись повернеться на хаб зовсім
      // іншим шляхом.
      click("to-pricing");
      expect(screen.getByTestId("path")).toHaveTextContent("/pricing");

      click("to-home");
      expect(screen.getByTestId("path")).toHaveTextContent("/");
      expect(openChatMock).not.toHaveBeenCalled();
    });
  });

  it("calls closeChat when the sheet's onClose fires", () => {
    overlayState.open = true;
    renderOverlay();
    act(() => {
      screen.getByRole("button", { name: "Закрити" }).click();
    });
    expect(closeChatMock).toHaveBeenCalledTimes(1);
  });
});
