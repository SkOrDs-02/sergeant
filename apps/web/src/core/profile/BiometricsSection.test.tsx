// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastShowMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    show: toastShowMock,
  }),
}));

// This suite is mostly about the form itself, not the /api/me/profile
// write-through leg (covered in depth by `useBiometrics.test.tsx` and
// `profileWriteThrough.test.ts`) — default both to signed-out/no-op so
// no real AuthProvider or network mock is needed for most tests. The
// L-17 regression below overrides `mockUseAuth` per-test to assert the
// push actually fires for an authenticated weight-only save.
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({ user: null as { id: string } | null })),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthOptional: mockUseAuth,
}));

const { mockPushBiometricsToServer } = vi.hoisted(() => ({
  mockPushBiometricsToServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./profileWriteThrough", () => ({
  pushBiometricsToServer: mockPushBiometricsToServer,
}));

// Журнал ваги персиститься через dual-write пайплайн (SQLite — source of
// truth після Stage 12 / PR #070f), а не через localStorage — перехоплюємо
// trigger, щоб асертити дзеркалення Profile-ваги у fizruk daily log.
const dualWriteTriggerMock = vi.fn();
vi.mock(
  "../../modules/fizruk/lib/sqliteWriter/index",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../modules/fizruk/lib/sqliteWriter/index")
      >();
    return {
      ...actual,
      triggerFizrukDualWrite: (...args: unknown[]) =>
        dualWriteTriggerMock(...args),
    };
  },
);

import { BIOMETRICS_DEFAULT, type Biometrics } from "./biometrics";
import { BiometricsSection } from "./BiometricsSection";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  // `vi.clearAllMocks()` resets call history but NOT a mock's configured
  // return value, so every test needs the signed-out default re-armed
  // explicitly — otherwise a `mockUseAuth.mockReturnValue(...)` override
  // from one test would leak into the next one.
  mockUseAuth.mockReturnValue({ user: null });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function readStored(): Biometrics | null {
  const raw = localStorage.getItem(STORAGE_KEYS.HUB_BIOMETRICS);
  return raw ? (JSON.parse(raw) as Biometrics) : null;
}

