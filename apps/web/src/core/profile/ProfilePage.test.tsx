// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expandAllCollapsedSections } from "../../test/helpers/collapsibleSection";
import { messages } from "@shared/i18n/uk";

// ── Mocks ────────────────────────────────────────────────────

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigateMock };
});

const updateUserMock =
  vi.fn<
    (d: unknown) => Promise<{ error: null } | { error: { message: string } }>
  >();
const changePasswordMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const listSessionsMock = vi.fn<() => Promise<{ data: unknown[] }>>();
const revokeSessionMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const deleteUserMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();
const signOutMock = vi.fn<() => Promise<void>>();
const sendVerificationEmailMock =
  vi.fn<(d: unknown) => Promise<{ error: null }>>();
const changeEmailMock = vi.fn<(d: unknown) => Promise<{ error: null }>>();

updateUserMock.mockResolvedValue({ error: null });
changePasswordMock.mockResolvedValue({ error: null });
listSessionsMock.mockResolvedValue({ data: [] });
revokeSessionMock.mockResolvedValue({ error: null });
deleteUserMock.mockResolvedValue({ error: null });
signOutMock.mockResolvedValue(undefined);
sendVerificationEmailMock.mockResolvedValue({ error: null });
changeEmailMock.mockResolvedValue({ error: null });

vi.mock("../auth/authClient.js", () => ({
  updateUser: (data: unknown) => updateUserMock(data),
  changePassword: (data: unknown) => changePasswordMock(data),
  listSessions: () => listSessionsMock(),
  revokeSession: (data: unknown) => revokeSessionMock(data),
  deleteUser: (data: unknown) => deleteUserMock(data),
  signOut: () => signOutMock(),
  sendVerificationEmail: (data: unknown) => sendVerificationEmailMock(data),
  changeEmail: (data: unknown) => changeEmailMock(data),
}));

const useOnlineStatusMock = vi.fn(() => true);
vi.mock("@shared/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastShowMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    show: toastShowMock,
  }),
}));

const mockUser = {
  id: "u-1",
  email: "test@example.com",
  name: "Тест",
  image: null as string | null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z" as string | null,
};
const refreshMock = vi.fn(async () => undefined);
const logoutMock = vi.fn(async () => undefined);

const mockAuthValue = {
  user: mockUser,
  logout: logoutMock,
  refresh: refreshMock,
  isLoading: false,
  status: "authenticated" as const,
};
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => mockAuthValue,
  // `BiometricsSection` → `useBiometrics` reads the non-throwing variant
  // (see `useBiometrics.ts`); mirror the same authenticated value here so
  // this suite still exercises the "signed in" write-through branch.
  useAuthOptional: () => mockAuthValue,
}));

