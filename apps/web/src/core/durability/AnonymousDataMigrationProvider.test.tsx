/** @vitest-environment jsdom */
import { StrictMode, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MigrateOptions {
  onTransferStart?: () => void;
}
const migrate =
  vi.fn<(options?: MigrateOptions) => Promise<{ migratedRows: number }>>();
const success = vi.fn();
const warning = vi.fn();
const bootReader = vi.fn(async () => ({ pullOnce: vi.fn() }));
const bootWriter = vi.fn(async () => ({ flushNow: vi.fn() }));
const switchSqliteUser = vi.fn(async () => {});
// Порядок викликів між модулями — партиція мусить перемкнутись ДО boot-у,
// інакше тік синку покладе серверні рядки в анонімну базу.
const bootOrder: string[] = [];

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    status: "authenticated",
  }),
}));
vi.mock("./anonymousDataMigration.js", () => ({
  migrateAnonymousDataToProfile: (_userId: string, options?: MigrateOptions) =>
    migrate(options),
}));
vi.mock("../syncEngine/singleton.js", () => ({
  bootSyncEngineReader: () => {
    bootOrder.push("reader");
    return bootReader();
  },
  bootSyncEngineWriter: () => {
    bootOrder.push("writer");
    return bootWriter();
  },
}));
vi.mock("../db/sqlite.js", () => ({
  switchSqliteUser: (userId: string | null) => {
    bootOrder.push(`switch:${String(userId)}`);
    return switchSqliteUser();
  },
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success, warning }),
}));

import {
  AnonymousDataMigrationProvider,
  PROBE_GRACE_MS,
  __resetAnonymousMigrationSingleFlightForTests,
} from "./AnonymousDataMigrationProvider";

function renderAt(path: string, children: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AnonymousDataMigrationProvider>
        {children}
      </AnonymousDataMigrationProvider>
    </MemoryRouter>,
  );
}