describe("BiometricsSection", () => {
  it("renders empty defaults when nothing is stored", () => {
    render(<BiometricsSection />);

    expect(screen.getByLabelText("Зріст (см)")).toHaveValue(null);
    expect(screen.getByLabelText("Дата народження")).toHaveValue("");
    expect(screen.getByLabelText("Стать")).toHaveValue("");
    expect(screen.getByLabelText("Рівень активності")).toHaveValue("");
    expect(screen.getByLabelText("Поточна вага (кг)")).toHaveValue(null);
  });

  it("hydrates from a persisted record", () => {
    const stored: Biometrics = {
      heightCm: 178,
      birthDate: "1990-05-12",
      sex: "male",
      activityLevel: "moderate",
      weightKg: 80,
      weightUpdatedAt: "2026-01-01T00:00:00.000Z",
      countWorkoutsInGoal: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(stored));

    render(<BiometricsSection />);

    expect(screen.getByLabelText("Зріст (см)")).toHaveValue(178);
    expect(screen.getByLabelText("Дата народження")).toHaveValue("1990-05-12");
    expect(screen.getByLabelText("Стать")).toHaveValue("male");
    expect(screen.getByLabelText("Рівень активності")).toHaveValue("moderate");
    expect(screen.getByLabelText("Поточна вага (кг)")).toHaveValue(80);
  });

  it("disables Зберегти until the form is dirty", () => {
    render(<BiometricsSection />);
    const save = screen.getByRole("button", { name: "Зберегти" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "180" },
    });
    expect(save).not.toBeDisabled();
  });

  it("persists every field on Save and emits a success toast", () => {
    render(<BiometricsSection />);

    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "175" },
    });
    fireEvent.change(screen.getByLabelText("Дата народження"), {
      target: { value: "1992-04-10" },
    });
    fireEvent.change(screen.getByLabelText("Стать"), {
      target: { value: "female" },
    });
    fireEvent.change(screen.getByLabelText("Рівень активності"), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "62.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    const stored = readStored();
    expect(stored).toMatchObject({
      heightCm: 175,
      birthDate: "1992-04-10",
      sex: "female",
      activityLevel: "active",
      weightKg: 62.4,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Біометрію збережено");
  });

  it("mirrors a Profile-side weight write into the fizruk daily log (dual-write)", () => {
    render(<BiometricsSection />);

    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(dualWriteTriggerMock).toHaveBeenCalledTimes(1);
    const [, nextState] = dualWriteTriggerMock.mock.calls[0] as [
      unknown,
      { dailyLog: Array<{ weightKg: number | null }> },
    ];
    expect(nextState.dailyLog).toHaveLength(1);
    expect(nextState.dailyLog[0]?.weightKg).toBe(70);
  });

  it("shows the activity-level hint when one is selected", () => {
    render(<BiometricsSection />);

    fireEvent.change(screen.getByLabelText("Рівень активності"), {
      target: { value: "moderate" },
    });

    expect(
      screen.getByText("Тренування 3-5 днів на тиждень"),
    ).toBeInTheDocument();
  });

  it("renders the computed age helper when birthDate is set", () => {
    const stored: Biometrics = {
      ...BIOMETRICS_DEFAULT,
      birthDate: "1990-01-01",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(stored));

    render(<BiometricsSection />);

    expect(screen.getByText(/Вік:/)).toBeInTheDocument();
  });

  it("keeps date and biometrics controls constrained for narrow mobile cards", () => {
    render(<BiometricsSection />);

    expect(screen.getByLabelText("Дата народження")).toHaveClass(
      "min-w-0",
      "max-w-full",
    );
    expect(screen.getByLabelText("Поточна вага (кг)")).toHaveClass(
      "min-w-0",
      "max-w-full",
    );
    expect(screen.getByLabelText("Рівень активності")).toHaveClass(
      "min-w-0",
      "max-w-full",
    );
  });

  it("disables every input when offline", () => {
    render(<BiometricsSection online={false} />);

    expect(screen.getByLabelText("Зріст (см)")).toBeDisabled();
    expect(screen.getByLabelText("Дата народження")).toBeDisabled();
    expect(screen.getByLabelText("Стать")).toBeDisabled();
    expect(screen.getByLabelText("Рівень активності")).toBeDisabled();
    expect(screen.getByLabelText("Поточна вага (кг)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });
});

describe("BiometricsSection — межі (beta-input-boundaries)", () => {
  it("дата народження має власне вікно, а не спільне календарне", () => {
    render(<BiometricsSection online />);
    const birthDate = screen.getByLabelText("Дата народження");
    // Спільне вікно календаря починається з 1970-го — для дати народження
    // це відрізало б усіх, хто народився раніше.
    expect(birthDate.getAttribute("min")).toBe("1900-01-01");
    expect(birthDate.getAttribute("max")).not.toBe("2100-01-01");
  });

  it("не зберігає зріст поза діапазоном інпута", () => {
    render(<BiometricsSection online />);
    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "99999" },
    });
    // Значення поза [80; 260] читається як «не задано», тож форма не стає
    // брудною і кнопка лишається вимкненою.
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });

  it("зберігає зріст усередині діапазону", () => {
    render(<BiometricsSection online />);
    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "180" },
    });
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeEnabled();
  });
});