import { ProfilePage } from "./ProfilePage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe("ProfilePage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    updateUserMock.mockResolvedValue({ error: null });
    changePasswordMock.mockResolvedValue({ error: null });
    listSessionsMock.mockResolvedValue({ data: [] });
    revokeSessionMock.mockResolvedValue({ error: null });
    deleteUserMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue(undefined);
    sendVerificationEmailMock.mockResolvedValue({ error: null });
    changeEmailMock.mockResolvedValue({ error: null });
    useOnlineStatusMock.mockReturnValue(true);
    mockUser.image = null;
    mockUser.name = "Тест";
    mockUser.emailVerified = true;
  });

  describe("rendering", () => {
    it("exposes an sr-only page heading for screen readers", () => {
      renderPage();
      expect(
        screen.getByRole("heading", { level: 1, name: "Профіль" }),
      ).toHaveClass("sr-only");
    });

    it("shows user name and email", () => {
      renderPage();
      expect(screen.getByText("Тест")).toBeInTheDocument();
      const emails = screen.getAllByText("test@example.com");
      expect(emails.length).toBeGreaterThanOrEqual(1);
    });

    it("shows verified badge when emailVerified is true", () => {
      renderPage();
      const badges = screen.getAllByText("Підтверджено");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("hides verified badge when emailVerified is false", () => {
      mockUser.emailVerified = false;
      renderPage();
      expect(screen.queryByText("Підтверджено")).not.toBeInTheDocument();
    });

    it("shows initial letter when no avatar image", () => {
      renderPage();
      const avatarBtns = screen.getAllByLabelText("Змінити аватар");
      expect(within(avatarBtns[0]!).getByText("Т")).toBeInTheDocument();
    });

    it("shows avatar image when user.image is set", () => {
      mockUser.image = "data:image/webp;base64,abc";
      renderPage();
      const avatarBtns = screen.getAllByLabelText("Змінити аватар");
      const img = avatarBtns[0]!.querySelector("img");
      expect(img).toBeTruthy();
      expect(img!.getAttribute("src")).toBe("data:image/webp;base64,abc");
    });

    it("shows remove photo link when avatar is set", () => {
      mockUser.image = "data:image/webp;base64,abc";
      renderPage();
      const links = screen.getAllByText("Видалити фото");
      expect(links.length).toBeGreaterThanOrEqual(1);
    });

    it("hides remove photo link when no avatar", () => {
      renderPage();
      expect(screen.queryByText("Видалити фото")).not.toBeInTheDocument();
    });

    it("shows email verification banner when emailVerified is false", () => {
      mockUser.emailVerified = false;
      renderPage();
      // Banner copy was extended in #1067 to include the suffix
      // "— перевірте вашу поштову скриньку"; the action button was renamed
      // from "Надіслати лист" to "Надіслати". Match the prefix via regex.
      expect(screen.getByText(/Email не підтверджено/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Надіслати" }),
      ).toBeInTheDocument();
    });

    it("hides email verification banner when emailVerified is true", () => {
      renderPage();
      expect(
        screen.queryByText(/Email не підтверджено/),
      ).not.toBeInTheDocument();
    });

    it("shows avatar removal confirm when clicking remove photo", () => {
      mockUser.image = "data:image/webp;base64,abc";
      renderPage();
      const links = screen.getAllByText("Видалити фото");
      fireEvent.click(links[0]!);
      // Confirm prompt copy changed in #1067 from "Видалити?" to
      // "Видалити фото?".
      expect(screen.getByText("Видалити фото?")).toBeInTheDocument();
    });

    it("shows change email button", () => {
      renderPage();
      expect(
        screen.getByRole("button", { name: "Змінити" }),
      ).toBeInTheDocument();
    });
  });

  describe("offline UX", () => {
    it("shows offline warning banner when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      expect(
        screen.getByText("Офлайн, редагування профілю тимчасово недоступне"),
      ).toBeInTheDocument();
    });

    it("hides offline warning banner when online", () => {
      useOnlineStatusMock.mockReturnValue(true);
      renderPage();
      expect(
        screen.queryByText("Офлайн, редагування профілю тимчасово недоступне"),
      ).not.toBeInTheDocument();
    });

    it("disables save name button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const saveBtns = screen.getAllByRole("button", { name: "Зберегти" });
      expect(saveBtns[0]).toBeDisabled();
    });

    it("disables change password button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      const { container } = renderPage();
      // «Пароль» — один із пʼяти `CollapsibleSection`, згорнутих за
      // замовчуванням; L-7 фікс ховає їхній вміст через `inert` +
      // `aria-hidden`, тож кнопку треба спершу розкрити, як зробив би юзер.
      expandAllCollapsedSections(container);
      const changeBtn = screen.getByRole("button", {
        name: "Змінити пароль",
      });
      expect(changeBtn).toBeDisabled();
    });

    it("disables delete account button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      const { container } = renderPage();
      // «Видалення акаунта» згорнута за замовчуванням — див. коментар вище.
      expandAllCollapsedSections(container);
      const deleteBtn = screen.getByRole("button", {
        name: "Видалити акаунт",
      });
      expect(deleteBtn).toBeDisabled();
    });

    it("disables avatar upload button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const avatarBtns = screen.getAllByLabelText("Змінити аватар");
      expect(avatarBtns[0]).toBeDisabled();
    });

    it("disables email verification button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      mockUser.emailVerified = false;
      renderPage();
      const btn = screen.getByRole("button", { name: "Надіслати" });
      expect(btn).toBeDisabled();
    });

    it("disables change email button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      const btn = screen.getByRole("button", { name: "Змінити" });
      expect(btn).toBeDisabled();
    });
  });

  describe("sessions section", () => {
    it("calls listSessions on mount when online", async () => {
      useOnlineStatusMock.mockReturnValue(true);
      renderPage();
      await waitFor(() => expect(listSessionsMock).toHaveBeenCalled());
    });

    it("does NOT call listSessions when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      renderPage();
      expect(listSessionsMock).not.toHaveBeenCalled();
    });

    it("disables refresh button when offline", () => {
      useOnlineStatusMock.mockReturnValue(false);
      const { container } = renderPage();
      // «Активні сесії» згорнута за замовчуванням — див. коментар вище.
      expandAllCollapsedSections(container);
      const refreshBtn = screen.getByRole("button", { name: "Оновити" });
      expect(refreshBtn).toBeDisabled();
    });
  });

  describe("async safety", () => {
    it("resets name save loading and shows error when updateUser throws", async () => {
      updateUserMock.mockRejectedValueOnce(new Error("network"));
      renderPage();
      const nameInput = screen.getByLabelText("Імʼя");
      fireEvent.change(nameInput, { target: { value: "Нове імʼя" } });

      const saveBtn = screen.getAllByRole("button", { name: "Зберегти" })[0];
      fireEvent.click(saveBtn!);

      // Помилка форми лишається у формі (`useApiForm.serverError`), а не
      // дублюється тостом — див. коментар у `PersonalInfoSection`.
      await waitFor(() =>
        expect(screen.getByText("Не вдалося оновити імʼя")).toBeInTheDocument(),
      );
      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe("delete account dialog", () => {
    it("uses accessible labels and closes on Escape", () => {
      const { container } = renderPage();
      // «Видалення акаунта» згорнута за замовчуванням — див. коментар вище.
      expandAllCollapsedSections(container);

      fireEvent.click(screen.getByRole("button", { name: "Видалити акаунт" }));

      const dialog = screen.getByRole("dialog", {
        name: "Видалити акаунт назавжди?",
      });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(within(dialog).getByLabelText("Пароль")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("logout", () => {
    it("renders Вийти button at bottom of profile", () => {
      renderPage();
      const logoutBtn = screen.getByRole("button", { name: "Вийти" });
      expect(logoutBtn).toBeInTheDocument();
    });

    it("calls logout, shows toast and redirects to /sign-in on click", async () => {
      renderPage();
      const logoutBtn = screen.getByRole("button", { name: "Вийти" });
      fireEvent.click(logoutBtn);
      await waitFor(() => expect(logoutMock).toHaveBeenCalled());
      await waitFor(() =>
        expect(toastSuccessMock).toHaveBeenCalledWith("Вихід виконано"),
      );
      // Redirect to the auth surface, not the hub root (browser-QA (a)).
      expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true });
    });

    it("shows error toast when logout throws", async () => {
      logoutMock.mockRejectedValueOnce(new Error("network"));
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Вийти" }));
      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith(
          "Не вдалося вийти",
          undefined,
          expect.objectContaining({ label: "Повторити" }),
        ),
      );
    });
  });

  // §6 аудиту 2026-08-08 («найнебезпечніші дії без тестів»): гейт «є
  // незбережені записи» на виході — `logout()` бере `confirmUnsyncedLoss`
  // і чекає на відповідь, перш ніж стерти локальну БД. Мок `logout` тут
  // імітує РЕАЛЬНУ поведінку `AuthContext.logout()` (`flushPendingSyncOpsBeforeLogout`
  // → якщо лишилось недоставлене — питає callback і чекає на його Promise),
  // а не просто резолвиться миттєво — інакше діалог ніколи б не встиг
  // змонтуватись і тест перевіряв би повітря.
  describe("unsynced records gate on logout", () => {
    function mockLogoutAsksForConfirmation(pending = 3) {
      logoutMock.mockImplementationOnce(
        async (options?: {
          confirmUnsyncedLoss?: (pending: number) => Promise<boolean>;
        }) => {
          await options?.confirmUnsyncedLoss?.(pending);
        },
      );
    }

    it('"Все одно вийти": proceeds with logout — toast + redirect fire, exactly like a clean exit', async () => {
      mockLogoutAsksForConfirmation(3);
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Вийти" }));

      const dialog = await screen.findByRole("alertdialog", {
        name: "Є незбережені записи",
      });
      // `^`-анкор — щоб `pending=3` не міг випадково збігтися з рядком, де
      // "3" є суфіксом іншого числа (напр. "13 записів").
      expect(
        within(dialog).getByText(/^3 записів ще не збережено на сервері\./),
      ).toBeInTheDocument();

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Все одно вийти" }),
      );

      await waitFor(() =>
        expect(toastSuccessMock).toHaveBeenCalledWith("Вихід виконано"),
      );
      expect(navigateMock).toHaveBeenCalledWith("/sign-in", { replace: true });
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it('"Залишитись": cancels logout — session stays alive, so no toast and no redirect', async () => {
      mockLogoutAsksForConfirmation(1);
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Вийти" }));

      const dialog = await screen.findByRole("alertdialog", {
        name: "Є незбережені записи",
      });
      // Однина: pending === 1 бере окрему гілку копірайту. Regex (не
      // exact-рядок) — опис рендериться трьома сусідніми текстовими
      // вузлами всередині одного `<div>` (речення + пробіл + друге
      // речення), тож `getByText` з точним рядком не матчить жоден
      // окремий вузол — лише конкатенований текст контейнера.
      expect(
        within(dialog).getByText(/^1 запис ще не збережено на сервері\./),
      ).toBeInTheDocument();

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Залишитись" }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      );
      // Сесія лишається живою — жодного сигналу «ви вийшли», жодного
      // редиректу на екран входу. Це саме те, що мало б зламатись, якби
      // `cancelled` ігнорувався після `await logout(...)`.
      expect(toastSuccessMock).not.toHaveBeenCalledWith("Вихід виконано");
      expect(navigateMock).not.toHaveBeenCalledWith("/sign-in", {
        replace: true,
      });
      // Кнопка "Вийти" повертається в звичайний стан — не залипає у
      // loading, ніби вихід досі триває.
      expect(screen.getByRole("button", { name: "Вийти" })).not.toBeDisabled();
    });
  });

  // V-4 / V-10 (deep-module-audit 2026-08-08, §5): Профіль приведено до
  // сітки Налаштувань (V-10) і виправлено інверсію заголовків секцій
  // (V-4). Ці тести червоніли на коді ДО фіксу — див. коментарі в
  // `ProfilePage.tsx`/`MemoryBankSection.tsx` (канонічний) для деталей.
  describe("section container and header hierarchy (V-4 / V-10 audit 2026-08-08)", () => {
    it("matches HubSettingsPage's own container shape — no duplicated max-w/px from the hub shell (V-10)", () => {
      const { container } = renderPage();
      const root = container.firstElementChild as HTMLElement;
      // Було: "max-w-lg mx-auto px-5 pb-10 space-y-2 pt-6" — дублювало
      // max-w/px хабової оболонки (`HubMainContent.tsx`) і мало вдвічі
      // щільніший ритм за `gap-4` сусідньої вкладки Налаштувань.
      expect(root.className).not.toContain("max-w-lg");
      expect(root.className).not.toContain("px-5");
      expect(root.className).not.toContain("space-y-2");
      expect(root.className).toContain("gap-4");
    });

    it("does not render a duplicated card-header title inside expanded sections (V-4)", () => {
      const { container } = renderPage();
      expandAllCollapsedSections(container);
      // До фіксу кожен з цих заголовків рендерився ДВІЧІ: раз як
      // зовнішній заголовок `CollapsibleSection`, раз — як внутрішня
      // шапка картки (`COPY.sectionTitle` дослівно збігався з `title`).
      expect(screen.getAllByText("Активні сесії")).toHaveLength(1);
      expect(screen.getAllByText("Біометрія")).toHaveLength(1);
      expect(screen.getAllByText("Пароль")).toHaveLength(1);
      // MemoryBankSection мала близький, а не дослівний дублікат —
      // «Памʼять ШІ» замість «Памʼять» — цей текст мав зникнути повністю.
      expect(screen.queryByText("Памʼять ШІ")).not.toBeInTheDocument();
    });

    it("raises the outer section heading to text-style-label so it is never smaller than its inner card header (V-4)", () => {
      const { container } = renderPage();
      expandAllCollapsedSections(container);
      for (const title of [
        "Активні сесії",
        "Памʼять",
        "Біометрія",
        "Пароль",
        "Видалення акаунта",
      ]) {
        const el = screen.getByText(title);
        expect(el.className).toContain("text-style-label");
        expect(el.className).not.toContain("text-style-caption");
      }
    });

    it("keeps DangerZoneSection's own non-duplicate heading text intact — it is NOT a literal duplicate of the outer title (V-4)", () => {
      const { container } = renderPage();
      expandAllCollapsedSections(container);
      // «Небезпечна зона» — інша інформація, ніж «Видалення акаунта»
      // (застереження про розділ, не назва секції), тож текст лишається:
      // на відміну від чотирьох секцій вище, тут нічого не дублювалось.
      expect(screen.getByText("Небезпечна зона")).toBeInTheDocument();
      expect(screen.getByText("Видалення акаунта")).toBeInTheDocument();
    });

    it("keeps MemoryBankSection's meta info (entry count + storage size) after removing the duplicated title (V-4)", () => {
      localStorage.setItem(
        "hub_user_profile_v1",
        JSON.stringify([
          {
            id: "mem_1",
            fact: "Не їм арахіс",
            category: "allergy",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]),
      );
      const { container } = renderPage();
      expandAllCollapsedSections(container);
      expect(screen.getByText(/1 запис/)).toBeInTheDocument();
    });
  });

  describe("memory bank", () => {
    it("renders stored profile memory and exposes visible delete action", () => {
      localStorage.setItem(
        "hub_user_profile_v1",
        JSON.stringify([
          {
            id: "mem_1",
            fact: "Не їм арахіс",
            category: "allergy",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]),
      );

      renderPage();

      expect(screen.getByText("Не їм арахіс")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Видалити: Не їм арахіс"));
      expect(screen.queryByText("Не їм арахіс")).not.toBeInTheDocument();
    });
  });
});

// V-11 (аудит Профілю/Налаштувань, фаза 2 L-8 — 2026-08-09).
//
// Знахідка описувала «два входи в «що ШІ про мене знає» з різними назвами».
// Точніша її форма: ПІДЗАГОЛОВОК профільної секції «Памʼять» був майже
// дослівним ЗАГОЛОВКОМ секції в Конфіденційності — «Що асистент знає про
// тебе» проти «Що ШІ про тебе памʼятає». Тобто це не просто схожі рядки, а
// підпис одного входу, який дорівнює назві іншого; людина, прочитавши
// будь-який, робила висновок, що це те саме місце.
//
// Після дзеркалення фактів у `ai_memories` (фаза 2) стосунок між ними
// інший: Профіль — ДЖЕРЕЛО (те, що людина розповіла сама і може
// редагувати), Конфіденційність — ОБСЯГ (усе, що асистент запамʼятав, із
// чату й модулів теж). Пін нижче не перевіряє конкретний текст (він ще
// мінятиметься), а тримає саме інваріант: підзаголовок одного входу не
// повторює назву іншого.
describe("V-11: два входи в памʼять розрізняються назвами", () => {
  it("підзаголовок секції «Памʼять» не дублює заголовок списку в Конфіденційності", () => {
    renderPage();
    const memoryTrigger = screen.getByText("Памʼять").closest("button");
    expect(memoryTrigger).not.toBeNull();
    const subtitle = memoryTrigger?.textContent ?? "";
    // Позитивний assert ПЕРЕД негативними (CodeRabbit-ревʼю PR #762): самих
    // лише «не містить X» замало — порожній або зовсім сторонній підзаголовок
    // проходив би обидві перевірки, і тест зеленів би на регресі, який
    // просто прибрав текст. Пін на «Твої факти» тримає саме те, що робить
    // фікс: підзаголовок називає ДЖЕРЕЛО фактів.
    expect(subtitle).toContain("Твої факти");
    expect(subtitle).not.toContain(messages.privacy.aiMemory.sectionTitle);
    // І навпаки — щоб фікс не звівся до перестановки слів: підзаголовок
    // мусить називати ДЖЕРЕЛО фактів, а не повторювати «що знає ШІ».
    expect(subtitle).not.toMatch(/знає про тебе|памʼятає про тебе/);
  });
});
