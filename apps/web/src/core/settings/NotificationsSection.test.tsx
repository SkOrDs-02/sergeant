/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSettingsSection } from "../../test/helpers/collapsibleSection";

const {
  toastWarningMock,
  routineState,
  updateRoutinePrefMock,
  monthlyPlanState,
  loadNutritionPrefsMock,
  patchNutritionPrefsMock,
  nutritionHydration,
  pushState,
  meApiMock,
} = vi.hoisted(() => ({
  toastWarningMock: vi.fn(),
  routineState: {
    routine: { prefs: { routineRemindersEnabled: false } },
  },
  updateRoutinePrefMock: vi.fn(),
  monthlyPlanState: {
    reminderEnabled: false,
    reminderHour: 9,
    reminderMinute: 0,
    setReminderEnabled: vi.fn(),
    setReminder: vi.fn(),
  },
  loadNutritionPrefsMock: vi.fn(
    (): { reminderEnabled: boolean; reminderHour?: number } => ({
      reminderEnabled: false,
    }),
  ),
  patchNutritionPrefsMock: vi.fn(),
  // data-04: гідратацію prefs керує тест (за замовчуванням гідратовано).
  nutritionHydration: { value: true },
  pushState: { subscribed: false },
  meApiMock: {
    getPreferences: vi.fn(async () => ({
      sergeantNudges: false,
      pushDailyCap: 2,
    })),
    updatePreferences: vi.fn(async (patch: { pushDailyCap?: number }) => ({
      sergeantNudges: false,
      pushDailyCap: patch.pushDailyCap ?? 2,
    })),
  },
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning: toastWarningMock }),
}));
// `requestNotificationPermission` не мокаємо (бюджет vi.mock) — вона тонко
// делегує до глобального `Notification.requestPermission()`, який тест
// уже стабить через `stubNotification`.
vi.mock("../../modules/routine/hooks/useRoutineState", () => ({
  useRoutineState: () => ({
    routine: routineState.routine,
    updatePref: updateRoutinePrefMock,
  }),
}));
vi.mock("../../modules/fizruk/hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: () => monthlyPlanState,
}));
// Справжній `useNutritionPrefsSnapshot` читає саме ці два експорти; гідратацію
// prefs (data-04) керує тест.
vi.mock("../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionPrefs: () => loadNutritionPrefsMock(),
  loadLatestNutritionPrefs: () => loadNutritionPrefsMock(),
  isNutritionPrefsHydrated: () => nutritionHydration.value,
  patchNutritionPrefs: patchNutritionPrefsMock,
}));
vi.mock("../components/PushNotificationToggle", () => ({
  PushNotificationToggle: () => <div data-testid="push-toggle" />,
}));
// Секція читає стан підписки, щоб не обіцяти доставку при закритому
// застосунку тим, у кого пуш не увімкнено.
vi.mock("@shared/hooks/usePushNotifications", () => ({
  usePushNotifications: () => pushState,
}));
// Серверні налаштування (Сержант і стеля нагадувань) читаються з
// `/api/me/preferences`; решта `@shared/api` лишається справжньою.
vi.mock("@shared/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  meApi: meApiMock,
}));

import { setActiveModules } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { NotificationsSection } from "./NotificationsSection";

// Шукаємо перемикач за підписом рядка, а не за позицією у дереві. Раніше
// тут стояли індекси (routine: 0, fizruk: 1, …), і додавання четвертого
// тумблера вгорі секції зсунуло всі три — тести падали не тому, що щось
// зламалось, а тому, що поруч зʼявився сусід.
const SWITCH_LABEL = {
  routine: "Нагадування про звички",
  fizruk: "Нагадування про тренування",
  nutrition: "Нагадування про їжу",
} as const;

