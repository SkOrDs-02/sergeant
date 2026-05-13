/**
 * Jest render + behaviour tests for the mobile WorkoutTemplates drawer.
 *
 * Coverage:
 *  - Empty state: empty hint copy + "Новий шаблон" CTA visible.
 *  - Non-empty state: existing template rows render with action buttons.
 *  - Create flow: opening the editor + tapping a catalogue exercise +
 *    saving invokes `addTemplate` with the picked exercise.
 *  - Apply flow: pressing "Почати" invokes `onStartTemplate` with the
 *    template and closes the sheet.
 */
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import type { FizrukData } from "@sergeant/fizruk-domain";

import { WorkoutTemplatesSheet } from "../templates/WorkoutTemplatesSheet";
import type {
  WorkoutTemplate,
  WorkoutTemplateGroup,
} from "../../hooks/useWorkoutTemplates";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const EXERCISES: FizrukData.RawExerciseDef[] = [
  {
    id: "bench_press",
    name: { uk: "Жим штанги лежачи", en: "Bench Press" },
    primaryGroup: "chest",
  },
  {
    id: "squat",
    name: { uk: "Присідання зі штангою", en: "Back Squat" },
    primaryGroup: "legs",
  },
];

function makeSearch(pool: FizrukData.RawExerciseDef[]) {
  return (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (ex) =>
        ex.name.uk?.toLowerCase().includes(q) ||
        ex.name.en?.toLowerCase().includes(q) ||
        ex.id.toLowerCase().includes(q),
    );
  };
}

interface Harness {
  addTemplate: jest.Mock<
    WorkoutTemplate,
    [string, string[], { groups?: WorkoutTemplateGroup[] }?]
  >;
  updateTemplate: jest.Mock<void, [string, Partial<WorkoutTemplate>]>;
  removeTemplate: jest.Mock<void, [string]>;
  onStartTemplate: jest.Mock<void, [WorkoutTemplate]>;
  onClose: jest.Mock<void, []>;
}

function makeHarness(): Harness {
  return {
    addTemplate: jest.fn((name, exerciseIds) => ({
      id: "tpl_new",
      name,
      exerciseIds,
      groups: [],
      updatedAt: new Date().toISOString(),
    })),
    updateTemplate: jest.fn(),
    removeTemplate: jest.fn(),
    onStartTemplate: jest.fn(),
    onClose: jest.fn(),
  };
}

function renderSheet(
  props: Partial<{
    open: boolean;
    templates: readonly WorkoutTemplate[];
    harness: Harness;
  }> = {},
) {
  const harness = props.harness ?? makeHarness();
  const open = props.open ?? true;
  const templates = props.templates ?? [];
  const result = render(
    <WorkoutTemplatesSheet
      open={open}
      onClose={harness.onClose}
      templates={templates}
      exercises={EXERCISES}
      search={makeSearch(EXERCISES)}
      addTemplate={harness.addTemplate}
      updateTemplate={harness.updateTemplate}
      removeTemplate={harness.removeTemplate}
      onStartTemplate={harness.onStartTemplate}
    />,
  );
  return { ...result, harness };
}

beforeEach(() => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(() => ({ remove: () => {} }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("WorkoutTemplatesSheet (mobile)", () => {
  it("renders the empty state hint and create CTA when there are no templates", () => {
    renderSheet();

    expect(screen.getByText("Шаблони тренувань")).toBeTruthy();
    expect(screen.getByText("Поки немає шаблонів")).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-workout-templates-sheet-create"),
    ).toBeTruthy();
  });

  it("renders existing template rows with start / edit / delete actions", () => {
    const templates: WorkoutTemplate[] = [
      {
        id: "tpl_a",
        name: "Push day",
        exerciseIds: ["bench_press"],
        groups: [],
        updatedAt: "2026-05-01T10:00:00.000Z",
      },
      {
        id: "tpl_b",
        name: "Leg day",
        exerciseIds: ["squat"],
        groups: [],
        updatedAt: "2026-05-02T10:00:00.000Z",
      },
    ];

    renderSheet({ templates });

    expect(screen.getByText("Push day")).toBeTruthy();
    expect(screen.getByText("Leg day")).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-workout-templates-sheet-row-tpl_a-start"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-workout-templates-sheet-row-tpl_b-edit"),
    ).toBeTruthy();
  });

  it("creates a new template via the editor flow", () => {
    const { harness } = renderSheet();

    fireEvent.press(
      screen.getByTestId("fizruk-workout-templates-sheet-create"),
    );

    expect(screen.getByText("Новий шаблон")).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId("fizruk-workout-templates-sheet-editor-name"),
      "Push session",
    );

    fireEvent.press(
      screen.getByTestId(
        "fizruk-workout-templates-sheet-editor-pick-bench_press",
      ),
    );

    fireEvent.press(
      screen.getByTestId("fizruk-workout-templates-sheet-editor-save"),
    );

    expect(harness.addTemplate).toHaveBeenCalledTimes(1);
    const [name, exerciseIds, opts] = harness.addTemplate.mock.calls[0]!;
    expect(name).toBe("Push session");
    expect(exerciseIds).toEqual(["bench_press"]);
    expect(opts?.groups).toEqual([]);
  });

  it("invokes onStartTemplate and closes when 'Почати' is pressed", () => {
    const template: WorkoutTemplate = {
      id: "tpl_a",
      name: "Push day",
      exerciseIds: ["bench_press"],
      groups: [],
      updatedAt: "2026-05-01T10:00:00.000Z",
    };

    const { harness } = renderSheet({ templates: [template] });

    fireEvent.press(
      screen.getByTestId("fizruk-workout-templates-sheet-row-tpl_a-start"),
    );

    expect(harness.onStartTemplate).toHaveBeenCalledTimes(1);
    expect(harness.onStartTemplate.mock.calls[0]?.[0]).toEqual(template);
    expect(harness.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render the create CTA when the sheet is closed", () => {
    renderSheet({ open: false });

    expect(
      screen.queryByTestId("fizruk-workout-templates-sheet-create"),
    ).toBeNull();
    expect(screen.queryByText("Шаблони тренувань")).toBeNull();
  });
});

// Keep `act` import alive — the runtime warns about state updates outside `act`
// when the editor mounts; even though our `fireEvent` calls already wrap them,
// referencing `act` here documents the intent for future contributors.
void act;
