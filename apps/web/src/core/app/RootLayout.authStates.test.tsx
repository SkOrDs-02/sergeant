// @vitest-environment jsdom
/**
 * Інтеграційні тести станів ідентичності в оболонці (аудит 2026-10-01,
 * кластери logic-01 і rel-02): справжні `AuthProvider` + `RootLayout` + MSW
 * на `/api/v1/me`, як у `RootLayout.test.tsx` (той файл уже за стелею
 * `max-lines`, тому сценарії живуть окремо).
 *
 *  - logic-01: 403 `account_pending_deletion` на `me` показує екран
 *    відновлення, а «Відновити» впускає в застосунок;
 *  - rel-02: 5xx, 429, обрив мережі й битий JSON на `me` НЕ скидають
 *    ідентичність (без `queryClient.clear`), показують екран-блокер БЕЗ
 *    застосунку (модулі не змонтовані: нема UI для запису, який губиться
 *    без dual-write контексту, і нема даних повз App Lock) і після
 *    відновлення сервера повертають користувача.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { http, HttpResponse } from "msw";
import { meFixtures } from "@sergeant/shared";

import { apiClient } from "@shared/api";
import { ToastProvider } from "@shared/hooks/useToast";
import { CommandPaletteProvider } from "@shared/components/ui/CommandPalette";
import { server } from "../../test/msw/server";
import { AuthProvider } from "../auth/AuthContext";
import { AppLockProvider } from "../security/AppLockContext";
import {
  SESSIONS_MIRROR_KEY,
  reconcileChatOwnerOnAuthChange,
} from "../hub/hubChatSessions";
import { useHubShell } from "./HubShellContext";

// Boot-кластери модулів тягнуть sqlite-wasm/IndexedDB; тут вони не предмет.
// Мокаємо кластери (4 модулі), а не дев'ять хуків усередині них: ліміт
// `vi.mock` на файл дорівнює 5, і решта оболонки (AppLock, HubChatOverlay,
// auth, мережа) лишається справжньою.
vi.mock("../../modules/nutrition/hooks/NutritionBootCluster", () => ({
  default: () => null,
}));
vi.mock("../../modules/finyk/hooks/FinykBootCluster", () => ({
  default: () => null,
}));
vi.mock("../../modules/fizruk/hooks/FizrukBootCluster", () => ({
  default: () => null,
}));
vi.mock("../../modules/routine/hooks/RoutineBootCluster", () => ({
  default: () => null,
}));
// Ліниво префетчить повні модулі застосунку на маунті.
vi.mock("./useAppEffects", () => ({ useAppEffects: vi.fn() }));

import { RootLayout } from "./RootLayout";

const PURGE_AT = "2026-10-31T10:00:00.000Z";
const USER_ID = meFixtures.minimal.user.id;

function ShellProbe() {
  const { user, authLoading } = useHubShell();
  return (
    <>
      <div data-testid="child">child</div>
      <div data-testid="auth-user">{user ? user.id : "anon"}</div>
      <div data-testid="auth-loading">{String(authLoading)}</div>
    </>
  );
}

function renderShell(initialPath = "/") {
  const qc = new QueryClient({
    // `retryDelay: 0`: `me` ретраїть власна `retry`-функція, а її відступи
    // в тесті не предмет.
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const clearSpy = vi.spyOn(qc, "clear");
  render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={apiClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <ToastProvider>
            <CommandPaletteProvider>
              <AuthProvider>
                <AppLockProvider>
                  <Routes>
                    <Route element={<RootLayout />}>
                      <Route path="*" element={<ShellProbe />} />
                    </Route>
                  </Routes>
                </AppLockProvider>
              </AuthProvider>
            </CommandPaletteProvider>
          </ToastProvider>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return { qc, clearSpy };
}

const meOk = () =>
  http.get("*/api/v1/me", () => HttpResponse.json(meFixtures.minimal));

