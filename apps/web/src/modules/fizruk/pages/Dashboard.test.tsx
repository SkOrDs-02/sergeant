// @vitest-environment jsdom
/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Integration tests for the Fizruk `Dashboard` page — over-mocking
 * refactor.
 *
 * The previous version stubbed all 11 hooks `Dashboard` wires up
 * (`useExerciseCatalog`, `useWorkouts`, `useRecovery`,
 * `useWorkoutTemplates`, `useMonthlyPlan`, `useMeasurements`,
 * `useRestDayOverdueInsight`, `usePrPendingInsight`, `usePrLatest`,
 * `useActiveFizrukWorkout`, `useAuth`) plus its real children to
 * `data-testid` divs, and asserted only "mounts without crashing" /
 * testid-presence — none of it protected the props contract between
 * `Dashboard` and its children.
 *
 * All 11 hooks turn out to be pure — SQLite-warm-cache readers (never
 * booted here; empty until `useFizrukSqliteReadBoot` runs from the
 * `FizrukApp` shell, out of scope for a page-level test) or plain
 * `localStorage`/pure-selector hooks — with **no network calls and no
 * heavy browser API**, so none of them need mocking: this file renders
 * them for real, plus the real `HeroCard`/`RecentWorkoutsSection`/
 * `PrBadge` children, wired to a real `AuthProvider`/`ApiClientProvider`
 * and a real MSW `/api/v1/me` transport (the only network call in the
 * render tree). `HeroCard`'s old streak/week sibling — a three-tile strip
 * rendered below it — is gone (спека `fizruk-hero-recovery-bars.md`
 * рішення 3): that readout moved into the hero's own kicker.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { meFixtures } from "@sergeant/shared";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { apiClient } from "@shared/api";
import { AuthProvider } from "../../../core/auth/AuthContext";
import { server } from "../../../test/msw/server";

import { Dashboard } from "./Dashboard";

const mockNavigate = vi.fn();
// Типізовано САМИМ пропсовим типом сторінки, а не виведено з літерала:
// `Partial<typeof defaultProps>` звужував перекриття до тих ключів, що тут
// перелічені, тож новий опційний проп не можна було передати в
// `renderDashboard` взагалі — помилка типу, а не пропущений кейс.
const defaultProps: ComponentProps<typeof Dashboard> = {
  onOpenPrograms: vi.fn(),
  activeProgram: null,
  todaySession: null,
  onStartProgramWorkout: vi.fn(),
  onNavigate: mockNavigate,
};

