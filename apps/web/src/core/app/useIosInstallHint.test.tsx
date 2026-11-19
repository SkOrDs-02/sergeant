// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { IosInstallPushHint } from "@shared/components/ui/IosInstallPushHint";
import {
  __resetStorageReadyForTests,
  markStorageBooting,
  markStorageReady,
} from "../db/storageReady";

/**
 * О-1 (а): рядок «Встанови Sergeant на початковий екран» у дзвонику хаба
 * на iPhone у вкладці Safari з другої сесії. Перевіряємо, що він
 * показується, закривається назавжди, шле наявні події воронки
 * встановлення і не дублює підказку з тумблера нагадувань (О-1 (б)).
 */

const trackEventMock = vi.fn();
vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const platform = vi.hoisted(() => ({ iosBrowserTab: true }));
vi.mock("@shared/lib/platform/iosStandalone", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@shared/lib/platform/iosStandalone")
  >()),
  isIOSBrowserTab: () => platform.iosBrowserTab,
}));

import { NotificationBell } from "./NotificationBell";
import { useIosInstallHint } from "./useIosInstallHint";

const copy = messages.iosInstallHint;

function Harness({ enabled = true }: { enabled?: boolean }) {
  const hint = useIosInstallHint(enabled);
  return (
    <NotificationBell
      notifications={hint.notification ? [hint.notification] : []}
    />
  );
}

function openBell() {
  fireEvent.click(screen.getByRole("button", { name: /Сповіщення/ }));
}

function prompted() {
  return trackEventMock.mock.calls.filter(
    ([name]) => name === "pwa_install_prompted",
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  trackEventMock.mockReset();
  platform.iosBrowserTab = true;
  __resetStorageReadyForTests();
});

afterEach(() => {
  cleanup();
});

/** Попередній візит уже зараховано: цей запуск буде другою сесією. */
function seedPreviousVisit() {
  window.localStorage.setItem(STORAGE_KEYS.PWA_SESSION_COUNT, "1");
}

describe("useIosInstallHint у дзвонику", () => {
  it("друга сесія в Safari на iPhone → рядок зʼявляється, подія показу одна", () => {
    seedPreviousVisit();
    const { rerender } = render(<Harness />);
    openBell();
    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.body)).toBeTruthy();
    rerender(<Harness />);
    expect(prompted()).toEqual([["pwa_install_prompted", { surface: "ios" }]]);
  });

  it("«Зрозуміло» закриває назавжди і шле відмову", () => {
    seedPreviousVisit();
    render(<Harness />);
    openBell();
    fireEvent.click(screen.getByRole("button", { name: copy.bellAction }));
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_dismissed", {
      surface: "ios",
      via: "banner",
    });
    expect(
      window.localStorage.getItem(STORAGE_KEYS.IOS_INSTALL_HINT_DISMISSED),
    ).toBe("1");

    // Новий візит: закрите не повертається.
    cleanup();
    window.sessionStorage.clear();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
  });

  it("перша сесія → нічого; перезавантаження її не робить другою", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
    cleanup();
    // Reload тієї самої вкладки: sessionStorage живий.
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.PWA_SESSION_COUNT)).toBe(
      "1",
    );
  });

  it("не iOS чи вже встановлений застосунок → нічого", () => {
    platform.iosBrowserTab = false;
    seedPreviousVisit();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
    expect(prompted()).toHaveLength(0);
  });

  it("стара явна відмова банера («не нагадувати») теж глушить", () => {
    seedPreviousVisit();
    window.localStorage.setItem(STORAGE_KEYS.IOS_BANNER_DISMISSED, "1");
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
  });

  it("підказку вже показано під тумблером нагадувань у цьому візиті → рядка немає", () => {
    seedPreviousVisit();
    const inline = render(<IosInstallPushHint />);
    inline.unmount();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
    expect(prompted()).toHaveLength(0);
  });

  it("до готовності сховища нічого не рахує і не показує", () => {
    seedPreviousVisit();
    markStorageBooting();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.PWA_SESSION_COUNT)).toBe(
      "1",
    );
    act(() => markStorageReady());
    expect(screen.getByRole("button", { name: /Сповіщення/ })).toBeTruthy();
  });

  it("вимкнено (вікно першого запису) → нічого", () => {
    seedPreviousVisit();
    render(<Harness enabled={false} />);
    expect(screen.queryByRole("button", { name: /Сповіщення/ })).toBeNull();
  });
});