describe("RootLayout × стани ідентичності", () => {
  // Прогріваємо лінивий чанк аркуша чату: інакше перший тест, що відкриває
  // оверлей, чекає на трансформацію модуля довше за вікно очікування, і
  // перевірка «оверлей не з'явився» проходить навіть без фіксу.
  beforeAll(async () => {
    await import("../hub/HubChatSheet");
  }, 30_000);
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("logic-01: акаунт у вікні видалення", () => {
    it("403 account_pending_deletion на me показує екран відновлення, а не анонімний застосунок", async () => {
      server.use(
        http.get("*/api/v1/me", () =>
          HttpResponse.json(
            {
              error: "Акаунт у процесі видалення",
              code: "account_pending_deletion",
              scheduledPurgeAt: PURGE_AT,
            },
            { status: 403 },
          ),
        ),
        http.get("*/api/v1/me/deletion-status", () =>
          HttpResponse.json({
            pending: true,
            requestedAt: "2026-10-01T10:00:00.000Z",
            scheduledPurgeAt: PURGE_AT,
          }),
        ),
      );
      renderShell();

      expect(
        await screen.findByRole("button", { name: "Відновити акаунт" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/31 жовтня 2026/)).toBeInTheDocument();
      // Застосунок за блокером не рендериться.
      expect(screen.queryByTestId("child")).toBeNull();
    });

    it("блокер тримається, навіть коли deletion-status недоступний: 403 на me авторитетніший", async () => {
      server.use(
        http.get("*/api/v1/me", () =>
          HttpResponse.json(
            { code: "account_pending_deletion", scheduledPurgeAt: PURGE_AT },
            { status: 403 },
          ),
        ),
        http.get("*/api/v1/me/deletion-status", () =>
          HttpResponse.json({ error: "boom" }, { status: 500 }),
        ),
      );
      renderShell();

      expect(
        await screen.findByRole("button", { name: "Відновити акаунт" }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("child")).toBeNull();
    });

    it("«Відновити акаунт» перепитує me і пускає людину в застосунок", async () => {
      let restored = false;
      server.use(
        http.get("*/api/v1/me", () =>
          restored
            ? HttpResponse.json(meFixtures.minimal)
            : HttpResponse.json(
                {
                  code: "account_pending_deletion",
                  scheduledPurgeAt: PURGE_AT,
                },
                { status: 403 },
              ),
        ),
        http.get("*/api/v1/me/deletion-status", () =>
          restored
            ? HttpResponse.json({ pending: false })
            : HttpResponse.json({
                pending: true,
                requestedAt: "2026-10-01T10:00:00.000Z",
                scheduledPurgeAt: PURGE_AT,
              }),
        ),
        http.post("*/api/v1/me/restore", () => {
          restored = true;
          return HttpResponse.json({
            ok: true,
            restoredAt: "2026-10-02T10:00:00.000Z",
          });
        }),
      );
      renderShell();

      fireEvent.click(
        await screen.findByRole("button", { name: "Відновити акаунт" }),
      );

      await waitFor(() =>
        expect(screen.getByTestId("auth-user")).toHaveTextContent(USER_ID),
      );
      expect(
        screen.queryByRole("button", { name: "Відновити акаунт" }),
      ).toBeNull();
    });
  });

  describe("rel-02: збій me не є виходом із акаунта", () => {
    const outages: Array<[string, () => ReturnType<typeof http.get>]> = [
      [
        "500",
        () =>
          http.get("*/api/v1/me", () =>
            HttpResponse.json({ error: "db down" }, { status: 500 }),
          ),
      ],
      [
        "429",
        () =>
          http.get("*/api/v1/me", () =>
            HttpResponse.json({ error: "slow down" }, { status: 429 }),
          ),
      ],
      [
        "обрив мережі",
        () => http.get("*/api/v1/me", () => HttpResponse.error()),
      ],
      [
        "битий JSON",
        () =>
          http.get(
            "*/api/v1/me",
            () =>
              new HttpResponse('{"ok":tru', {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
          ),
      ],
    ];

    it.each(outages)(
      "%s: без identity-wipe; застосунок за блокером; після відновлення me користувач повертається",
      async (_label, handler) => {
        // Пристрій належить залогіненому користувачу.
        reconcileChatOwnerOnAuthChange(USER_ID);
        server.use(handler());
        const { clearSpy } = renderShell();

        expect(
          await screen.findByTestId("auth-unavailable-screen"),
        ).toBeInTheDocument();
        // Не «вийшов»: скидання кешу немає, а застосунок (дані, модулі) під
        // блокером не змонтований.
        expect(screen.queryByTestId("child")).toBeNull();
        expect(clearSpy).not.toHaveBeenCalled();

        // Сервер ожив: «Повторити зараз» повертає користувача.
        server.use(meOk());
        fireEvent.click(
          screen.getByRole("button", { name: "Повторити зараз" }),
        );

        await waitFor(() =>
          expect(screen.getByTestId("auth-user")).toHaveTextContent(USER_ID),
        );
        expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
        expect(screen.queryByTestId("auth-unavailable-screen")).toBeNull();
        expect(clearSpy).not.toHaveBeenCalled();
      },
      20_000,
    );

    it("збій me на модульному роуті: модуль не рендериться, тож немає ні запису в нікуди, ні даних повз App Lock", async () => {
      reconcileChatOwnerOnAuthChange(USER_ID);
      server.use(
        http.get("*/api/v1/me", () =>
          HttpResponse.json({ error: "db down" }, { status: 500 }),
        ),
      );
      renderShell("/finyk");

      expect(
        await screen.findByTestId("auth-unavailable-screen"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("child")).toBeNull();
    });

    it("збій me не ховає публічні сторінки: юридичні тексти лишаються доступними", async () => {
      reconcileChatOwnerOnAuthChange(USER_ID);
      server.use(
        http.get("*/api/v1/me", () =>
          HttpResponse.json({ error: "db down" }, { status: 500 }),
        ),
      );
      renderShell("/legal/privacy");

      expect(await screen.findByTestId("child")).toBeInTheDocument();
      expect(screen.queryByTestId("auth-unavailable-screen")).toBeNull();
    });

    it.each(["/status", "/legal/privacy"])(
      "збій me на публічному маршруті %s: Ctrl+/ не відкриває чат, історія власника не потрапляє в DOM повз App Lock",
      async (path) => {
        reconcileChatOwnerOnAuthChange(USER_ID);
        const SECRET = "секретна-історія-чату-власника";
        window.localStorage.setItem(
          SESSIONS_MIRROR_KEY,
          JSON.stringify([
            {
              id: "s1",
              title: SECRET,
              createdAt: 1,
              updatedAt: 2,
              messages: [{ id: "m1", role: "user", text: SECRET }],
            },
          ]),
        );
        server.use(
          http.get("*/api/v1/me", () =>
            HttpResponse.json({ error: "db down" }, { status: 500 }),
          ),
        );
        renderShell(path);

        // Сторінка доступна, але лише вона: без глобального UI оболонки.
        expect(await screen.findByTestId("child")).toBeInTheDocument();
        expect(screen.queryByTestId("auth-unavailable-screen")).toBeNull();

        fireEvent.keyDown(window, { key: "/", ctrlKey: true });
        // Лінивий чанк аркуша резолвиться асинхронно: чекаємо з запасом, щоб
        // відсутність оверлея не була просто «ще не встиг».
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByText(SECRET)).toBeNull();
        expect(document.body.textContent).not.toContain(SECRET);
      },
    );

    it("401 лишається виходом: без екрана збою, анонімний стан", async () => {
      server.use(
        http.get("*/api/v1/me", () =>
          HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
        ),
      );
      renderShell();

      await waitFor(() =>
        expect(screen.getByTestId("auth-loading")).toHaveTextContent("false"),
      );
      expect(screen.getByTestId("auth-user")).toHaveTextContent("anon");
      expect(screen.queryByTestId("auth-unavailable-screen")).toBeNull();
    });
  });
});