function meUnauthenticatedHandler() {
  return http.get("*/api/v1/me", () =>
    HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function meAuthenticatedHandler() {
  return http.get("*/api/v1/me", () => HttpResponse.json(meFixtures.minimal));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  server.use(meUnauthenticatedHandler());
  // Only fake `Date` — faking timers wholesale stalls MSW/React Query's
  // real `setTimeout`-based microtask scheduling and hangs every
  // `findBy*`/`waitFor` in this file.
  vi.useFakeTimers({ toFake: ["Date"] });
  // 09:00 Kyiv → morning greeting.
  vi.setSystemTime(new Date("2026-06-04T09:00:00+03:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderDashboard(
  props: Partial<ComponentProps<typeof Dashboard>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <AuthProvider>
          <Dashboard {...defaultProps} {...props} />
        </AuthProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe("Dashboard — guest, no data (real hooks + real children)", () => {
  it("renders the real HeroCard empty state with the date+streak kicker", async () => {
    renderDashboard();

    // Real sr-only page heading (not a stubbed testid).
    expect(
      await screen.findByRole("heading", { name: "Огляд", hidden: true }),
    ).toBeInTheDocument();

    // Real `HeroCard` in its "empty" state (no templates, no active
    // workout, no plan session) renders the kicker (date · серія · тижн.)
    // and the "no templates yet" copy — the old three-tile strip below the
    // hero is gone (спека `fizruk-hero-recovery-bars.md` рішення 3), so the
    // streak/week readout now lives here instead of a greeting.
    expect(
      screen.getByText(/серія 0 тижн\. · 0 тренувань/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Створити шаблон" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "До програм" }),
    ).toBeInTheDocument();
  });

  it("renders the hero body-empty message for a guest with no training history (рішення 1)", async () => {
    renderDashboard();
    expect(
      await screen.findByText(/Тіло ще не має історії/),
    ).toBeInTheDocument();
  });

  it("does not render RecentWorkoutsSection when there are no completed workouts", async () => {
    renderDashboard();
    await screen.findByRole("button", { name: "Створити шаблон" });
    expect(
      screen.queryByRole("heading", { name: "Останні тренування" }),
    ).not.toBeInTheDocument();
  });

  it("CTA шаблонів веде на власний маршрут і НЕ пише прапорець у sessionStorage", async () => {
    // PR-Z8. Перевірка навмисно тримає обидві половини: і куди ведемо, і
    // що сховище лишається чистим. Сама лише перша половина пройшла б і
    // тоді, коли б запис прапорця забули прибрати, — а це саме той
    // безадресний вхід, задля зняття якого правка й робилась.
    const user = userEvent.setup();
    renderDashboard();
    await user.click(
      await screen.findByRole("button", { name: "Створити шаблон" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("templates");
    expect(window.sessionStorage.getItem("fizruk_workouts_mode")).toBeNull();
  });

  it("порожній план БЕЗ `onQuickStart` лишає стару пару кнопок", () => {
    // Парний до наступного: доводить, що нова головна кнопка з'являється
    // САМЕ від пропа, а не завжди. Без цього кейсу тест нижче не відрізняв
    // би «кнопка з'явилась, бо є проп» від «кнопка з'явилась завжди».
    renderDashboard();
    expect(
      screen.queryByRole("button", { name: "Швидкий старт" }),
    ).not.toBeInTheDocument();
  });

  it("порожній план пропонує ПОЧАТИ, коли старт доступний", async () => {
    // PR-Z6. До цього на першому запуску Огляд не мав жодної кнопки, що
    // стартує тренування: «Створити шаблон» і «До програм» вели у списки,
    // а єдиний старт жив на сусідній вкладці «Тренування».
    const user = userEvent.setup();
    const onQuickStart = vi.fn();
    renderDashboard({ onQuickStart });

    await user.click(
      await screen.findByRole("button", { name: "Швидкий старт" }),
    );
    expect(onQuickStart).toHaveBeenCalledTimes(1);

    // Шлях до шаблонів не зник, а опустився на щабель нижче — інакше
    // правка міняла б одну відсутню дію на іншу.
    expect(
      screen.getByRole("button", { name: /створити шаблон/i }),
    ).toBeInTheDocument();
  });
});

describe("Dashboard — signed-in visitor before hydration", () => {
  // Перевернуто 2026-09-14 (PR-Z9). Тест стверджував, що скелетон стоїть
  // «поки `workoutsLoaded`/`templatesLoaded` false», і власним коментарем
  // пояснював, що в цьому дереві `useFizrukSqliteReadBoot` НЕМАЄ взагалі —
  // тобто пінив стан, з якого немає виходу: без бута прапорці не стануть
  // `true` ніколи, і скелетон вічний. Те саме ставалось у продакшні, коли
  // бут падав (`getSqliteDb()` перекидає помилку, поруч `migrateFizruk`).
  //
  // Новий контракт: скелетон тримається на «бут ЗАРАЗ у польоті». Коли
  // бута немає — як у цьому дереві — малюється вміст, а не очікування.
  it("без бута читання малює вміст, а не вічний скелетон", async () => {
    server.use(meAuthenticatedHandler());
    renderDashboard();

    // Той самий якір, що й у сусідніх кейсах цього файлу: заголовок
    // сторінки з'являється лише коли рендериться справжнє тіло, не скелетон.
    expect(
      await screen.findByRole("heading", { name: "Огляд", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Завантаження дашборду" }),
    ).not.toBeInTheDocument();
  });
});
