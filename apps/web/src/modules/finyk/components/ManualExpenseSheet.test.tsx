/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ManualExpenseSheet, upgradeCategory } from "./ManualExpenseSheet";

// Web Speech API check inside `VoiceMicButton` short-circuits to null when
// SpeechRecognition isn't on `window`, which is exactly what jsdom gives
// us — so the mic button is absent and we don't have to mock it.

// `useVisualKeyboardInset` listens to the visualViewport. jsdom lacks
// that API; the hook handles the missing global gracefully (returns 0),
// so no mock needed.

beforeAll(() => {
  // hapticSuccess() pings navigator.vibrate which jsdom doesn't provide.
  // We just want to silence the call so it doesn't throw on submit paths.
  Object.defineProperty(window.navigator, "vibrate", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ─── upgradeCategory unit tests — all 3 storage eras ─────────────────────────
describe("upgradeCategory — era detection", () => {
  it("Era 3: known slug passes through unchanged", () => {
    expect(upgradeCategory("food")).toBe("food");
    expect(upgradeCategory("transport")).toBe("transport");
    expect(upgradeCategory("other")).toBe("other");
  });

  it("Era 2: emoji-prefixed strings upgrade to slug", () => {
    expect(upgradeCategory("🍴 їжа")).toBe("food");
    expect(upgradeCategory("🚗 транспорт")).toBe("transport");
    expect(upgradeCategory("🏷 інше")).toBe("other");
    expect(upgradeCategory("🍔 кафе та ресторани")).toBe("cafe");
    expect(upgradeCategory("💊 здоровʼя")).toBe("health");
  });

  it("Era 1: bare UA labels upgrade to slug", () => {
    expect(upgradeCategory("їжа")).toBe("food");
    expect(upgradeCategory("транспорт")).toBe("transport");
    expect(upgradeCategory("розваги")).toBe("entertainment");
    expect(upgradeCategory("здоровʼя")).toBe("health");
    expect(upgradeCategory("одяг")).toBe("shopping");
    expect(upgradeCategory("комунальні")).toBe("utilities");
    expect(upgradeCategory("техніка")).toBe("tech");
    expect(upgradeCategory("інше")).toBe("other");
  });

  it("null / undefined / unknown value falls back to 'other'", () => {
    expect(upgradeCategory(null)).toBe("other");
    expect(upgradeCategory(undefined)).toBe("other");
    expect(upgradeCategory("")).toBe("other");
    expect(upgradeCategory("🤷 невідоме")).toBe("other");
  });
});

describe("ManualExpenseSheet — useApiForm + zod (Item #8 round-13)", () => {
  it("flags non-positive amount via aria-invalid + zod refine, blocks onSave", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ManualExpenseSheet open onClose={onClose} onSave={onSave} />);

    const amountInput = screen.getByLabelText("Сума ₴");
    fireEvent.change(amountInput, { target: { value: "0" } });
    // Footer Submit button — `Sheet` renders it outside `<form>`, тож
    // тиснемо як user-click; useApiForm.submit() прокидує zod-валідацію.
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(amountInput).toHaveAttribute("aria-invalid", "true");
    });
    expect(screen.getByText("Сума має бути більше 0")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("submits with normalized number amount + ISO date and closes", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ManualExpenseSheet open onClose={onClose} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "120.5" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Кава, продукти/), {
      target: { value: "  Кава  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      description: string;
      amount: number;
      category: string;
      date: string;
    };
    expect(call.amount).toBe(120.5);
    expect(call.description).toBe("Кава");
    // Default category is now slug "other" (F5b — was "🏷 інше").
    expect(call.category).toBe("other");
    // ISO-8601 date string ('YYYY-MM-DDTHH:mm:ss.sssZ').
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to category display label when name is empty (Era 2 initialCategory)", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        // Era 2 emoji string — upgraded to slug "food" at read-time.
        initialCategory="🍴 їжа"
      />,
    );
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "200" },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Додати витрату" }),
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      description: string;
      category: string;
    };
    // Порожня необовʼязкова назва не дублює категорію в заголовку операції.
    expect(call.description).toBe("");
    // Write path always emits slug.
    expect(call.category).toBe("food");
  });

  it("keeps name empty after upgrading an Era 1 initialCategory", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        // Era 1 bare UA label — upgraded to slug "transport" at read-time.
        initialCategory="транспорт"
      />,
    );
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      description: string;
      category: string;
    };
    expect(call.description).toBe("");
    expect(call.category).toBe("transport");
  });
});

