// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkoutsHome, RecentWorkoutSummary } from "./WorkoutsHome";

const NOW = "2026-07-01T10:00:00.000Z";

function baseHandlers() {
  return {
    onOpenSession: vi.fn(),
    onOpenCatalog: vi.fn(),
    onOpenJournal: vi.fn(),
    onOpenPrograms: vi.fn(),
    onOpenStrongImport: vi.fn(),
    onRequestStart: vi.fn(),
    onLogPast: vi.fn(),
  };
}

describe("WorkoutsHome", () => {
  beforeEach(cleanup);

  it("shows the active-workout card with duration and item count when a workout is in flight", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{
          id: "w1",
          startedAt: NOW,
          endedAt: null,
          items: [{ a: 1 }, { b: 2 }],
        }}
        activeDuration="12:34"
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    expect(screen.getByText("Активне тренування")).toBeInTheDocument();
    expect(screen.getByText("12:34")).toBeInTheDocument();
    expect(screen.getByText(/2 вправ/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Відкрити/ }));
    expect(handlers.onOpenSession).toHaveBeenCalledTimes(1);
  });

  it("defaults the active duration display to 00:00 when activeDuration is null", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{ id: "w1", startedAt: NOW, endedAt: null, items: [] }}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("treats an ended workout as inactive and shows the empty-active state", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{ id: "w1", startedAt: NOW, endedAt: NOW, items: [] }}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    expect(screen.getByText("Немає активного тренування")).toBeInTheDocument();
  });

  it("keeps «Внести проведене заняття» reachable while a workout is in flight", () => {
    // Ретро нічого не стартує — сесія народжується завершеною, тож інваріант
    // «одне активне» тут ні до чого. Ховати кнопку означало б, що людина, яка
    // забула внести вчорашнє заняття, мусить спершу завершити сьогоднішнє.
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={{ id: "w1", startedAt: NOW, endedAt: null, items: [] }}
        activeDuration="12:34"
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByText(/Записати проведене/));
    expect(handlers.onLogPast).toHaveBeenCalledTimes(1);
    // І воно не підмінило собою вхід у живу сесію.
    expect(screen.getByRole("button", { name: /Відкрити/ })).toBeVisible();
  });

  it("дві кнопки за двома осями: «Почати тренування» і «Записати проведене»", () => {
    // Історія ряду стартів: #589 звів до двох, 2026-08-10 повернулось ретро
    // третьою кнопкою, 2026-09-03 три рівні кнопки стали ієрархією з
    // текстовим «або із шаблону →», 2026-09-15 додалось «або швидкий запис» —
    // і власник 2026-09-16 сказав «забагато кнопок і маршрутів». Тепер вибір
    // способу живе всередині: аркуш старту (шаблон / підбір / програма) і
    // форма запису (заняття й час / по підходах / швидкий запис).
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    expect(screen.getByText("Немає активного тренування")).toBeInTheDocument();
    const startPaths = screen.getByLabelText(
      "Способи почати або внести тренування",
    );
    expect(startPaths.querySelectorAll("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Почати тренування" }));
    expect(handlers.onRequestStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Записати проведене/ }));
    expect(handlers.onLogPast).toHaveBeenCalledTimes(1);
    // Жодного текстового посилання-«або» під кнопками більше немає.
    expect(screen.queryByText(/із шаблону/)).not.toBeInTheDocument();
    expect(screen.queryByText(/швидкий запис/)).not.toBeInTheDocument();
  });

  it("exposes the start-paths label via role=group so it isn't a dangling div aria-label", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    // A plain `<div aria-label>` with no role is not exposed to the
    // accessibility tree — `role="group"` is what makes the name
    // actually reach assistive tech.
    expect(
      screen.getByRole("group", {
        name: "Способи почати або внести тренування",
      }),
    ).toBeInTheDocument();
  });

  it("shows the schedule CTA when onOpenSchedule is provided and calls it on click", () => {
    const handlers = baseHandlers();
    const onOpenSchedule = vi.fn();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        onOpenSchedule={onOpenSchedule}
        {...handlers}
      />,
    );

    const scheduleBtn = screen.getByText("Планування");
    fireEvent.click(scheduleBtn);
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(scheduleBtn.closest("button")).toHaveClass("focus-visible:ring-2");
  });

  it("shows the empty-journal placeholder and hides the 'Всі' link when recentWorkouts is empty", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    expect(screen.getByText(/тут зʼявляться останні/)).toBeInTheDocument();
    expect(screen.queryByText("Всі")).not.toBeInTheDocument();
  });

  it("renders the recent-workouts list and the 'Всі' link, wiring both to onOpenJournal", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[
          { id: "r1", startedAt: NOW, endedAt: NOW, items: [] },
          { id: "r2", startedAt: NOW, endedAt: null, items: [] },
        ]}
        {...handlers}
      />,
    );

    const allLink = screen.getByText("Всі");
    fireEvent.click(allLink);
    expect(handlers.onOpenJournal).toHaveBeenCalledTimes(1);
    // Raw `<button>` — must carry the canonical focus-visible ring, not
    // rely on the browser default outline.
    expect(allLink).toHaveClass("focus-visible:ring-2");
    expect(allLink).toHaveClass("focus-visible:ring-focus/45");

    const listButtons = screen.getAllByRole("listitem");
    expect(listButtons).toHaveLength(2);
    const firstRowButton = listButtons[0]!.querySelector("button")!;
    expect(firstRowButton).toHaveClass("focus-visible:ring-2");
    fireEvent.click(firstRowButton);
    expect(handlers.onOpenJournal).toHaveBeenCalledTimes(2);
  });

  it("відкриває КОНКРЕТНЕ тренування рядка, а не загальний журнал", () => {
    // Регресія WF-7 (аудит 2026-09-16): кожен рядок «Останніх» кликав
    // `onOpenJournal` без id, тож усі вони вели в той самий список —
    // попри власний підсумок запису і шеврон, який обіцяє перехід саме
    // в нього. Маршрут `workout/:id` існував і був уже вживаний.
    const handlers = baseHandlers();
    const onOpenWorkout = vi.fn();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[
          { id: "r1", startedAt: NOW, endedAt: NOW, items: [] },
          { id: "r2", startedAt: NOW, endedAt: NOW, items: [] },
        ]}
        onOpenWorkout={onOpenWorkout}
        {...handlers}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    fireEvent.click(rows[1]!.querySelector("button")!);
    expect(onOpenWorkout).toHaveBeenCalledWith("r2");
    expect(handlers.onOpenJournal).not.toHaveBeenCalled();

    // «Всі →» лишається загальним журналом — це інша дія, не та сама.
    fireEvent.click(screen.getByText("Всі"));
    expect(handlers.onOpenJournal).toHaveBeenCalledTimes(1);
  });

  it("keeps the exercise catalog as a reference without duplicating templates", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    const catalogText = screen.getByText("Каталог вправ");
    fireEvent.click(catalogText);
    expect(handlers.onOpenCatalog).toHaveBeenCalledTimes(1);
    expect(catalogText.closest("button")).toHaveClass("focus-visible:ring-2");
  });

  it("04-A: always shows a Програми row in Довідники, with and without an active workout", () => {
    const handlers = baseHandlers();
    const { rerender } = render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    const programsText = screen.getByText("Програми");
    fireEvent.click(programsText);
    expect(handlers.onOpenPrograms).toHaveBeenCalledTimes(1);
    expect(programsText.closest("button")).toHaveClass("focus-visible:ring-2");

    rerender(
      <WorkoutsHome
        activeWorkout={{
          id: "w1",
          startedAt: NOW,
          endedAt: null,
          items: [{ a: 1 }],
        }}
        activeDuration="05:00"
        recentWorkouts={[]}
        {...handlers}
      />,
    );
    expect(screen.getByText("Програми")).toBeInTheDocument();
  });

  it("04-A: folds the active program name into the Програми row subtitle", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        activeProgramName="Push Pull Legs"
        {...handlers}
      />,
    );
    expect(screen.getByText(/Push Pull Legs/)).toBeInTheDocument();
  });

  it("opens the Strong import review from the references block", () => {
    const handlers = baseHandlers();
    render(
      <WorkoutsHome
        activeWorkout={null}
        activeDuration={null}
        recentWorkouts={[]}
        {...handlers}
      />,
    );

    const importText = screen.getByText("Імпорт Strong");
    fireEvent.click(importText);
    expect(handlers.onOpenStrongImport).toHaveBeenCalledTimes(1);
    expect(importText.closest("button")).toHaveClass("focus-visible:ring-2");
  });
});

