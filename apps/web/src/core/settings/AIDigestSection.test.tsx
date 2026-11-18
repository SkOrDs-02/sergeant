/** @vitest-environment jsdom */
/**
 * Секція «Сержант» (`AIDigestSection`). PR-S8, рішення власника 2026-11-18
 * (варіант Б): тумблер «Повідомлення від Сержанта» переїхав сюди зі
 * «Сповіщень», тож секція тримає все, що Сержант робить сам, — звіт тижня і
 * повідомлення. Сховище не змінювалось (`sergeantNudges` у
 * `/api/me/preferences`), міграції немає.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSettingsSection } from "../../test/helpers/collapsibleSection";

const { meApiMock, pushState, toastWarningMock } = vi.hoisted(() => ({
  meApiMock: {
    getPreferences: vi.fn(async () => ({
      sergeantNudges: false,
      pushDailyCap: 2,
    })),
    updatePreferences: vi.fn(async (patch: { sergeantNudges?: boolean }) => ({
      sergeantNudges: patch.sergeantNudges ?? false,
      pushDailyCap: 2,
    })),
  },
  pushState: { subscribed: true },
  toastWarningMock: vi.fn(),
}));

// `useWeeklyDigest` тягне SQLite-читачі чотирьох модулів; секції досить
// форми `{ digest, weekRange }`.
vi.mock("../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({ digest: null, weekRange: "1–7 січня" }),
}));
vi.mock("@shared/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  meApi: meApiMock,
}));
vi.mock("@shared/hooks/usePushNotifications", () => ({
  usePushNotifications: () => pushState,
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning: toastWarningMock }),
}));

import { AIDigestSection } from "./AIDigestSection";
import { NotificationsSection } from "./NotificationsSection";

const NUDGES = "Повідомлення від Сержанта";

function stubNotification(
  permission: NotificationPermission,
  answer: NotificationPermission = "granted",
) {
  const fn = vi.fn(async () => answer);
  vi.stubGlobal("Notification", { permission, requestPermission: fn });
  return fn;
}

describe("AIDigestSection: усе, що Сержант робить сам (PR-S8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushState.subscribed = true;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("тримає і звіт тижня, і повідомлення від Сержанта", () => {
    stubNotification("granted");
    renderSettingsSection(<AIDigestSection />);
    expect(
      screen.getByRole("switch", { name: "Автогенерація щопонеділка" }),
    ).toBeTruthy();
    expect(screen.getByRole("switch", { name: NUDGES })).toBeTruthy();
  });

  it("пише той самий серверний прапорець `sergeantNudges`", async () => {
    stubNotification("granted");
    renderSettingsSection(<AIDigestSection />);
    await waitFor(() => expect(meApiMock.getPreferences).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("switch", { name: NUDGES }));
    await waitFor(() =>
      expect(meApiMock.updatePreferences).toHaveBeenCalledWith({
        sergeantNudges: true,
      }),
    );
  });

  it("при вмиканні питає дозвіл браузера і попереджає, якщо його не дали", async () => {
    const request = stubNotification("default", "denied");
    renderSettingsSection(<AIDigestSection />);
    fireEvent.click(screen.getByRole("switch", { name: NUDGES }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    await waitFor(() => expect(toastWarningMock).toHaveBeenCalled());
  });

  it("без push-підписки чесно каже, що повідомлення йдуть push-ом", () => {
    stubNotification("granted");
    pushState.subscribed = false;
    renderSettingsSection(<AIDigestSection />);
    expect(screen.getByText(/увімкни push у «Сповіщеннях»/)).toBeTruthy();
  });

  it("з push-підпискою підказки про push немає", () => {
    stubNotification("granted");
    renderSettingsSection(<AIDigestSection />);
    expect(screen.queryByText(/увімкни push у «Сповіщеннях»/)).toBeNull();
  });
});

// Зворотний бік переїзду: у «Сповіщеннях» тумблера більше немає, інакше
// одне налаштування мало б два місця. Секція рендериться з реальними
// модульними хуками — тут перевіряється лише відсутність рядка.
describe("NotificationsSection після PR-S8", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("не містить тумблера «Повідомлення від Сержанта»", () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    expect(screen.queryByRole("switch", { name: NUDGES })).toBeNull();
  });
});