// ─── Kind segment switch (fab-and-manual-income spec) ────────────────────────
describe("ManualExpenseSheet — kind segment switch", () => {
  it("defaults to Витрата, switching to Надходження shows income categories + dynamic CTA", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Витрата" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Додати витрату" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));

    expect(screen.getByRole("tab", { name: "Надходження" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const categorySelect = screen.getByLabelText(
      "Категорія",
    ) as HTMLSelectElement;
    const optionLabels = Array.from(categorySelect.options).map(
      (o) => o.textContent,
    );
    expect(optionLabels).toEqual([
      "Обери категорію",
      "Зарплата",
      "Фріланс",
      "Подарунок",
      "Повернення",
      "Інше",
    ]);
    // Expense-only categories must not leak into income mode.
    expect(optionLabels).not.toContain("Продукти");
    expect(
      screen.getByRole("button", { name: "Додати надходження" }),
    ).toBeInTheDocument();
  });

  it("submits kind: income with an income-taxonomy category after switching segment", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));
    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText("Категорія"), {
      target: { value: "salary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати надходження" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const call = onSave.mock.calls[0]![0] as {
      amount: number;
      category: string;
      kind: string;
    };
    expect(call.amount).toBe(5000);
    expect(call.category).toBe("salary");
    expect(call.kind).toBe("income");
  });

  it("editing an income entry preselects the Надходження segment + saved category", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        initialExpense={{
          id: "1",
          description: "Зарплата",
          amount: 5000,
          category: "salary",
          kind: "income",
          date: "2026-06-01T12:00:00.000Z",
        }}
      />,
    );
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Надходження" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Зберегти" }),
    ).toBeInTheDocument();
  });

  it("requires a new category when an edited income becomes an expense", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        onSave={onSave}
        initialExpense={{
          id: "1",
          description: "Зарплата",
          amount: 5000,
          category: "salary",
          kind: "income",
          date: "2026-06-01T12:00:00.000Z",
        }}
      />,
    );
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "Витрата" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Обери категорію");
    });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Категорія"), {
      target: { value: "transport" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: "transport", kind: "expense" }),
    );
  });

  it("editing a legacy type: income entry (no kind, HubChat-era) also preselects Надходження", async () => {
    render(
      <ManualExpenseSheet
        open
        onClose={() => {}}
        initialExpense={{
          id: "2",
          description: "Фріланс проєкт",
          amount: 3000,
          category: "freelance",
          type: "income",
          date: "2026-06-01T12:00:00.000Z",
        }}
      />,
    );
    await act(async () => {});

    expect(screen.getByRole("tab", { name: "Надходження" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switching kind clears the old taxonomy category", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));
    fireEvent.click(screen.getByRole("tab", { name: "Витрата" }));
    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Обери категорію");
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  // Regression: founder report 2026-07-31 — «При відкритті форми додати
  // надходження при виборі категорії не зникає варнінг про необхідність
  // вибору категорії». Switching to Надходження blanks the category with
  // `shouldValidate: true`, but `useApiForm` runs RHF in `mode: "onSubmit"`,
  // so a plain <select> change never re-ran the resolver and the alert stuck.
  it("clears the category warning as soon as a category is picked", async () => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={vi.fn()} />);
    await act(async () => {});

    // Switching kind blanks the category → warning paints immediately.
    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Обери категорію");
    });

    // Picking one must retire it without needing another submit.
    fireEvent.change(screen.getByLabelText("Категорія"), {
      target: { value: "salary" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // Regression: founder report 2026-07-31 — «Ота опція яка вискакує під полем
  // суми з +10, +100, .00 прибери її що з витрат, що з надходжень».
  it.each(["Витрата", "Надходження"])(
    "shows no quick-increment accessory bar under the amount field (%s)",
    async (tab) => {
      render(<ManualExpenseSheet open onClose={() => {}} onSave={vi.fn()} />);
      await act(async () => {});
      fireEvent.click(screen.getByRole("tab", { name: tab }));

      const amount = screen.getByLabelText("Сума ₴");
      fireEvent.focus(amount);
      fireEvent.change(amount, { target: { value: "120" } });

      expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
      for (const label of ["+10", "+100", "+500", ".00"]) {
        expect(
          screen.queryByRole("button", { name: label }),
        ).not.toBeInTheDocument();
      }
    },
  );
});

describe("ManualExpenseSheet — межові значення (beta-input-boundaries)", () => {
  //  — reset-ефект аркуша відкладений у мікротаску; без нього
  // він змив би все, що тест встиг ввести синхронно.
  const openSheet = async (onSave = vi.fn()) => {
    render(<ManualExpenseSheet open onClose={() => {}} onSave={onSave} />);
    await act(async () => {});
    return { onSave, amount: screen.getByLabelText("Сума ₴") };
  };

  it("канонізує « 12,50 » на blur", async () => {
    const { amount } = await openSheet();
    fireEvent.change(amount, { target: { value: " 12,50 " } });
    fireEvent.blur(amount);
    await waitFor(() => expect(amount).toHaveValue("12.50"));
  });

  it("блокує суму понад верхню межу", async () => {
    const { onSave, amount } = await openSheet();
    fireEvent.change(amount, { target: { value: "99999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(
        screen.getByText("Максимальна сума: 10 000 000 ₴"),
      ).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("блокує експоненційний запис замість тихого мільярда", async () => {
    const { onSave, amount } = await openSheet();
    fireEvent.change(amount, { target: { value: "1e9" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(screen.getByText("Сума має бути числом")).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("обрізає довгий опис до 200 символів", async () => {
    await openSheet();
    const desc = screen.getByLabelText(/Назва/);
    expect(desc).toHaveAttribute("maxlength", "200");
  });

  it("попереджає про дату поза мʼяким вікном, але дозволяє зберегти", async () => {
    const { onSave, amount } = await openSheet();
    fireEvent.change(amount, { target: { value: "50" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Не сьогодні? Змінити дату" }),
    );
    fireEvent.change(screen.getByLabelText("Дата"), {
      target: { value: "2019-01-01" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Незвична дата, перевір, чи не помилка в році"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("відкидає дату поза жорстким вікном", async () => {
    const { onSave, amount } = await openSheet();
    fireEvent.change(amount, { target: { value: "50" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Не сьогодні? Змінити дату" }),
    );
    fireEvent.change(screen.getByLabelText("Дата"), {
      target: { value: "3025-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => {
      expect(
        screen.getByText("Дата поза допустимим діапазоном"),
      ).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});

/**
 * Власні категорії користувача в пікері ручної витрати.
 *
 * Спіймано бета-тестером 2026-08-10: «додав власну категорію витрат, а у
 * пікері при додаванні витрат вона не зʼявилася». Причина була не в
 * сортуванні — `sortCategoriesByFrequency` повертає перестановку
 * `CATEGORY_SLUGS`, тобто виключно вбудований набір, і `customCategories`
 * у цей аркуш взагалі не передавались.
 *
 * Другий тест тут важливіший за перший. Показати категорію мало: на шляху
 * збереження стояв `upgradeCategory`, який зводить будь-яке невідоме
 * значення до `DEFAULT_CATEGORY`. Тобто «полагоджений» пікер без цієї
 * частини дав би гіршу поведінку, ніж баг: людина обирає «Кава з друзями»,
 * зберігає — і бачить «Інше», без жодного натяку, що вибір підмінили.
 */
describe("ManualExpenseSheet — власні категорії", () => {
  const CUSTOM = [
    { id: "custom_coffee_friends", label: "Кава з друзями" },
    { id: "custom_pets", label: "Тваринки" },
  ];

  it("показує власні категорії в пікері поряд із вбудованими", () => {
    render(
      <ManualExpenseSheet open onClose={vi.fn()} customCategories={CUSTOM} />,
    );

    expect(
      screen.getByRole("option", { name: "Кава з друзями" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Тваринки" }),
    ).toBeInTheDocument();
    // Вбудовані нікуди не зникли.
    expect(screen.getByRole("option", { name: "Інше" })).toBeInTheDocument();
  });

  it("зберігає обраний власний id, а не підміняє його на «other»", async () => {
    const onSave = vi.fn();
    render(
      <ManualExpenseSheet
        open
        onClose={vi.fn()}
        onSave={onSave}
        customCategories={CUSTOM}
      />,
    );

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText(/Категорія/), {
      target: { value: "custom_coffee_friends" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const call = onSave.mock.calls[0]![0] as {
      category: string;
      description: string;
    };
    expect(call.category).toBe("custom_coffee_friends");
    // Порожня необовʼязкова назва не дублює категорію і не показує сирий id.
    expect(call.description).toBe("");
  });

  it("без власних категорій поведінка не змінилась", async () => {
    const onSave = vi.fn();
    render(<ManualExpenseSheet open onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Сума ₴"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати витрату" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]![0] as { category: string }).category).toBe(
      "other",
    );
  });

  it("надходження власних категорій НЕ показують — у них своя таксономія", () => {
    render(
      <ManualExpenseSheet open onClose={vi.fn()} customCategories={CUSTOM} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Надходження" }));

    expect(
      screen.queryByRole("option", { name: "Кава з друзями" }),
    ).not.toBeInTheDocument();
  });

  it("відновлює власну категорію, якщо вона довантажилась ПІСЛЯ відкриття", async () => {
    // Слоти сховища віддають LS синхронно, а SQLite — «once it warms»
    // (`useStorage.ts`). Аркуш, відкритий у цьому вікні, бачить порожній
    // список і нормалізує категорію редагованої витрати в «other». Без
    // звірки збереження записало б саме «other» — мовчазна підміна.
    const onSave = vi.fn();
    const expense = {
      id: "e1",
      description: "Латте",
      amount: 90,
      category: "custom_coffee_friends",
      date: "2026-08-10T12:00:00.000Z",
      kind: "expense",
    };

    const { rerender } = render(
      <ManualExpenseSheet
        open
        onClose={vi.fn()}
        onSave={onSave}
        initialExpense={expense}
        customCategories={[]}
      />,
    );

    // Категорії приїхали пізніше — той самий аркуш, той самий `openInitKey`.
    rerender(
      <ManualExpenseSheet
        open
        onClose={vi.fn()}
        onSave={onSave}
        initialExpense={expense}
        customCategories={CUSTOM}
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Категорія/) as HTMLSelectElement).value,
      ).toBe("custom_coffee_friends");
    });

    fireEvent.click(screen.getByRole("button", { name: /Зберегти|Додати/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]![0] as { category: string }).category).toBe(
      "custom_coffee_friends",
    );
  });

  it("після звірки вибір користувача більше не перекидає", async () => {
    // `dirtyFields` тут не працює: RHF рахує dirty відносно
    // `defaultValues`, а там уже «other» — тож «людина обрала Інше» і
    // «ми нормалізували в Інше» нерозрізненні. Тому звірка одноразова:
    // один видимий перекид, після якого поле належить людині.
    const expense = {
      id: "e2",
      description: "Латте",
      amount: 90,
      category: "custom_coffee_friends",
      date: "2026-08-10T12:00:00.000Z",
      kind: "expense",
    };
    const { rerender } = render(
      <ManualExpenseSheet
        open
        onClose={vi.fn()}
        initialExpense={expense}
        customCategories={[]}
      />,
    );

    rerender(
      <ManualExpenseSheet
        open
        onClose={vi.fn()}
        initialExpense={expense}
        customCategories={CUSTOM}
      />,
    );

    const select = () =>
      screen.getByLabelText(/Категорія/) as HTMLSelectElement;
    await waitFor(() => expect(select().value).toBe("custom_coffee_friends"));

    // Тепер людина свідомо обирає «Інше» — і воно лишається.
    fireEvent.change(select(), { target: { value: "other" } });
    rerender(
      <ManualExpenseSheet
        open
        onClose={vi.fn()}
        initialExpense={expense}
        customCategories={CUSTOM}
      />,
    );
    await waitFor(() => expect(select().value).toBe("other"));
  });
});
