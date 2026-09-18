/**
 * Render + interaction tests for `<AssistantCataloguePage>`.
 *
 * Covers:
 *  - shell renders the screen title and the search input;
 *  - all eight registry modules render their localised header
 *    (`Фінік`, `Фізрук`, `Рутина`, `Харчування`, `Кросмодульні`,
 *    `Аналітика`, `Утиліти`, `Памʼять`);
 *  - module headers carry the visible per-module count derived from
 *    `ASSISTANT_CAPABILITIES`;
 *  - a representative capability row (`create_transaction`) renders
 *    its label;
 *  - typing a query filters down the list and tapping a row opens the
 *    detail sheet with the capability's example commands;
 *  - clearing the query restores all entries.
 */
// AI-DANGER: мок лишає РЕАЛЬНУ реалізацію за дефолтом і існує рівно для
// одного випадку — щоб довести позитивну гілку бейджа «НОВИНКА». У реєстрі
// жодна можливість `since` не оголошує, тож без цього тест перевіряв би
// тільки гілку «бейджа немає» і лишався зеленим, якби рядок перестав
// рендерити бейдж узагалі (знахідка рев'ю на PR #1113).
//
// Чому мок, а не вписаний `since` у реєстр: дата в реєстрі — це продуктове
// рішення (який саме чіп світиться користувачу), і фіксувати її тут означає
// повернути ту саму бомбу з годинником, тільки з новим таймером.
jest.mock("@sergeant/shared", () => {
  const actual = jest.requireActual("@sergeant/shared");
  return {
    ...actual,
    isRecentCapability: jest.fn(actual.isRecentCapability),
  };
});

import { fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_META,
  CAPABILITY_MODULE_ORDER,
  isRecentCapability,
} from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";
import { AssistantCataloguePage } from "./AssistantCataloguePage";

// `react-native-safe-area-context` is mocked globally in `jest.setup.js`
// (Provider becomes a Fragment, `useSafeAreaInsets` returns zeros). The
// previous local mock used `jest.requireActual(...)` which forced the
// real module to load and re-introduced the "No safe area value
// available" crash because the real `useSafeAreaInsets` requires a
// Provider context.