describe("RecentWorkoutSummary", () => {
  beforeEach(cleanup);

  it("shows the Чернетка badge and 'порожнє тренування' subtitle for an unfinished, itemless workout", () => {
    render(
      <RecentWorkoutSummary
        workout={{ id: "w1", startedAt: NOW, endedAt: null, items: [] }}
      />,
    );
    expect(screen.getByText("Чернетка")).toBeInTheDocument();
    expect(screen.getByText("порожнє тренування")).toBeInTheDocument();
  });

  // Найчастіший стан картки — один підхід — і саме він читався найгірше:
  // «1 сетів». Одиниця тут перевіряється окремо від множини, бо ламається
  // саме межа one / few (аудит L-10, 2026-08-07).
  it("легкий запис дістає бейдж «легке», а не «Чернетка»", () => {
    render(
      <RecentWorkoutSummary
        workout={{
          id: "w-light",
          startedAt: "2026-07-01T09:59:20.000Z",
          endedAt: "2026-07-01T10:00:00.000Z",
          items: [
            {
              type: "strength",
              sets: [{ weightKg: 0, reps: 20 }],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("легке")).toBeInTheDocument();
    expect(screen.queryByText("Чернетка")).not.toBeInTheDocument();
  });

  it("відмінює одиничний підхід як «1 підхід», не «1 підходів»", () => {
    render(
      <RecentWorkoutSummary
        workout={{
          id: "w1",
          startedAt: "2026-07-01T10:00:00.000Z",
          endedAt: "2026-07-01T10:20:00.000Z",
          items: [{ type: "strength", sets: [{ weightKg: 50, reps: 8 }] }],
        }}
      />,
    );
    // Повний рядок, а не регекс із `\b`: у JS межа слова визначена через
    // ASCII-\w, тож між «т» і пробілом її немає, і /1 сет\b/ не збігається
    // з кирилицею взагалі.
    expect(screen.getByText("1 вправа · 1 підхід · 20 хв")).toBeInTheDocument();
  });

  it("omits the Чернетка badge and builds a joined subtitle for a finished workout with items/sets/duration", () => {
    const started = "2026-07-01T10:00:00.000Z";
    const ended = "2026-07-01T10:45:00.000Z"; // 45 min later
    render(
      <RecentWorkoutSummary
        workout={{
          id: "w1",
          startedAt: started,
          endedAt: ended,
          items: [
            {
              type: "strength",
              sets: [
                { weightKg: 50, reps: 8 },
                { weightKg: 50, reps: 8 },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText("Чернетка")).not.toBeInTheDocument();
    expect(screen.getByText(/1 вправ/)).toBeInTheDocument();
    // «2 сети», не «2 сетів» — суфікс відмінюється через `setsCountLabel`
    // (аудит L-10, 2026-08-07). Раніше тут стояв зашитий рядок «сетів»,
    // і картка після одного підходу писала «1 сетів».
    expect(screen.getByText(/2 підходи/)).toBeInTheDocument();
    expect(screen.getByText(/45 хв/)).toBeInTheDocument();
  });
});