// L-4 — регресія на "значення поза діапазоном стирає збережене". На
// відміну від тестів вище (де зросту НІКОЛИ не було збережено, тож
// "невалідне == null" випадково давало правильний результат), тут
// стартуємо з уже персистованого повного запису і перевіряємо, що
// друга цифра (типова мобільна-клавіатура помилка: 175 -> 1750) не
// стирає його.
describe("BiometricsSection — L-4 (значення поза діапазоном не стирає збережене)", () => {
  const savedComplete: Biometrics = {
    heightCm: 175,
    birthDate: "1990-05-12",
    sex: "male",
    activityLevel: "moderate",
    weightKg: 80,
    weightUpdatedAt: "2026-01-01T00:00:00.000Z",
    countWorkoutsInGoal: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEYS.HUB_BIOMETRICS,
      JSON.stringify(savedComplete),
    );
  });

  it("не робить форму «брудною», коли поза-діапазонне значення — єдина зміна", () => {
    render(<BiometricsSection online />);
    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "1750" },
    });
    // Без фіксу: parseInRangeOrNull("1750") -> null, null !== 175 (джерело) ->
    // diff вважає це зміною -> кнопка розблоковується -> клік стирає збережене.
    // З фіксом: "invalid" не бере участі в diff, кнопці нема що патчити.
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });

  // D1 (adversarial review, P1): попередній фікс закривав лише
  // одно-полевий кейс вище. Тут — до попереднього фіксу так само
  // збереженого зросту 175 — юзер ОДНОЧАСНО псує зріст (1750, invalid,
  // не патчиться) І валідно міняє стать. `diff` тоді містив лише
  // `{sex}` -> кнопка розблоковувалась -> клік зберігав стать, зріст
  // мовчки відкидався, а `toast.success` все одно казав "Збережено".
  // Мінімум-фікс: поки БУДЬ-ЯКЕ поле invalid, Save заблокований цілком —
  // не можна зберегти частину форми, поки інша частина мовчки губиться.
  it("не дає зберегти форму, коли невалідний зріст суміщено з валідною зміною статі (D1)", () => {
    render(<BiometricsSection online />);
    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "1750" },
    });
    fireEvent.change(screen.getByLabelText("Стать"), {
      target: { value: "female" },
    });

    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });

  // Той самий дефект для ваги — ще гірший наслідок: weight-only
  // мовчазне відкидання означає, що в Фізрук журнал теж нічого не їде.
  it("не дає зберегти форму, коли невалідна вага суміщена з валідною зміною статі (D1)", () => {
    render(<BiometricsSection online />);
    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "9999" },
    });
    fireEvent.change(screen.getByLabelText("Стать"), {
      target: { value: "female" },
    });

    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });

  // D4 (adversarial review): показ помилки гейтиться blur-ом — набір
  // "1" -> "17" -> "175" більше не блимає червоною рамкою + role="alert"
  // на кожен проміжний символ. "без сабміту" тут означає "без кліку по
  // Зберегти", а не "без blur" — тому тест виходить із поля (blur), не
  // клікаючи по кнопці.
  it("показує помилку біля поля зросту після blur, без сабміту", () => {
    render(<BiometricsSection online />);
    const height = screen.getByLabelText("Зріст (см)");

    fireEvent.change(height, { target: { value: "1750" } });
    // До blur — жодного видимого сигналу немає (D4): проміжний ввід не
    // повинен підсвічуватись як помилка.
    expect(
      screen.queryByText(/Зріст має бути від 80 до 260 см/),
    ).not.toBeInTheDocument();

    fireEvent.blur(height);
    expect(
      screen.getByText(/Зріст має бути від 80 до 260 см/),
    ).toBeInTheDocument();
  });

  // Пін проти розсинхрону, а не проти регресії поведінки. Межі зросту й
  // ваги живуть у ДВОХ місцях: `HEIGHT_CM_RANGE`/`WEIGHT_KG_RANGE`
  // (`biometrics.ts`, звідки йдуть і `min`/`max` інпута, і zod-схема —
  // D5) і рядки `messages.biometrics.*RangeError`, де числа вписані
  // текстом — каталог i18n складається з простих рядків без
  // інтерполяції. Якщо хтось зсуне константу, повідомлення почне
  // називати неправдиві межі, і жоден тест поведінки цього не помітить:
  // валідація працюватиме коректно, брехатиме лише текст.
  //
  // D3 (adversarial review): попередня версія звіряла через `toContain`
  // — при `min: 60` рядок "від 80 до 260 см" МІСТИТЬ підрядок "60"
  // усередині "260", тож пін лишався зеленим на брехливому повідомленні.
  // Точна рівність ловить це коректно.
  it("повідомлення про діапазон називає ті самі межі, що й атрибути поля (зріст)", () => {
    render(<BiometricsSection online />);
    const height = screen.getByLabelText("Зріст (см)");
    const min = height.getAttribute("min");
    const max = height.getAttribute("max");
    expect(min).toBeTruthy();
    expect(max).toBeTruthy();

    fireEvent.change(height, { target: { value: "1750" } });
    fireEvent.blur(height);

    // Порівнюємо саме з текстом помилки, а не з підказкою поля: у
    // `helperText` під час помилки лишається тільки вона.
    const message = screen.getByText(/Зріст має бути/).textContent ?? "";
    expect(message).toBe(`Зріст має бути від ${min} до ${max} см`);
  });

  // Симетричний пін для ваги — раніше не існував узагалі (D3), хоча діра
  // там ширша: `min: 40` дає підрядок "40" усередині "400".
  it("повідомлення про діапазон називає ті самі межі, що й атрибути поля (вага)", () => {
    render(<BiometricsSection online />);
    const weight = screen.getByLabelText("Поточна вага (кг)");
    const min = weight.getAttribute("min");
    const max = weight.getAttribute("max");
    expect(min).toBeTruthy();
    expect(max).toBeTruthy();

    fireEvent.change(weight, { target: { value: "9999" } });
    fireEvent.blur(weight);

    const message = screen.getByText(/Вага має бути/).textContent ?? "";
    expect(message).toBe(`Вага має бути від ${min} до ${max} кг`);
  });

  it("клік по «Зберегти» (навіть форсований) не стирає збережений зріст і не рапортує хибний успіх", () => {
    render(<BiometricsSection online />);
    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "1750" },
    });
    // Кнопка тут вимкнена (перевірено вище) — цей клік у нативному DOM
    // не мав би спрацювати взагалі, але дублюємо перевірку на рівні
    // даних, а не лише UI-стану кнопки: навіть якби handler якось
    // спрацював, diff для цього поля порожній, тож зберігати нічого.
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    const stored = readStored();
    expect(stored?.heightCm).toBe(175);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("наслідок: isBiometricsCompleteForTdee лишається true (розрахунок КБЖВ не ламається мовчки)", () => {
    render(<BiometricsSection online />);
    // Готовий-до-TDEE статус має відображати ПОВНИЙ збережений запис.
    expect(screen.getByText("Готово до розрахунку TDEE")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Зріст (см)"), {
      target: { value: "1750" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    // Без фіксу: клік стирав heightCm -> isBiometricsCompleteForTdee(biometrics)
    // -> false -> статус тихо перемикався на "Заповни дані для розрахунку",
    // і КБЖВ-розрахунок у Nutrition ламався без жодного видимого сигналу.
    expect(screen.getByText("Готово до розрахунку TDEE")).toBeInTheDocument();
    expect(
      screen.queryByText("Заповни дані для розрахунку"),
    ).not.toBeInTheDocument();
  });
});