// Шукаємо тумблер за ДОСТУПНИМ ІМЕНЕМ, а не за DOM-сусідством. Доти
// тут стояло `getByText(...).closest("label")` + пошук усередині: рядок
// `ToggleRow` сам був `<label>`, який обгортав і підпис, і `Switch`.
// Після фіксу `[critical] label: Form elements must have labels` (axe на
// `/settings`) рядок — звичайний `<div>`, а `<label htmlFor>` — тільки
// сам підпис, тож `closest("label")` більше не веде до тумблера. Запит
// за іменем стійкіший саме тому, що резолвиться тим самим
// accname-алгоритмом, що й axe: якщо він знову знайде тумблер — значить
// імʼя на місці.
function clickSwitch(which: keyof typeof SWITCH_LABEL) {
  const toggle = screen.getByRole("switch", { name: SWITCH_LABEL[which] });
  fireEvent.click(toggle);
}

function stubNotification(permission: NotificationPermission) {
  const fn = vi.fn(async () => "granted" as NotificationPermission);
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: fn,
  });
  return fn;
}

describe("NotificationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routineState.routine = { prefs: { routineRemindersEnabled: false } };
    monthlyPlanState.reminderEnabled = false;
    loadNutritionPrefsMock.mockReturnValue({ reminderEnabled: false });
    nutritionHydration.value = true;
    pushState.subscribed = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("значення рядка: «Недоступно», коли браузер заблокував чи не вміє push", () => {
    const group = () => screen.getByRole("button", { name: "Сповіщення" });
    stubNotification("denied");
    const { unmount } = renderSettingsSection(<NotificationsSection />);
    expect(group()).toHaveAccessibleDescription("Недоступно");
    unmount();

    vi.unstubAllGlobals();
    vi.stubGlobal("Notification", undefined);
    const second = renderSettingsSection(<NotificationsSection />);
    expect(group()).toHaveAccessibleDescription("Недоступно");
    second.unmount();

    stubNotification("granted");
    pushState.subscribed = true;
    renderSettingsSection(<NotificationsSection />);
    expect(group()).toHaveAccessibleDescription("Push увімкнено");
  });

  it("shows the 'allow' button when permission is default", () => {
    stubNotification("default");
    renderSettingsSection(<NotificationsSection />);
    expect(screen.getByText("Не встановлено")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Дозволити" }),
    ).toBeInTheDocument();
  });

  it("shows the granted label and hides the allow button", () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    expect(screen.getByText("Дозволено")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Дозволити" }),
    ).not.toBeInTheDocument();
  });

  it("requests permission and warns when denied", async () => {
    const reqFn = stubNotification("default");
    reqFn.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    fireEvent.click(screen.getByRole("button", { name: "Дозволити" }));
    await waitFor(() => expect(reqFn).toHaveBeenCalled());
    await waitFor(() => expect(toastWarningMock).toHaveBeenCalled());
  });

  it("enables the routine reminder pref once permission is granted", async () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("routine");
    await waitFor(() =>
      expect(updateRoutinePrefMock).toHaveBeenCalledWith(
        "routineRemindersEnabled",
        true,
      ),
    );
  });

  it("does not enable routine reminders when permission is refused", async () => {
    const reqFn = stubNotification("default");
    reqFn.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("routine");
    await waitFor(() => expect(reqFn).toHaveBeenCalled());
    expect(updateRoutinePrefMock).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalled();
  });

  it("toggles the fizruk reminder when permission is granted", async () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("fizruk");
    await waitFor(() =>
      expect(monthlyPlanState.setReminderEnabled).toHaveBeenCalledWith(true),
    );
  });

  it("shows the fizruk time input when the reminder is enabled", () => {
    stubNotification("granted");
    monthlyPlanState.reminderEnabled = true;
    monthlyPlanState.reminderHour = 8;
    monthlyPlanState.reminderMinute = 30;
    renderSettingsSection(<NotificationsSection />);
    const timeInput = document.querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    expect(timeInput.value).toBe("08:30");
    fireEvent.change(timeInput, { target: { value: "10:15" } });
    expect(monthlyPlanState.setReminder).toHaveBeenCalledWith(10, 15);
  });

  it("не скидає час плану на 00:00, коли пікер очищено", () => {
    stubNotification("granted");
    monthlyPlanState.reminderEnabled = true;
    renderSettingsSection(<NotificationsSection />);
    const timeInput = document.querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: "10:15" } });
    monthlyPlanState.setReminder.mockClear();
    fireEvent.change(timeInput, { target: { value: "" } });
    expect(monthlyPlanState.setReminder).not.toHaveBeenCalled();
  });

  // Пін на контракт ширини нативного контрола. `[min-inline-size:0]` дає
  // лише спільний примітив (`TimeField`); сирий `<input type="time">` у
  // flex-рядку його НЕ мав, і нативний intrinsic inline-size розпирав
  // рядок. Chromium цього не відтворює (заміряно 2026-09-15), тож юніт —
  // єдиний гейт: docs/start/instructions/fix-mobile-horizontal-overflow.md
  it("тримає поле часу в межах рядка — жодного intrinsic-розпирання", () => {
    stubNotification("granted");
    monthlyPlanState.reminderEnabled = true;
    renderSettingsSection(<NotificationsSection />);
    const timeInput = document.querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    expect(timeInput.className).toContain("[min-inline-size:0]");
  });

  it("persists nutrition reminder pref on toggle", async () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("nutrition");
    await waitFor(() =>
      // Лише змінене поле: решту prefs бере з кешу `patchNutritionPrefs`.
      expect(patchNutritionPrefsMock).toHaveBeenCalledWith({
        reminderEnabled: true,
      }),
    );
  });

  it("data-04: до гідратації тумблер нагадування заблокований і нічого не пише", async () => {
    stubNotification("granted");
    nutritionHydration.value = false;
    renderSettingsSection(<NotificationsSection />);
    const toggle = screen.getByRole("switch", { name: SWITCH_LABEL.nutrition });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    await Promise.resolve();
    expect(patchNutritionPrefsMock).not.toHaveBeenCalled();
  });

  it("округлює дробову годину нагадування про їжу вниз", () => {
    stubNotification("granted");
    loadNutritionPrefsMock.mockReturnValue({
      reminderEnabled: true,
      reminderHour: 12,
    });
    renderSettingsSection(<NotificationsSection />);
    const hourInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    fireEvent.change(hourInput, { target: { value: "8.5" } });
    expect(patchNutritionPrefsMock).toHaveBeenCalledWith({ reminderHour: 8 });
  });

  it("data-04: година нагадування до гідратації заблокована", () => {
    stubNotification("granted");
    nutritionHydration.value = false;
    loadNutritionPrefsMock.mockReturnValue({
      reminderEnabled: true,
      reminderHour: 12,
    });
    renderSettingsSection(<NotificationsSection />);
    const hourInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(hourInput).toBeDisabled();
  });

  it("does not enable the fizruk reminder when permission is refused", async () => {
    const reqFn = stubNotification("default");
    reqFn.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("fizruk");
    await waitFor(() => expect(reqFn).toHaveBeenCalled());
    expect(monthlyPlanState.setReminderEnabled).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalled();
  });

  it("does not persist the nutrition reminder when permission is refused", async () => {
    const reqFn = stubNotification("default");
    reqFn.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("nutrition");
    await waitFor(() => expect(reqFn).toHaveBeenCalled());
    expect(patchNutritionPrefsMock).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalled();
  });

  it("edits the nutrition reminder hour when the reminder is on", () => {
    stubNotification("granted");
    loadNutritionPrefsMock.mockReturnValue({
      reminderEnabled: true,
      reminderHour: 12,
    });
    renderSettingsSection(<NotificationsSection />);
    const hourInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(hourInput).not.toBeNull();
    fireEvent.change(hourInput, { target: { value: "20" } });
    expect(patchNutritionPrefsMock).toHaveBeenCalledWith({ reminderHour: 20 });
  });

  it("clamps the nutrition reminder hour into the 0-23 range", () => {
    stubNotification("granted");
    loadNutritionPrefsMock.mockReturnValue({
      reminderEnabled: true,
      reminderHour: 12,
    });
    renderSettingsSection(<NotificationsSection />);
    const hourInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    fireEvent.change(hourInput, { target: { value: "99" } });
    expect(patchNutritionPrefsMock).toHaveBeenCalledWith({ reminderHour: 23 });
  });

  it("renders 'unsupported' when Notification is missing", () => {
    vi.stubGlobal("Notification", undefined);
    renderSettingsSection(<NotificationsSection />);
    expect(screen.getByText("Не підтримується")).toBeInTheDocument();
  });

  // Регресія: три перемикачі обіцяли «навіть коли застосунок закрито» —
  // і це була неправда, бо нагадування вів локальний таймер, який помирав
  // разом із вкладкою. Тепер їх шле сервер, але тільки за наявності живої
  // push-підписки, тож обіцянка стала умовною.
  it("зберігає стелю нагадувань на сервері", async () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "2" })).toBeChecked(),
    );
    fireEvent.click(screen.getByRole("radio", { name: "1" }));
    await waitFor(() =>
      expect(meApiMock.updatePreferences).toHaveBeenCalledWith({
        pushDailyCap: 1,
      }),
    );
    expect(screen.getByRole("radio", { name: "1" })).toBeChecked();
  });

  it("на нулі прямо каже, що нагадувань не буде", async () => {
    stubNotification("granted");
    // Два хуки секції (Сержант і стеля) читають налаштування окремо.
    const zero = { sergeantNudges: false, pushDailyCap: 0 };
    meApiMock.getPreferences
      .mockResolvedValueOnce(zero)
      .mockResolvedValueOnce(zero);
    renderSettingsSection(<NotificationsSection />);
    expect(await screen.findByText(/Нагадування вимкнені/)).toBeInTheDocument();
  });

  it("не обіцяє фонову доставку без push-підписки", () => {
    renderSettingsSection(<NotificationsSection />);
    expect(
      screen.getAllByText(/увімкни push-сповіщення вище/).length,
    ).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/навіть коли застосунок закрито/)).toBeNull();
  });

  it("обіцяє фонову доставку, коли підписка є", () => {
    pushState.subscribed = true;
    renderSettingsSection(<NotificationsSection />);
    expect(
      screen.getAllByText(/навіть коли застосунок закрито/).length,
    ).toBeGreaterThanOrEqual(3);
  });

  // О-1 (б): на iPhone у вкладці Safari `Notification` немає, push
  // неможливий. Замість хибного тосту «дозволь у налаштуваннях браузера»
  // (такого пункту на iOS не існує) людина бачить, як встановити застосунок.
  describe("iPhone/iPad у вкладці Safari (застосунок не встановлено)", () => {
    const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
    const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
    const INSTALL_HINT = /Встанови Sergeant на початковий екран/;

    function setEnv(opts: { ua: string; standalone?: boolean }) {
      vi.stubGlobal("navigator", {
        ...window.navigator,
        userAgent: opts.ua,
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: opts.standalone ?? false,
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
    }

    it("звички: показує підказку встановлення, тумблер лишається вимкненим, тосту немає", async () => {
      setEnv({ ua: IPHONE_UA });
      vi.stubGlobal("Notification", undefined);
      renderSettingsSection(<NotificationsSection />);
      expect(screen.queryByText(INSTALL_HINT)).toBeNull();
      clickSwitch("routine");
      expect(await screen.findByText(INSTALL_HINT)).toBeInTheDocument();
      expect(updateRoutinePrefMock).not.toHaveBeenCalled();
      expect(toastWarningMock).not.toHaveBeenCalled();
      expect(
        screen.getByRole("switch", { name: SWITCH_LABEL.routine }),
      ).toHaveAttribute("aria-checked", "false");
    });

    it("підказка названа за кроками iOS і доступна читалці без автозакриття", async () => {
      setEnv({ ua: IPHONE_UA });
      vi.stubGlobal("Notification", undefined);
      renderSettingsSection(<NotificationsSection />);
      clickSwitch("routine");
      const hint = await screen.findByRole("status");
      expect(hint).toHaveTextContent("«Поділитися»");
      expect(hint).toHaveTextContent("«На початковий екран»");
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole("status")).toBe(hint);
    });

    it("тренування і їжа: той самий шлях, нічого не записується", async () => {
      setEnv({ ua: IPHONE_UA });
      vi.stubGlobal("Notification", undefined);
      renderSettingsSection(<NotificationsSection />);

      clickSwitch("fizruk");
      expect(await screen.findByText(INSTALL_HINT)).toBeInTheDocument();
      expect(monthlyPlanState.setReminderEnabled).not.toHaveBeenCalled();

      clickSwitch("nutrition");
      await waitFor(() =>
        expect(screen.getAllByText(INSTALL_HINT).length).toBeGreaterThan(0),
      );
      expect(patchNutritionPrefsMock).not.toHaveBeenCalled();
      // «Повідомлення від Сержанта» переїхали в секцію «Сержант» (PR-S8):
      // той самий iOS-шлях пінить `AIDigestSection.test.tsx`.
    });

    it("вимкнення не показує підказку", async () => {
      setEnv({ ua: IPHONE_UA });
      vi.stubGlobal("Notification", undefined);
      routineState.routine = { prefs: { routineRemindersEnabled: true } };
      renderSettingsSection(<NotificationsSection />);
      clickSwitch("routine");
      await waitFor(() =>
        expect(updateRoutinePrefMock).toHaveBeenCalledWith(
          "routineRemindersEnabled",
          false,
        ),
      );
      expect(screen.queryByText(INSTALL_HINT)).toBeNull();
    });

    it("встановлений PWA на iOS: старий шлях із запитом дозволу", async () => {
      setEnv({ ua: IPHONE_UA, standalone: true });
      stubNotification("granted");
      renderSettingsSection(<NotificationsSection />);
      clickSwitch("routine");
      await waitFor(() =>
        expect(updateRoutinePrefMock).toHaveBeenCalledWith(
          "routineRemindersEnabled",
          true,
        ),
      );
      expect(screen.queryByText(INSTALL_HINT)).toBeNull();
    });

    it("Android: запит дозволу й тост при відмові, без підказки", async () => {
      setEnv({ ua: ANDROID_UA });
      vi.stubGlobal("navigator", {
        ...window.navigator,
        userAgent: ANDROID_UA,
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      });
      const reqFn = stubNotification("default");
      reqFn.mockResolvedValue("denied");
      renderSettingsSection(<NotificationsSection />);
      clickSwitch("routine");
      await waitFor(() => expect(reqFn).toHaveBeenCalled());
      expect(updateRoutinePrefMock).not.toHaveBeenCalled();
      expect(toastWarningMock).toHaveBeenCalled();
      expect(screen.queryByText(INSTALL_HINT)).toBeNull();
    });
  });

  // Спека notifications-quiet-hours-and-device-time, § Викочування: новий
  // веб проти старого бекенду не показує контролів, які нічого не зберегли б.
  describe("тихі години і тумблер Monobank (міграція 168)", () => {
    const NEW_SERVER = {
      sergeantNudges: false,
      pushDailyCap: 2,
      timeZone: null,
      quietHoursEnabled: true,
      quietHoursStartMin: 1320,
      quietHoursEndMin: 480,
      pushMonoTransactions: true,
      pushFinykAlerts: true,
    };
    afterEach(() => {
      setActiveModules(webKVStore, []);
      // `mockReset` повертає початкову реалізацію (відповідь старого сервера).
      meApiMock.getPreferences.mockReset();
      meApiMock.updatePreferences.mockReset();
    });

    it("старий сервер: підгруп «Тихі години» і «Операції Monobank» немає в DOM", async () => {
      renderSettingsSection(<NotificationsSection />);
      // Дочекались відповідей читання: стеля вже з сервера.
      await waitFor(() =>
        expect(screen.getByRole("radio", { name: "2" })).toBeChecked(),
      );
      // Шість читань: стеля, чотири поля міграції 168 і тумблер Фініка (175) («Повідомлення від
      // Сержанта» з власним читанням переїхали в секцію «Сержант», PR-S8).
      await waitFor(() =>
        expect(meApiMock.getPreferences).toHaveBeenCalledTimes(6),
      );
      expect(screen.queryByRole("switch", { name: "Тихі години" })).toBeNull();
      expect(
        screen.queryByRole("switch", { name: "Операції Monobank" }),
      ).toBeNull();
      expect(
        screen.queryByRole("switch", { name: "Ліміти й платежі Фініка" }),
      ).toBeNull();
      expect(screen.queryByLabelText("Початок")).toBeNull();
    });

    it("новий сервер: підгрупи є, межі 22:00 і 08:00, обидва тумблери увімкнені", async () => {
      meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
      renderSettingsSection(<NotificationsSection />);

      expect(
        await screen.findByRole("switch", { name: "Тихі години" }),
      ).toBeChecked();
      expect(
        await screen.findByRole("switch", { name: "Операції Monobank" }),
      ).toBeChecked();
      expect(screen.getByLabelText("Початок")).toHaveValue("22:00");
      expect(screen.getByLabelText("Кінець")).toHaveValue("08:00");
    });

    it("межа, що збігається з другою, не зберігається і показує помилку", async () => {
      meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
      renderSettingsSection(<NotificationsSection />);
      const start = await screen.findByLabelText("Початок");

      fireEvent.change(start, { target: { value: "08:00" } });

      expect(
        await screen.findByText("Початок і кінець не можуть збігатися."),
      ).toBeInTheDocument();
      expect(meApiMock.updatePreferences).not.toHaveBeenCalled();
      expect(start).toHaveValue("22:00");
    });

    it("нова межа зберігається на сервері хвилиною доби", async () => {
      meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
      meApiMock.updatePreferences.mockResolvedValue({
        ...NEW_SERVER,
        quietHoursStartMin: 1380,
      } as never);
      renderSettingsSection(<NotificationsSection />);
      const start = await screen.findByLabelText("Початок");

      fireEvent.change(start, { target: { value: "23:00" } });

      await waitFor(() =>
        expect(meApiMock.updatePreferences).toHaveBeenCalledWith({
          quietHoursStartMin: 1380,
        }),
      );
    });

    it("вимкнені тихі години ховають межі", async () => {
      meApiMock.getPreferences.mockResolvedValue({
        ...NEW_SERVER,
        quietHoursEnabled: false,
      } as never);
      renderSettingsSection(<NotificationsSection />);
      expect(
        await screen.findByRole("switch", { name: "Тихі години" }),
      ).not.toBeChecked();
      expect(screen.queryByLabelText("Початок")).toBeNull();
    });

    it("тумблер Monobank пише на сервер", async () => {
      meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
      meApiMock.updatePreferences.mockResolvedValue({
        ...NEW_SERVER,
        pushMonoTransactions: false,
      } as never);
      renderSettingsSection(<NotificationsSection />);

      fireEvent.click(
        await screen.findByRole("switch", { name: "Операції Monobank" }),
      );

      await waitFor(() =>
        expect(meApiMock.updatePreferences).toHaveBeenCalledWith({
          pushMonoTransactions: false,
        }),
      );
    });

    describe("тумблер «Ліміти й платежі Фініка» (міграція 175)", () => {
      const NAME = "Ліміти й платежі Фініка";

      it("увімкнений за замовчуванням, коли Фінік активний", async () => {
        meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
        renderSettingsSection(<NotificationsSection />);
        expect(await screen.findByRole("switch", { name: NAME })).toBeChecked();
      });

      it("перемикання шле pushFinykAlerts на сервер", async () => {
        meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
        meApiMock.updatePreferences.mockResolvedValue({
          ...NEW_SERVER,
          pushFinykAlerts: false,
        } as never);
        renderSettingsSection(<NotificationsSection />);
        fireEvent.click(await screen.findByRole("switch", { name: NAME }));
        await waitFor(() =>
          expect(meApiMock.updatePreferences).toHaveBeenCalledWith({
            pushFinykAlerts: false,
          }),
        );
      });

      it("помилка запису відкочує стан і показує повідомлення", async () => {
        meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
        meApiMock.updatePreferences.mockRejectedValue(new Error("offline"));
        renderSettingsSection(<NotificationsSection />);
        const toggle = await screen.findByRole("switch", { name: NAME });
        fireEvent.click(toggle);
        expect(
          await screen.findByText(
            "Не вдалося зберегти налаштування. Спробуй ще раз.",
          ),
        ).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: NAME })).toBeChecked();
      });

      it("без Фініка тумблера немає, а Monobank лишається", async () => {
        setActiveModules(webKVStore, ["routine"]);
        meApiMock.getPreferences.mockResolvedValue(NEW_SERVER as never);
        renderSettingsSection(<NotificationsSection />);
        expect(
          await screen.findByRole("switch", { name: "Операції Monobank" }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("switch", { name: NAME })).toBeNull();
      });
    });
  });
});
