/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSettingsSection } from "../../test/helpers/collapsibleSection";

const {
  toastWarningMock,
  requestPermMock,
  routineState,
  updateRoutinePrefMock,
  monthlyPlanState,
  loadNutritionPrefsMock,
  persistNutritionPrefsMock,
  pushState,
} = vi.hoisted(() => ({
  toastWarningMock: vi.fn(),
  requestPermMock: vi.fn(),
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
  persistNutritionPrefsMock: vi.fn(),
  pushState: { subscribed: false },
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ warning: toastWarningMock }),
}));
vi.mock("@shared/hooks/useModuleReminder", () => ({
  requestNotificationPermission: requestPermMock,
}));
vi.mock("../../modules/routine/hooks/useRoutineState", () => ({
  useRoutineState: () => ({
    routine: routineState.routine,
    updatePref: updateRoutinePrefMock,
  }),
}));
vi.mock("../../modules/fizruk/hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: () => monthlyPlanState,
}));
vi.mock("../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionPrefs: loadNutritionPrefsMock,
  persistNutritionPrefs: persistNutritionPrefsMock,
  NUTRITION_PREFS_KEY: "nutrition_prefs_v1", // gitleaks:allow — test mock of a storage-key constant, not a secret
}));
vi.mock("../components/PushNotificationToggle", () => ({
  PushNotificationToggle: () => <div data-testid="push-toggle" />,
}));
// Секція читає стан підписки, щоб не обіцяти доставку при закритому
// застосунку тим, у кого пуш не увімкнено.
vi.mock("@shared/hooks/usePushNotifications", () => ({
  usePushNotifications: () => pushState,
}));

import { NotificationsSection } from "./NotificationsSection";

// Шукаємо перемикач за підписом рядка, а не за позицією у дереві. Раніше
// тут стояли індекси (routine: 0, fizruk: 1, …), і додавання четвертого
// тумблера вгорі секції зсунуло всі три — тести падали не тому, що щось
// зламалось, а тому, що поруч зʼявився сусід.
const SWITCH_LABEL = {
  sergeant: "Повідомлення від Сержанта",
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
    pushState.subscribed = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
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
    requestPermMock.mockResolvedValue("granted");
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
    stubNotification("default");
    requestPermMock.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("routine");
    await waitFor(() => expect(requestPermMock).toHaveBeenCalled());
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

  it("persists nutrition reminder pref on toggle", async () => {
    stubNotification("granted");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("nutrition");
    await waitFor(() =>
      expect(persistNutritionPrefsMock).toHaveBeenCalledWith(
        expect.objectContaining({ reminderEnabled: true }),
        "nutrition_prefs_v1",
      ),
    );
  });

  it("does not enable the fizruk reminder when permission is refused", async () => {
    stubNotification("default");
    requestPermMock.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("fizruk");
    await waitFor(() => expect(requestPermMock).toHaveBeenCalled());
    expect(monthlyPlanState.setReminderEnabled).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalled();
  });

  it("does not persist the nutrition reminder when permission is refused", async () => {
    stubNotification("default");
    requestPermMock.mockResolvedValue("denied");
    renderSettingsSection(<NotificationsSection />);
    clickSwitch("nutrition");
    await waitFor(() => expect(requestPermMock).toHaveBeenCalled());
    expect(persistNutritionPrefsMock).not.toHaveBeenCalled();
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
    expect(persistNutritionPrefsMock).toHaveBeenCalledWith(
      expect.objectContaining({ reminderHour: 20 }),
      "nutrition_prefs_v1",
    );
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
    expect(persistNutritionPrefsMock).toHaveBeenCalledWith(
      expect.objectContaining({ reminderHour: 23 }),
      "nutrition_prefs_v1",
    );
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
});
