// @vitest-environment jsdom
/**
 * SessionView — оркестратор сесійного режиму. Покриває перемикання
 * «список ↔ вправа» за `focusItemId`, «+ Вправа», стрілки на сусідні
 * вправи, два стани дока (дії / таймер), вибір для суперсету через ⋯ і
 * undo для видаленого підходу.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import { RestTimerContext } from "../../context/RestTimerContext";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { SessionView } from "./SessionView";

const undoMocks = vi.hoisted(() => ({
  last: null as null | { msg: string; onUndo: () => void },
}));
vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: (
    _toast: unknown,
    opts: { msg: string; onUndo: () => void },
  ) => {
    undoMocks.last = opts;
    return 1;
  },
}));

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return { ...actual, useVisualKeyboardInset: () => 0 };
});

function item(
  id: string,
  name: string,
  sets: Array<[number, number]>,
): WorkoutItem {
  return {
    id,
    exerciseId: id,
    nameUk: name,
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })),
  } as WorkoutItem;
}

function workout(over: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-09-11T10:00:00Z",
    endedAt: null,
    note: "",
    warmup: null,
    cooldown: null,
    groups: [],
    items: [
      item("a", "Жим лежачи", [[80, 8]]),
      item("b", "Присідання", [[0, 0]]),
      item("c", "Тяга штанги", []),
    ],
    ...over,
  } as Workout;
}

const updateItem = vi.fn();
const updateWorkout = vi.fn();
const removeItem = vi.fn();
const onFinishClick = vi.fn();
const onDeleteWorkout = vi.fn();
const onCollapse = vi.fn();
const onOpenItem = vi.fn();
const onAddExercise = vi.fn();

function renderView(
  props: Partial<React.ComponentProps<typeof SessionView>> = {},
  restTimer: RestTimerState | null = null,
) {
  const setRestTimer = vi.fn() as unknown as Dispatch<
    SetStateAction<RestTimerState | null>
  >;
  const w = props.activeWorkout ?? workout();
  const view = render(
    <ToastProvider>
      <RestTimerContext.Provider value={{ restTimer, setRestTimer }}>
        <SessionView
          activeWorkout={w}
          activeDuration="12:34"
          lastByExerciseId={{}}
          recBy={{}}
          removeItem={removeItem}
          updateItem={updateItem}
          updateWorkout={updateWorkout}
          onFinishClick={onFinishClick}
          onDeleteWorkout={onDeleteWorkout}
          onCollapse={onCollapse}
          onOpenItem={onOpenItem}
          onAddExercise={onAddExercise}
          {...props}
        />
      </RestTimerContext.Provider>
    </ToastProvider>,
  );
  return { setRestTimer, rerender: view.rerender };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionView — list", () => {
  it("renders the exercise list with states, the hero duration and the progress line", () => {
    renderView();
    expect(
      screen.getByRole("timer", { name: "Тривалість тренування" }),
    ).toHaveTextContent("12:34");
    expect(screen.getByText(/1 з 3/)).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /Відкрити вправу:/ });
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
  });

  it("keeps the safe-area inset on the sticky session bar", () => {
    // Сесія знімає хром модуля разом із `ModuleHeader`, який ніс цей
    // відступ, а body-level safe-area в репо навмисно прибрано. Без
    // `safe-area-pt` смуга залазить під системний статус-бар: годинник і
    // LTE малюються поверх «Згорнути»/«Завершити» (звіт власника
    // 2026-09-11).
    renderView();
    const bar = screen
      .getByRole("button", { name: "Згорнути" })
      .closest("div.sticky");
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass("safe-area-pt");
  });

  it("opens an exercise on row tap and collapses via the top bar", () => {
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: "Відкрити вправу: Присідання" }),
    );
    expect(onOpenItem).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: "Згорнути" }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  // Рівно ОДИН «+ Вправа» на екран: у списку дію несе док, у порожньому
  // стані — hero-кнопка картки, і док тоді її не дублює (браузерний
  // прохід 2026-09-11).
  it("has exactly one «+ Вправа» — in the dock — while the list has items", () => {
    renderView();
    const btns = screen.getAllByRole("button", { name: "Додати вправу" });
    expect(btns).toHaveLength(1);
    fireEvent.click(btns[0] as HTMLElement);
    expect(onAddExercise).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state with an add button when there are no items", () => {
    renderView({ activeWorkout: workout({ items: [] }) });
    expect(screen.getByText("Поки без вправ")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Додати вправу" }).length,
    ).toBeGreaterThan(0);
  });

  // Верхня смуга липка, тож дубля «Завершити» внизу списку немає.
  it("finishes from the sticky top bar and shows no duplicate bottom button", () => {
    renderView();
    expect(
      screen.queryByRole("button", { name: "Завершити тренування" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Завершити" }));
    expect(onFinishClick).toHaveBeenCalledTimes(1);
  });

  it("groups two selected items into a superset from the ⋯ menu", () => {
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Обʼєднати в суперсет" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Жим лежачи/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Присідання/ }));
    fireEvent.click(screen.getByRole("button", { name: /Суперсет \(2\/3\)/ }));
    expect(updateWorkout).toHaveBeenCalledWith("w1", {
      groups: [
        expect.objectContaining({
          type: "superset",
          itemIds: ["a", "b"],
          restSec: 60,
        }),
      ],
    });
  });

  it("drops the selection strip when the view switches to a focused exercise", () => {
    // Навігація «вперед» у браузері міняє лише `focusItemId` і не проходить
    // через жоден обробник — тому режим вибору тут ПОХІДНИЙ, а не окремий
    // прапорець, який нема де погасити (знахідка рев'ю 2026-09-11).
    const { rerender } = renderView();
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Обʼєднати в суперсет" }),
    );
    expect(
      screen.getByRole("button", { name: /Суперсет \(0\/3\)/ }),
    ).toBeTruthy();
    rerender(
      <ToastProvider>
        <RestTimerContext.Provider
          value={{
            restTimer: null,
            setRestTimer: vi.fn() as unknown as Dispatch<
              SetStateAction<RestTimerState | null>
            >,
          }}
        >
          <SessionView
            activeWorkout={workout()}
            activeDuration="12:34"
            lastByExerciseId={{}}
            recBy={{}}
            removeItem={removeItem}
            updateItem={updateItem}
            updateWorkout={updateWorkout}
            onFinishClick={onFinishClick}
            onDeleteWorkout={onDeleteWorkout}
            onCollapse={onCollapse}
            onOpenItem={onOpenItem}
            onAddExercise={onAddExercise}
            focusItemId="a"
          />
        </RestTimerContext.Provider>
      </ToastProvider>,
    );
    expect(screen.queryByRole("button", { name: /Суперсет \(/ })).toBeNull();
  });

  it("expands the warmup chip and seeds the default checklist", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Розминка" }));
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ warmup: expect.any(Array) }),
    );
  });
});

describe("SessionView — exercise screen", () => {
  it("renders the focused exercise with set rows, «Список» and neighbour arrows", () => {
    renderView({ focusItemId: "b" });
    expect(
      screen.getByRole("heading", { name: "Присідання" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Вага в кілограмах" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Список" }));
    expect(onOpenItem).toHaveBeenCalledWith(null);
    fireEvent.click(
      screen.getByRole("button", { name: "Наступна вправа: Тяга штанги" }),
    );
    expect(onOpenItem).toHaveBeenCalledWith("c");
    fireEvent.click(
      screen.getByRole("button", { name: "Попередня вправа: Жим лежачи" }),
    );
    expect(onOpenItem).toHaveBeenCalledWith("a");
  });

  it("removes the exercise from the ⋯ menu and returns to the list", () => {
    renderView({ focusItemId: "b" });
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням: Присідання" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Прибрати з тренування" }),
    );
    expect(removeItem).toHaveBeenCalledWith("w1", "b");
    expect(onOpenItem).toHaveBeenCalledWith(null);
  });

  // Старт відпочинку живе в ряду дій картки («⏱ 90 с» + меню пресетів),
  // тож окремої кнопки в доці немає — вона дублювала той самий намір.
  it("does not duplicate the rest preset in the dock", () => {
    renderView({ focusItemId: "a" });
    expect(
      screen.queryByRole("button", { name: "Почати відпочинок" }),
    ).toBeNull();
  });

  it("shows an undo toast after deleting a set and restores the snapshot", () => {
    renderView({ focusItemId: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Видалити підхід 1" }));
    expect(undoMocks.last?.msg).toBe("Підхід видалено");
    undoMocks.last?.onUndo();
    expect(updateItem).toHaveBeenLastCalledWith("w1", "a", {
      sets: [{ weightKg: 80, reps: 8 }],
    });
  });
});

describe("SessionView — dock during rest", () => {
  it("turns the dock into the rest timer with the next-set hint, ±15 and skip", () => {
    const { setRestTimer } = renderView(
      { focusItemId: "b" },
      { remaining: 83, total: 90 },
    );
    const dock = screen.getByTestId("rest-timer");
    expect(dock).toHaveTextContent("1:23");
    expect(dock).toHaveTextContent("далі підхід 1");
    fireEvent.click(screen.getByRole("button", { name: "Додати 15 секунд" }));
    expect(setRestTimer).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Пропустити" }));
    expect(setRestTimer).toHaveBeenCalledWith(null);
  });
});

describe("SessionView — периферія сесії (розминка, заминка, нотатка)", () => {
  it("сіє дефолтну розминку й перемикає пункт чеклиста", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Розминка/ }));
    // Поки списку немає, чекліст показує промпт «Додати» замість пунктів.
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ warmup: expect.any(Array) }),
    );

    cleanup();
    vi.clearAllMocks();
    renderView({
      activeWorkout: workout({
        warmup: [
          { id: "wm1", label: "Суглобова гімнастика", done: false },
          { id: "wm2", label: "Кардіо 5 хв", done: false },
        ],
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: /Розминка/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Кардіо 5 хв: позначити як завершене",
      }),
    );
    expect(updateWorkout).toHaveBeenCalledWith("w1", {
      warmup: [
        { id: "wm1", label: "Суглобова гімнастика", done: false },
        { id: "wm2", label: "Кардіо 5 хв", done: true },
      ],
    });
  });

  it("сіє дефолтну заминку окремо від розминки", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Заминка/ }));
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ cooldown: expect.any(Array) }),
    );
  });

  it("показує лічильник виконаних пунктів у чипі розминки", () => {
    renderView({
      activeWorkout: workout({
        warmup: [
          { id: "wm1", label: "Раз", done: true },
          { id: "wm2", label: "Два", done: false },
        ],
      }),
    });
    expect(screen.getByRole("button", { name: /Розминка/ })).toHaveTextContent(
      "1/2",
    );
  });

  it("пише нотатку тренування", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Нотатка/ }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Легко пішло" },
    });
    expect(updateWorkout).toHaveBeenCalledWith("w1", { note: "Легко пішло" });
  });
});

describe("SessionView — групи вправ", () => {
  it("скасовує режим вибору без створення групи", () => {
    renderView();
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Обʼєднати в суперсет" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Жим лежачи/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.queryByRole("button", { name: /Суперсет \(/ })).toBeNull();
    expect(updateWorkout).not.toHaveBeenCalled();
  });

  it("створює коло і викидає стару групу, що ділила ті самі вправи", () => {
    // Гілка `groups.filter(...)` спрацьовує лише коли група вже існує —
    // інакше фільтр не викликається жодного разу.
    renderView({
      activeWorkout: workout({
        groups: [
          { id: "g-old", type: "superset", itemIds: ["a", "c"], restSec: 60 },
        ],
      }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Ще дії з тренуванням" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Обʼєднати в суперсет" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Жим лежачи/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Присідання/ }));
    fireEvent.click(screen.getByRole("button", { name: /Коло \(2\/3\)/ }));
    expect(updateWorkout).toHaveBeenCalledWith("w1", {
      groups: [
        expect.objectContaining({ type: "circuit", itemIds: ["a", "b"] }),
      ],
    });
    const [, patch] = updateWorkout.mock.calls[0] as [string, { groups: [] }];
    expect(patch.groups).toHaveLength(1);
  });

  it("розгруповує вправу з картки у фокусі", () => {
    renderView({
      focusItemId: "a",
      activeWorkout: workout({
        groups: [
          { id: "g-old", type: "superset", itemIds: ["a", "b"], restSec: 60 },
        ],
      }),
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ще дії з тренуванням: Жим лежачи",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Розгрупувати" }));
    expect(updateWorkout).toHaveBeenCalledWith("w1", { groups: [] });
  });
});

describe("SessionView — меню вправи у фокусі", () => {
  it("прокидає «про вправу» і «статистику» лише коли обробники передані", () => {
    const onOpenExerciseInfo = vi.fn();
    const onOpenExerciseStats = vi.fn();
    renderView({ focusItemId: "a", onOpenExerciseInfo, onOpenExerciseStats });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ще дії з тренуванням: Жим лежачи",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Про вправу" }));
    expect(onOpenExerciseInfo).toHaveBeenCalledWith("a");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ще дії з тренуванням: Жим лежачи",
      }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Статистика вправи" }),
    );
    expect(onOpenExerciseStats).toHaveBeenCalledWith("a");
  });
});

describe("SessionView — арифметика відпочинку", () => {
  it("додає секунди й тягне загальну тривалість за собою, не опускаючись нижче 1 с", () => {
    // `setRestTimer` тут — мок, тож сам апдейтер не виконується. Дістаємо
    // його з виклику і проганяємо вручну: саме він тримає інваріанти
    // «не менше 1 с» і «total не меншає».
    const { setRestTimer } = renderView(
      { focusItemId: "b" },
      { remaining: 83, total: 90 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Додати 15 секунд" }));
    const updater = (setRestTimer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as (s: RestTimerState | null) => RestTimerState | null;

    expect(updater({ remaining: 83, total: 90 })).toEqual({
      remaining: 98,
      total: 98,
    });
    // Мінус більше, ніж лишилось: підлога 1 с, а total лишається старим.
    expect(updater({ remaining: 5, total: 90 })).toEqual({
      remaining: 20,
      total: 90,
    });
    // Таймера немає — апдейтер не вигадує стан.
    expect(updater(null)).toBeNull();
  });
});