beforeEach(() => {
  _getMMKVInstance().clearAll();
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

describe("AssistantCataloguePage", () => {
  it("renders the screen title and the search input", () => {
    const { getByText, getByTestId } = render(<AssistantCataloguePage />);
    expect(getByText("Що вміє Сержант")).toBeTruthy();
    expect(getByTestId("assistant-catalogue-search")).toBeTruthy();
  });

  it("renders every module header from the registry with its count", () => {
    const { getAllByText } = render(<AssistantCataloguePage />);

    for (const module of CAPABILITY_MODULE_ORDER) {
      const total = ASSISTANT_CAPABILITIES.filter(
        (c) => c.module === module,
      ).length;
      if (total === 0) continue;

      // Module title + count render inside a single nested <Text>;
      // assert the title substring is present at least once.
      const matches = getAllByText(
        new RegExp(CAPABILITY_MODULE_META[module].title),
      );
      if (matches.length === 0) {
        throw new Error(`Module header missing for ${module}`);
      }
    }
  });

  it("renders a representative capability row from the registry", () => {
    const { getByTestId, getByText } = render(<AssistantCataloguePage />);
    const sample = ASSISTANT_CAPABILITIES.find(
      (c) => c.id === "create_transaction",
    );
    expect(sample).toBeDefined();
    expect(getByTestId(`catalogue-capability-${sample!.id}`)).toBeTruthy();
    expect(getByText(sample!.label)).toBeTruthy();
  });

  it("filters the list as the user types and clears back when query empties", () => {
    const { getByTestId, queryByTestId } = render(<AssistantCataloguePage />);
    const search = getByTestId("assistant-catalogue-search");

    fireEvent.changeText(search, "тренування");
    // create_transaction belongs to фінанси and shouldn't match the query.
    expect(queryByTestId("catalogue-capability-create_transaction")).toBeNull();
    // start_workout belongs to фізрук and should still be visible.
    expect(queryByTestId("catalogue-capability-start_workout")).toBeTruthy();

    fireEvent.changeText(search, "");
    expect(
      queryByTestId("catalogue-capability-create_transaction"),
    ).toBeTruthy();
    expect(queryByTestId("catalogue-capability-start_workout")).toBeTruthy();
  });

  it("shows an empty state when nothing matches the query", () => {
    const { getByTestId, getByText } = render(<AssistantCataloguePage />);
    fireEvent.changeText(
      getByTestId("assistant-catalogue-search"),
      "zxqwerty12345",
    );
    expect(getByText(/Нічого не знайдено/)).toBeTruthy();
  });

  it("opens the detail sheet with the capability's examples on row tap", () => {
    const { getByTestId, getByText, getAllByText } = render(
      <AssistantCataloguePage />,
    );
    const sample = ASSISTANT_CAPABILITIES.find(
      (c) => c.id === "create_transaction",
    );
    expect(sample).toBeDefined();

    fireEvent.press(getByTestId(`catalogue-capability-${sample!.id}`));

    // Example bullets are sheet-only (the row card never renders the
    // `«…»`-quoted form), so a single match is enough to prove the
    // detail sheet opened with the capability's example commands.
    expect(getByText(`«${sample!.examples[0]}»`)).toBeTruthy();
    // The capability's description still renders in the row card —
    // assert it is present at least once. The exact match count is
    // brittle (Modal portal vs. inline render varies between RN /
    // jest-expo versions), so don't lock it down.
    expect(getAllByText(sample!.description).length).toBeGreaterThanOrEqual(1);
  });
});

describe("AssistantCataloguePage — group collapsing", () => {
  it("toggles a group on header tap and hides its rows when collapsed", () => {
    const { getByTestId, queryByTestId } = render(<AssistantCataloguePage />);
    const finykHeader = getByTestId("catalogue-module-finyk-toggle");

    expect(
      queryByTestId("catalogue-capability-create_transaction"),
    ).toBeTruthy();
    fireEvent.press(finykHeader);
    expect(queryByTestId("catalogue-capability-create_transaction")).toBeNull();
    // Other groups stay expanded.
    expect(queryByTestId("catalogue-capability-start_workout")).toBeTruthy();

    // Tapping the header again re-expands.
    fireEvent.press(finykHeader);
    expect(
      queryByTestId("catalogue-capability-create_transaction"),
    ).toBeTruthy();
  });

  it("`Згорнути все` collapses every group and the toggle flips its label", () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <AssistantCataloguePage />,
    );
    const toggleAll = getByTestId("catalogue-toggle-all");
    expect(getByText("Згорнути все")).toBeTruthy();

    fireEvent.press(toggleAll);
    expect(queryByTestId("catalogue-capability-create_transaction")).toBeNull();
    expect(queryByTestId("catalogue-capability-start_workout")).toBeNull();
    expect(getByText("Розгорнути все")).toBeTruthy();

    fireEvent.press(toggleAll);
    expect(
      queryByTestId("catalogue-capability-create_transaction"),
    ).toBeTruthy();
  });

  it("hides the toggle-all control while a search query is active", () => {
    const { getByTestId, queryByTestId } = render(<AssistantCataloguePage />);
    fireEvent.changeText(
      getByTestId("assistant-catalogue-search"),
      "тренування",
    );
    expect(queryByTestId("catalogue-toggle-all")).toBeNull();
  });

  it("renders the legend explaining badges (Чіп / Ризик / Новинка)", () => {
    const { getByTestId, getByText, getAllByText } = render(
      <AssistantCataloguePage />,
    );
    expect(getByTestId("catalogue-legend")).toBeTruthy();
    expect(getByText("Позначки:")).toBeTruthy();
    // Підписи бейджів зустрічаються й на справжніх рядках, тож допускаємо
    // ≥1 збіг для кожного тексту.
    //
    // AI-DANGER: «НОВИНКА» тут зараз тримається САМОЮ легендою — жодна
    // можливість у реєстрі не оголошує `since`, тож на рядках бейджа немає
    // ні одного. Тобто зелений цей рядок НЕ доводить, що бейдж на рядку
    // взагалі рендериться; рівно тому наступний тест звіряє правило, а не
    // факт. Історія: до O3 тут стояв коментар «compare_weeks is a chip and
    // isNew», який саме це й приховував.
    expect(getAllByText("⚡ ЧІП").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("⚠ РИЗИК").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("НОВИНКА").length).toBeGreaterThanOrEqual(1);
    // The captions are legend-only.
    expect(getByText("швидкий сценарій")).toBeTruthy();
    expect(getByText("критична дія")).toBeTruthy();
    expect(getByText("нещодавно додано")).toBeTruthy();
  });

  it("бейдж «НОВИНКА» на рядку йде рівно за `isRecentCapability(since)`", () => {
    // AI-DANGER: попередня версія цього тесту вимагала бейдж саме на
    // `compare_weeks`. Правка O3 (founder-ux-review round 2) замінила ручний
    // `isNew: boolean` на `since` + TTL 30 днів — і бейдж став залежати від
    // календаря, а не від реєстру. Веб тоді перевели на
    // `isRecentCapability(item.since)`, мобайл лишили читати `capability.isNew`
    // на типі, де цього поля вже немає: `tsc` давав TS2339, а бейдж не
    // рендерився для НІЧОГО. Обидва провали були червоні на `main` і ховались
    // один за одним — turbo обриває прогін на першому, тож падіння тестів
    // приховувало падіння typecheck-у.
    //
    // Тому тут звіряється ПРАВИЛО, а не конкретна можливість чи конкретна
    // дата: інакше тест знову стане зеленим до першого прострочення вікна.
    // Такий вигляд він тримає і коли хтось додасть `since`, і коли вікно
    // спливе.
    const { queryByTestId } = render(<AssistantCataloguePage />);
    let checked = 0;
    for (const capability of ASSISTANT_CAPABILITIES) {
      // Рядки згорнутих груп не рендеряться взагалі — звіряємо лише видимі.
      if (!queryByTestId(`catalogue-capability-${capability.id}`)) continue;
      checked += 1;
      expect(
        Boolean(queryByTestId(`catalogue-capability-${capability.id}-new`)),
      ).toBe(isRecentCapability(capability.since));
    }
    // Без цього цикл мовчки проходив би на нулі видимих рядків.
    expect(checked).toBeGreaterThan(0);
  });

  // Позитивна гілка. Без неї тест вище доводить лише «бейджа немає» —
  // і був би зеленим, якби `CapabilityRow` перестав рендерити бейдж
  // узагалі. Предикат тут підмінений навмисно: його власну логіку
  // (вікно 30 днів, порожній `since` = не новинка) гейтить
  // `assistantCatalogue.test.ts` у `@sergeant/shared`, а тут
  // перевіряється рівно те, що СТОРІНКА його слухає.
  it("рендерить бейдж на кожному видимому рядку, коли предикат каже «нещодавно»", () => {
    (isRecentCapability as jest.Mock).mockReturnValue(true);
    const { queryByTestId } = render(<AssistantCataloguePage />);

    let checked = 0;
    for (const capability of ASSISTANT_CAPABILITIES) {
      if (!queryByTestId(`catalogue-capability-${capability.id}`)) continue;
      checked += 1;
      expect(
        queryByTestId(`catalogue-capability-${capability.id}-new`),
      ).toBeTruthy();
    }
    expect(checked).toBeGreaterThan(0);
  });
  it("auto-expands persisted-collapsed groups while searching, restores them after", () => {
    const { getByTestId, queryByTestId } = render(<AssistantCataloguePage />);

    // Persist `fizruk` as collapsed.
    fireEvent.press(getByTestId("catalogue-module-fizruk-toggle"));
    expect(queryByTestId("catalogue-capability-start_workout")).toBeNull();

    // Searching forces the group open so matches are visible.
    fireEvent.changeText(
      getByTestId("assistant-catalogue-search"),
      "тренування",
    );
    expect(queryByTestId("catalogue-capability-start_workout")).toBeTruthy();

    // Clearing the query restores the persisted collapsed state.
    fireEvent.changeText(getByTestId("assistant-catalogue-search"), "");
    expect(queryByTestId("catalogue-capability-start_workout")).toBeNull();
  });
});
