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
      screen.getByRole("switch", { name: "Автогенерація звіту" }),
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
    expect(screen.getByText(/Увімкни його у «Сповіщеннях»/)).toBeTruthy();
  });

  it("з push-підпискою підказки про push немає", () => {
    stubNotification("granted");
    renderSettingsSection(<AIDigestSection />);
    expect(screen.queryByText(/Увімкни його у «Сповіщеннях»/)).toBeNull();
  });
});

// С-3 (а), рішення власника 2026-11-18 (OD-30): автогенерація спрацьовує
// при першому відкритті головної після завершення тижня, а не лише в
// понеділок, тож налаштування більше не обіцяють «щопонеділка».
describe("AIDigestSection — текст автогенерації", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushState.subscribed = true;
    stubNotification("granted");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("описує нову поведінку і не обіцяє понеділок", () => {
    renderSettingsSection(<AIDigestSection />);
    expect(screen.getByText("Автогенерація звіту")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Звіт збирається при першому відкритті головної після кінця тижня. Ліміт дій Сержанта не витрачає.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/щопонеділка/)).toBeNull();
    // Під рядком «Поточний тиждень» слова «цей тиждень» читались як поточний.
    expect(screen.queryByText(/за цей тиждень/)).toBeNull();
  });

  it("абзац над тумблером без подвійного «і» і однозначно про тиждень, що минув", () => {
    renderSettingsSection(<AIDigestSection />);
    expect(
      screen.getByText(
        "Підсумок тижня від Сержанта: фінанси, тренування, харчування й звички. Шукай його на головній, у блоці «Звіт тижня».",
      ),
    ).toBeInTheDocument();
  });
});

// О-1 (б), рішення власника 2026-11-18: на iPhone у вкладці Safari push
// неможливий. Тумблер «Повідомлення від Сержанта» (після PR-S8 він тут)
// показує, як встановити застосунок, і нічого не пише на сервер.
describe("AIDigestSection: iPhone у вкладці Safari", () => {
  const INSTALL_HINT = /Встанови Sergeant на початковий екран/;

  beforeEach(() => {
    vi.clearAllMocks();
    pushState.subscribed = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("показує підказку встановлення, тумблер лишається вимкненим, тосту немає", async () => {
    vi.stubGlobal("navigator", {
      ...window.navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: false,
    });
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal("Notification", undefined);
    renderSettingsSection(<AIDigestSection />);
    expect(screen.queryByText(INSTALL_HINT)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: NUDGES }));
    expect(await screen.findByText(INSTALL_HINT)).toBeTruthy();
    expect(meApiMock.updatePreferences).not.toHaveBeenCalled();
    expect(toastWarningMock).not.toHaveBeenCalled();
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
