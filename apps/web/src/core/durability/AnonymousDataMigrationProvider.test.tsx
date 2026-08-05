/** @vitest-environment jsdom */
import { StrictMode, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const migrate = vi.fn<() => Promise<{ migratedRows: number }>>();
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
  migrateAnonymousDataToProfile: () => migrate(),
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
    migrate.mockReturnValue(new Promise((done) => (resolve = done)));
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
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(migrate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ migratedRows: 2 });
      await Promise.resolve();
    });
    await screen.findByText("module content");
    expect(success).toHaveBeenCalledTimes(1);
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

  // Юридичні тексти мають лишатись доступними за будь-якого стану синку.
  it("never blocks legal routes while the migration is unfinished", async () => {
    migrate.mockReturnValue(new Promise(() => {}));
    renderAt("/legal/privacy", <div>legal content</div>);

    await screen.findByText("legal content");
    expect(migrate).toHaveBeenCalledTimes(1);
  });
});