describe("AnonymousDataMigrationProvider", () => {
  beforeEach(() => {
    migrate.mockReset();
    success.mockReset();
    warning.mockReset();
    bootReader.mockClear();
    bootWriter.mockClear();
    switchSqliteUser.mockClear();
    bootOrder.length = 0;
    localStorage.clear();
    __resetAnonymousMigrationSingleFlightForTests();
  });

  it("blocks module children and runs one migration under StrictMode", async () => {
    let resolve!: (value: { migratedRows: number }) => void;
    migrate.mockImplementation((options) => {
      // Розвідка знайшла рядки — саме з цієї миті гейт має право показати
      // «Переносимо дані…». Без сигналу панель лишається прихованою.
      options?.onTransferStart?.();
      return new Promise((done) => (resolve = done));
    });
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <AnonymousDataMigrationProvider>
            <div>module content</div>
          </AnonymousDataMigrationProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(screen.queryByText("module content")).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(migrate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ migratedRows: 2 });
      await Promise.resolve();
    });
    await screen.findByText("module content");
    expect(success).toHaveBeenCalledTimes(1);
  });

  // Регресія: гейт монтується на КОЖНОМУ старті авторизованої сесії, і раніше
  // повноекранне «Переносимо дані в профіль…» показувалось увесь час роботи
  // переносу — включно з найчастішим випадком, коли переносити нема чого.
  // Після будь-якого перезавантаження (у тому числі автоматичного з
  // `chunkReload`) користувач бачив тривожний текст без жодного перенесення.
  it("keeps the migration panel hidden while probing finds nothing to migrate", async () => {
    let resolve!: (value: { migratedRows: number }) => void;
    // Розвідка триває, але `onTransferStart` не викликано — рядків немає.
    migrate.mockReturnValue(new Promise((done) => (resolve = done)));
    renderAt("/", <div>module content</div>);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Переносимо дані в профіль/),
    ).not.toBeInTheDocument();
    // Діти при цьому лишаються заблокованими: партиція SQLite зараз анонімна.
    expect(screen.queryByText("module content")).not.toBeInTheDocument();

    await act(async () => {
      resolve({ migratedRows: 0 });
      await Promise.resolve();
    });
    await screen.findByText("module content");
    expect(success).not.toHaveBeenCalled();
  });

  // Зворотний бік того ж рішення: якщо розвідка справді підвисла, порожній
  // екран не має виглядати як зависання.
  it("falls back to showing the panel when probing outlives the grace window", async () => {
    migrate.mockReturnValue(new Promise(() => {}));
    renderAt("/", <div>module content</div>);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Чекаємо сам таймер, а не вікно опитування. `findBy*` тут програвав
    // перегони на завантаженій машині: коли цикл подій блокується довше за
    // секунду, grace-таймер гейта й 1-секундний тайм-аут `waitFor`
    // стають готові в одній і тій самій фазі. `setProbeGraceElapsed` відпрацьовує
    // першим, але рендер React йде окремим завданням через MessageChannel,
    // тож тайм-аут встигає спрацювати раніше, ніж панель потрапить у DOM.
    // Власний таймер з пізнішим терміном такого порядку не має: він
    // гарантовано йде після grace-таймера, а `act` дочекується рендеру.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, PROBE_GRACE_MS + 50));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // Регресія ux-01 (аудит 2026-10-01): коли розвідка затяглась і панель
  // з'явилась лише через grace-таймер, `onTransferStart` не було — тобто
  // перенос не почався, і текст про нього був би хибним.
  it("shows a neutral loading text, not the transfer text, when the panel appears only via the grace timer", async () => {
    migrate.mockReturnValue(new Promise(() => {}));
    renderAt("/", <div>module content</div>);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, PROBE_GRACE_MS + 50));
    });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Завантаження…");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(
      screen.queryByText(/Переношу дані в профіль/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("module content")).not.toBeInTheDocument();
  });

  it("shows the transfer text once the migration reports onTransferStart", async () => {
    migrate.mockImplementation((options) => {
      options?.onTransferStart?.();
      return new Promise(() => {});
    });
    renderAt("/", <div>module content</div>);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Переношу дані в профіль/);
    expect(screen.queryByText("Завантаження…")).not.toBeInTheDocument();
  });

  // Обидві діри з browser QA 2026-08-04 (Obs-009). Синк-runtime-и раніше
  // жили в success-гілці переносу, тож будь-який шлях повз неї лишав сесію
  // без pull (reader) і без дренажу outbox (writer).
  it("boots both sync runtimes when there is nothing to migrate", async () => {
    // Звичайний вхід на чистому пристрої: анонімних даних нема, перенос
    // повертає 0 рядків раннім return-ом — саме той шлях, на якому writer
    // не піднімався ніколи.
    migrate.mockResolvedValue({ migratedRows: 0 });
    renderAt("/", <div>module content</div>);

    await screen.findByText("module content");
    // Навмисно «хоча б раз», а не точний лічильник: boot — fire-and-forget у
    // `finally`, тож повторний виклик нешкідливий (обидва boot-и повертають
    // наявний runtime), а рахувати виклики означало б ловити чужі хвости.
    await waitFor(() => {
      expect(bootReader).toHaveBeenCalled();
      expect(bootWriter).toHaveBeenCalled();
    });
  });

  it("boots both sync runtimes even when the migration fails", async () => {
    migrate.mockRejectedValue(new Error("offline"));
    renderAt("/", <div>module content</div>);

    await screen.findByRole("button", { name: "Повторити" });
    await waitFor(() => {
      expect(bootReader).toHaveBeenCalled();
      expect(bootWriter).toHaveBeenCalled();
    });
  });

  it("switches the sqlite partition to the user before booting sync", async () => {
    // Якщо перенос упав посеред cleanup-фази, активна партиція могла лишитись
    // анонімною. Runtime резолвить клієнта на кожному тіку, тож boot до
    // перемикання поклав би серверні рядки юзера в анонімну базу.
    migrate.mockRejectedValue(new Error("boom"));
    renderAt("/", <div>module content</div>);

    await waitFor(() => expect(bootWriter).toHaveBeenCalled());
    const firstSwitch = bootOrder.indexOf("switch:user-1");
    const firstReader = bootOrder.indexOf("reader");
    const firstWriter = bootOrder.indexOf("writer");
    expect(firstSwitch).toBeGreaterThanOrEqual(0);
    expect(firstSwitch).toBeLessThan(firstReader);
    expect(firstSwitch).toBeLessThan(firstWriter);
  });

  it("keeps the gate closed on failure and retries explicitly", async () => {
    migrate
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ migratedRows: 0 });
    renderAt("/", <div>module content</div>);

    const retry = await screen.findByRole("button", { name: "Повторити" });
    expect(screen.queryByText("module content")).not.toBeInTheDocument();
    await userEvent.click(retry);
    await screen.findByText("module content");
    await waitFor(() => expect(migrate).toHaveBeenCalledTimes(2));
    expect(success).not.toHaveBeenCalled();
  });

  // Провал переносу не має замикати застосунок: користувач мусить мати вихід,
  // інакше єдина детермінована помилка робить продукт непридатним після
  // реєстрації (QA перед бетою, 2026-08-01).
  it("lets the user defer a failed migration and keeps the app usable", async () => {
    migrate.mockRejectedValue(new Error("offline"));
    renderAt("/", <div>module content</div>);

    const defer = await screen.findByRole("button", {
      name: "Продовжити, перенесу пізніше",
    });
    await userEvent.click(defer);

    await screen.findByText("module content");
    expect(warning).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Дані ще не перенесено в профіль/),
    ).toBeInTheDocument();
  });

  it("remembers the deferral across remounts instead of re-blocking", async () => {
    migrate.mockRejectedValue(new Error("offline"));
    const first = renderAt("/", <div>module content</div>);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Продовжити, перенесу пізніше",
      }),
    );
    await screen.findByText("module content");
    first.unmount();
    __resetAnonymousMigrationSingleFlightForTests();

    renderAt("/", <div>module content</div>);
    await screen.findByText("module content");
    expect(
      screen.queryByRole("button", { name: "Повторити" }),
    ).not.toBeInTheDocument();
  });

  // Регресія 2026-09-13 (звіт власника, PWA): плашка була простим сусідом
  // застосунку всередині `#root`, а той має фіксовану висоту й
  // `overflow: hidden`. Shell (`h-app-dvh` = `height: 100%` від рута)
  // зсовувався вниз рівно на висоту плашки, і нижній навбар виїжджав за
  // обрізаний край — застосунок лишався без навігації. Тримаємо контракт
  // верстки: плашка й діти — сусіди у flex-колонці, діти беруть залишок.
  it("тримає плашку й застосунок у flex-колонці, щоб навбар не виїхав", async () => {
    migrate.mockRejectedValue(new Error("boom"));
    renderAt("/", <div>module content</div>);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Продовжити, перенесу пізніше",
      }),
    );
    const content = await screen.findByText("module content");

    const notice = screen.getByText(/Дані ще не перенесено в профіль/)
      .parentElement as HTMLElement;
    const childrenSlot = content.parentElement as HTMLElement;
    expect(notice.parentElement).toBe(childrenSlot.parentElement);
    const column = notice.parentElement as HTMLElement;
    expect(column.className).toContain("flex-col");
    expect(column.className).toContain("h-full");
    // Плашка не стискається, застосунок забирає весь залишок висоти.
    expect(notice.className).toContain("shrink-0");
    expect(childrenSlot.className).toContain("flex-1");
    expect(childrenSlot.className).toContain("min-h-0");
    // Друга половина того ж звіту: текст заїжджав під динамічний острів.
    expect(notice.className).toContain("safe-area-inset-top");
  });

  // Той самий екран на LTE у метро: браузер сам каже, що мережі немає, і
  // тривожний текст про «незахищені синхронізацією» дані там просто
  // неправдивий — збою переносу не було, був обрив звʼязку.
  it("на офлайн-обриві показує причину, а не загальний текст збою", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      // Формулювання Safari для зірваного fetch — його і класифікує
      // `tickErrorReport` як транспортне.
      migrate.mockRejectedValue(new TypeError("Load failed"));
      renderAt("/", <div>module content</div>);

      expect(await screen.findByText(/Немає звʼязку/)).toBeInTheDocument();
      expect(
        screen.queryByText(/ще не захищені синхронізацією/),
      ).not.toBeInTheDocument();
    } finally {
      online.mockRestore();
    }
  });

  // Звіт власника прийшов трьома скріншотами одного й того самого тексту —
  // діагностувати не було чим. Причина має бути В КАДРІ, бо людина шле фото
  // екрана, а не заглядає в Sentry. Але саме причина: службовий префікс
  // кроку і `[vfs=… disk=…]` адресовані нам і лишаються в Sentry-повідомленні
  // (другий звіт власника, 2026-09-21).
  it("показує причину збою на екрані, без службового префікса і vfs", async () => {
    const error = Object.assign(
      new Error(
        "anon-migration/pull-before: Забагато запитів. Спробуй через 17 секунд. " +
          "[vfs=kvvfs disk=14/10254MB]",
      ),
      {
        name: "AnonymousMigrationStepError",
        step: "pull-before",
        detail: "Забагато запитів. Спробуй через 17 секунд.",
      },
    );
    migrate.mockRejectedValue(error);
    renderAt("/", <div>module content</div>);

    expect(
      await screen.findByText(
        "pull-before: Забагато запитів. Спробуй через 17 секунд.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/anon-migration\//)).not.toBeInTheDocument();
    expect(screen.queryByText(/vfs=/)).not.toBeInTheDocument();
  });

  // Зворотний бік: чужа помилка (не з нашого кроку) має показати технічний
  // клас збою, але не випадковий текст рушія.
  it("показує санітизований код, коли помилка не з переносу", async () => {
    migrate.mockRejectedValue(new TypeError("Load failed"));
    renderAt("/", <div>module content</div>);

    await screen.findByRole("button", { name: "Повторити" });
    expect(screen.getByText("unknown: TypeError")).toBeInTheDocument();
    expect(screen.queryByText(/Load failed/)).not.toBeInTheDocument();
  });

  it("показує крок і fallback, коли StepError має порожню причину", async () => {
    const error = Object.assign(new Error("anon-migration/claim: "), {
      name: "AnonymousMigrationStepError",
      step: "claim",
      detail: "",
    });
    migrate.mockRejectedValue(error);
    renderAt("/", <div>module content</div>);

    expect(await screen.findByText("claim: unknown")).toBeInTheDocument();
  });

  // Юридичні тексти мають лишатись доступними за будь-якого стану синку.
  it("never blocks legal routes while the migration is unfinished", async () => {
    migrate.mockReturnValue(new Promise(() => {}));
    renderAt("/legal/privacy", <div>legal content</div>);

    await screen.findByText("legal content");
    expect(migrate).toHaveBeenCalledTimes(1);
  });
});
