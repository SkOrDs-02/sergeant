/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@shared/components/ui/Sheet", () => ({
  Sheet: ({
    open,
    onClose,
    title,
    description,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: ReactNode;
  }) =>
    open ? (
      <section role="dialog" aria-label={title}>
        {description && <p>{description}</p>}
        <button type="button" onClick={onClose}>
          Закрити
        </button>
        {children}
      </section>
    ) : null,
}));

vi.mock("./SyncRejectedList", () => ({
  SyncRejectedList: () => <div data-testid="sync-rejected-list" />,
}));

const opfsProbeRef: { value: Promise<unknown> } = {
  value: Promise.resolve({ kind: "ok" }),
};

const purgeNoticeRef: {
  value: { purged: number; purgedAtIso: string } | null;
} = { value: null };
const dismissOutboxPurgeNoticeMock = vi.fn();

vi.mock("../db/opfsProbe", () => ({
  probeOpfsInWorker: () => opfsProbeRef.value,
}));

vi.mock("../syncEngine/outboxPurgeNotice", () => ({
  useOutboxPurgeNotice: () => purgeNoticeRef.value,
  dismissOutboxPurgeNotice: () => dismissOutboxPurgeNoticeMock(),
}));

import { SyncStatusSheet } from "./SyncStatusSheet";
import {
  __resetActiveSqliteVfsForTests,
  noteActiveSqliteVfs,
} from "../db/storageBackendState";

describe("SyncStatusSheet", () => {
  afterEach(() => {
    cleanup();
    purgeNoticeRef.value = null;
    dismissOutboxPurgeNoticeMock.mockClear();
    opfsProbeRef.value = Promise.resolve({ kind: "ok" });
    __resetActiveSqliteVfsForTests();
  });

  // Доступу до Sentry є не в кожного, хто дивиться на цей аркуш, а
  // розслідування `SQLITE_IOERR` двічі просунулось саме тому, що
  // діагностика потрапила НА ЕКРАН і приїхала скріншотом. Тому стан
  // сховища читається тут, а не лише в дашборді.
  it("називає, де фізично лежить локальна база", async () => {
    noteActiveSqliteVfs("kvvfs");
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    expect(
      await screen.findByText(/Просте сховище браузера/),
    ).toBeInTheDocument();
  });

  it("показує відповідь розвідки OPFS, а не ховає її", async () => {
    opfsProbeRef.value = Promise.resolve({
      kind: "unavailable",
      reason: "async close() — OPFS API too old",
    });
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    // Причина має бути видимою дослівно: «ні» без причини вже одного разу
    // коштувало двох хибних гіпотез.
    expect(await screen.findByText(/OPFS API too old/)).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(
      <SyncStatusSheet
        open={false}
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("summarizes healthy online sync state without a retry button", () => {
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Синхронізація" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Стан збереження даних у хмару"),
    ).toBeInTheDocument();
    expect(screen.getByText("Онлайн")).toBeInTheDocument();
    expect(screen.getByText("Нічого не чекає")).toBeInTheDocument();
    // «Помилки» і «Не прийнято сервером» — обидва порожні.
    expect(screen.getAllByText("Немає")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Повторити синхронізацію" }),
    ).not.toBeInTheDocument();
  });

  it("shows offline queue/errors and retries before closing", () => {
    const onClose = vi.fn();
    const onRetry = vi.fn(() => Promise.resolve());
    render(
      <SyncStatusSheet
        open
        onClose={onClose}
        online={false}
        pending={3}
        deadLetter={2}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Офлайн")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Повторити синхронізацію" }),
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sync-rejected-list")).not.toBeInTheDocument();
  });

  it("surfaces server-rejected rows with their list when there are any", () => {
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
        rejected={2}
      />,
    );
    expect(screen.getByText("Не прийнято сервером")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByTestId("sync-rejected-list")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Повторити синхронізацію" }),
    ).not.toBeInTheDocument();
  });

  // PR-T2 (2026-09-13 product review, "Тиха втрата даних"): the boot-time
  // TTL sweep silently deleted terminal outbox rows; this note is the
  // fix — it must be visible and dismissible.
  it("shows the outbox-purge notice and dismisses it", () => {
    purgeNoticeRef.value = {
      purged: 3,
      purgedAtIso: "2026-09-10T12:00:00.000Z",
    };
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );

    expect(screen.getByText("Старі записи прибрано")).toBeInTheDocument();
    expect(
      screen.getByText(/3 старі записи синхронізації/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    expect(dismissOutboxPurgeNoticeMock).toHaveBeenCalledTimes(1);
  });

  it("does not show the outbox-purge notice when nothing was purged", () => {
    render(
      <SyncStatusSheet
        open
        onClose={vi.fn()}
        online
        pending={0}
        deadLetter={0}
      />,
    );
    expect(screen.queryByText("Старі записи прибрано")).not.toBeInTheDocument();
  });
});