// L-17 — регресія на "збереження ТІЛЬКИ ваги не пушить профіль на сервер".
describe("BiometricsSection — L-17 (зміна лише ваги теж синхронізується на сервер)", () => {
  it("викликає pushBiometricsToServer, коли змінилась ЛИШЕ вага і юзер автентифікований", () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    render(<BiometricsSection online />);

    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    // Без фіксу: умова в handleSave кликала saveBiometrics лише коли
    // змінилось щось ІНШЕ за вагу (або вагу явно чистили в null), тож
    // "тільки вага змінилась" ніколи не діставалась до saveBiometrics —
    // а саме там живе pushBiometricsToServer.
    expect(mockPushBiometricsToServer).toHaveBeenCalledTimes(1);
    const [pushed] = mockPushBiometricsToServer.mock.calls[0] as [Biometrics];
    expect(pushed.weightKg).toBe(70);
  });

  // D6 (adversarial review): це гард НА ІСНУЮЧИЙ auth-гейт у
  // `useBiometrics.saveBiometrics` (`if (user?.id) void
  // pushBiometricsToServer(...)`), а НЕ регресійне покриття L-17 —
  // до фіксу L-17 `saveBiometrics` для weight-only кейсу взагалі не
  // викликався, тож цей тест був би зеленим і без жодного фіксу вище.
  // Лишаємо як окремий гард ("анонімний юзер нічого не пушить"), не
  // приписуючи йому регресійну цінність, якої в нього нема.
  it("НЕ пушить, коли юзер не автентифікований (гард auth-гейта, не регресія L-17)", () => {
    mockUseAuth.mockReturnValue({ user: null });
    render(<BiometricsSection online />);

    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(mockPushBiometricsToServer).not.toHaveBeenCalled();
  });
});

// D7 (adversarial review, P3) — `writeBiometricsPatch` НЕ ідемпотентний:
// кожен виклик із `weightKg` у патчі перебиває `weightUpdatedAt` СВОЇМ
// "зараз". До фіксу `handleSave` писав вагу ДВІЧІ (раз через
// `addDailyLogEntry` -> `recordBodyWeight`, вдруге через
// `saveBiometrics(rest)`, де `weightKg` лишався в патчі) — другий запис
// перебивав LWW-маркер часом кліку по «Зберегти», а не часом самого
// зважування, хоча саме час зважування читає `bodyWeightBootstrap.ts` як
// `at` сідованого заміру.
describe("BiometricsSection — D7 (weightUpdatedAt = час зважування, не час другого запису)", () => {
  it("не перебиває weightUpdatedAt другим записом при збереженні ваги", () => {
    render(<BiometricsSection online />);

    fireEvent.change(screen.getByLabelText("Поточна вага (кг)"), {
      target: { value: "70" },
    });

    // Два реальні виклики `new Date().toISOString()` трапляються в
    // handleSave для цього шляху: один усередині `useDailyLog.addEntry`
    // (timestamp запису журналу), другий — усередині
    // `writeBiometricsPatch`, якби `weightKg` досі лишався в другому
    // патчі. Підміняємо їх послідовними значеннями, щоб детерміновано
    // відрізнити «яке з двох записалось як weightUpdatedAt».
    const toISOSpy = vi.spyOn(Date.prototype, "toISOString");
    toISOSpy
      .mockReturnValueOnce("2026-01-01T00:00:01.000Z") // daily-log entry `at`
      .mockReturnValueOnce("2026-01-01T00:00:02.000Z"); // 2-й запис, якби стався

    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    toISOSpy.mockRestore();

    // Без фіксу: другий запис (`saveBiometrics` з `weightKg` усередині
    // `rest`) перебиває weightUpdatedAt на "...02..." (час кліку), а не
    // на "...01..." (час самого зважування).
    const stored = readStored();
    expect(stored?.weightUpdatedAt).toBe("2026-01-01T00:00:01.000Z");
  });
});
