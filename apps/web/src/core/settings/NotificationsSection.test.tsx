/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  toastWarningMock,
  requestPermMock,
  routineState,
  updateRoutinePrefMock,
  monthlyPlanState,
  loadNutritionPrefsMock,
  persistNutritionPrefsMock,
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

import { NotificationsSection } from "./NotificationsSection";

// Toggle order in the rendered tree: routine, fizruk, nutrition.
const SWITCH = { routine: 0, fizruk: 1, nutrition: 2 } as const;
function clickSwitch(which: keyof typeof SWITCH) {
  const switches = screen.getAllByRole("switch");
  fireEvent.click(switches[SWITCH[which]]!);
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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the 'allow' button when permission is default", () => {
    stubNotification("default");
    render(<NotificationsSection />);
    expect(screen.getByText("Не встановлено")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Дозволити" }),
    ).toBeInTheDocument();
  });

  it("shows the granted label and hides the allow button", () => {
    stubNotification("granted");
    render(<NotificationsSection />);
    expect(screen.getByText("Дозволено")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Дозволити" }),
    ).not.toBeInTheDocument();
  });

  it("requests permission and warns when denied", async () => {
    const reqFn = stubNotification("default");
    reqFn.mockResolvedValue("denied");
    render(<NotificationsSection />);
    fireEvent.click(screen.getByRole("button", { name: "Дозволити" }));
    await waitFor(() => expect(reqFn).toHaveBeenCalled());
    await waitFor(() => expect(toastWarningMock).toHaveBeenCalled());
  });

  it("enables the routine reminder pref once permission is granted", async () => {
    stubNotification("granted");
    requestPermMock.mockResolvedValue("granted");
    render(<NotificationsSection />);
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
    render(<NotificationsSection />);
    clickSwitch("routine");
    await waitFor(() => expect(requestPermMock).toHaveBeenCalled());
    expect(updateRoutinePrefMock).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalled();
  });

  it("toggles the fizruk reminder when permission is granted", async () => {
    stubNotification("granted");
    render(<NotificationsSection />);
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
    render(<NotificationsSection />);
    const timeInput = document.querySelector(
      'input[type="time"]',
    ) as HTMLInputElement;
    expect(timeInput.value).toBe("08:30");
    fireEvent.change(timeInput, { target: { value: "10:15" } });
    expect(monthlyPlanState.setReminder).toHaveBeenCalledWith(10, 15);
  });

  it("persists nutrition reminder pref on toggle", async () => {
    stubNotification("granted");
    render(<NotificationsSection />);
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
    render(<NotificationsSection />);
    clickSwitch("fizruk");
    await waitFor(() => expect(requestPermMock).toHaveBeenCalled());
    expect(monthlyPlanState.setReminderEnabled).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalled();
  });

  it("does not persist the nutrition reminder when permission is refused", async () => {
    stubNotification("default");
    requestPermMock.mockResolvedValue("denied");
    render(<NotificationsSection />);
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
    render(<NotificationsSection />);
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
    render(<NotificationsSection />);
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
    render(<NotificationsSection />);
    expect(screen.getByText("Не підтримується")).toBeInTheDocument();
  });
});
