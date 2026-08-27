// @vitest-environment jsdom
/**
 * Last validated: 2026-08-23
 * Status: Active
 *
 * Регресія: сканер, відкритий ПОВЕРХ аркуша, лишався видимим, але
 * мертвим.
 *
 * `Sheet` вмикає `inertBackground`, і background-inert manager ставить
 * `inert` + `aria-hidden` на все, що не веде до відкритого діалогу.
 * `Sheet` портується в `<body>`, а `BarcodeScanner` — ні: він рендериться
 * там, де його поставив `AddMealSheet`, тобто всередині `#root`. Отже
 * аркуш робив `#root` інертним РАЗОМ зі сканером усередині.
 *
 * Наслідок у браузері (замір на превʼю-білді 2026-08-23): сканер малюється
 * зверху (`z-130` проти `z-120` аркуша), але `document.elementsFromPoint`
 * у центрі відео повертає елементи АРКУША — і хрестик, і затемнення
 * сканера не отримують подій, а тапи «провалюються» на кнопки під ним.
 *
 * Лікується не z-index-ом і не `pointer-events`, а реєстрацією сканера
 * як діалогу: менеджер сам зніме `inert` з гілки, що веде до нього, і
 * перенесе його на аркуш. Патерн уже описаний у `useDialogFocusTrap`
 * як випадок «ConfirmDialog поверх Sheet».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { BarcodeScanner } from "./BarcodeScanner";
import { Sheet } from "@shared/components/ui/Sheet";

const videoRefMock = { current: null };

vi.mock("../hooks/useBarcodeScanner", () => ({
  useBarcodeScanner: () => ({ isNative: false }),
  useWebScanner: () => ({ videoRef: videoRefMock, status: "" }),
  scanBarcodeNative: () => new Promise(() => {}),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

/**
 * Той самий розклад DOM, що й у проді: аркуш іде порталом у `<body>`,
 * сканер лишається у вузлі застосунку — сусідові аркуша, не нащадку.
 */
let appRoot: HTMLDivElement;

beforeEach(() => {
  appRoot = document.createElement("div");
  appRoot.id = "root";
  document.body.appendChild(appRoot);
});

afterEach(() => {
  cleanup();
  appRoot.remove();
});

describe("BarcodeScanner поверх відкритого Sheet", () => {
  it("не лишається всередині inert-піддерева", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Звідки страва?" zIndex={120}>
        <div>вміст аркуша</div>
      </Sheet>,
    );
    // Аркуш уже зробив вузол застосунку інертним — саме в цей вузол
    // `AddMealSheet` і рендерить сканер.
    expect(appRoot.hasAttribute("inert")).toBe(true);

    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />, {
      container: appRoot,
    });

    // Гілка до відкритого сканера мусить ожити, інакше його хрестик і
    // затемнення не отримають жодного кліку.
    expect(appRoot.hasAttribute("inert")).toBe(false);
    expect(appRoot.getAttribute("aria-hidden")).toBeNull();
  });

  it("лишає власний хрестик клікабельним", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Звідки страва?" zIndex={120}>
        <div>вміст аркуша</div>
      </Sheet>,
    );
    const onClose = vi.fn();
    render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />, {
      container: appRoot,
    });

    // Саме те, що не працювало в тестера: хрестик видно, але він мертвий,
    // бо лежить у піддереві з `inert`. Перевіряємо ВСЮ гілку до `<body>`,
    // а не лише сам вузол застосунку — inert успадковується згори.
    const closeButtons = screen.getAllByRole("button", {
      name: "Закрити сканер",
    });
    expect(closeButtons.length).toBeGreaterThan(0);
    for (const button of closeButtons) {
      let node: HTMLElement | null = button;
      while (node && node !== document.body) {
        expect(node.hasAttribute("inert")).toBe(false);
        node = node.parentElement;
      }
    }

    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape закриває сканер і НЕ чіпає аркуш під ним", () => {
    // Слухач Escape у `useDialogFocusTrap` висить на `document`, тож доти
    // його отримували обидва діалоги і закривались разом. Тепер клавіші
    // належать верхньому діалогу стосу — див. `useDialogFocusTrap.test.ts`
    // § «стос діалогів».
    const onCloseScanner = vi.fn();
    const onCloseSheet = vi.fn();
    render(
      <Sheet open onClose={onCloseSheet} title="Звідки страва?" zIndex={120}>
        <div>вміст аркуша</div>
      </Sheet>,
    );
    render(<BarcodeScanner onDetected={vi.fn()} onClose={onCloseScanner} />, {
      container: appRoot,
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseScanner).toHaveBeenCalledTimes(1);
    expect(onCloseSheet).not.toHaveBeenCalled();
  });
});

/**
 * Сценарій «камера код не бере». Доти його не існувало взагалі: zxing
 * крутив кадри вічно, а єдиною порадою був підпис «введи код вручну» —
 * поля для коду в аркуші немає, сканування лише камерою.
 */
describe("BarcodeScanner — код не зчитується", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("мовчить, поки скан ще має шанс", () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />, {
      container: appRoot,
    });
    act(() => void vi.advanceTimersByTime(14_000));
    expect(screen.queryByText(/Не зчитується/)).toBeNull();
    expect(screen.getByText(/Наведи камеру на штрихкод/)).toBeInTheDocument();
  });

  it("не радить вводити КОД — його ніде вводити", () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />, {
      container: appRoot,
    });
    act(() => void vi.advanceTimersByTime(20_000));
    expect(document.body.textContent).not.toMatch(/введи код вручну/i);
  });

  it("через 15 с пропонує реальний вихід і веде на ручний ввід", () => {
    const onManualEntry = vi.fn();
    render(
      <BarcodeScanner
        onDetected={vi.fn()}
        onClose={vi.fn()}
        onManualEntry={onManualEntry}
      />,
      { container: appRoot },
    );
    act(() => void vi.advanceTimersByTime(15_000));

    expect(screen.getByText(/Не зчитується/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ввести вручну" }));
    expect(onManualEntry).toHaveBeenCalledTimes(1);
  });

  it("без onManualEntry лишає підказку, але не малює кнопку в нікуди", () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />, {
      container: appRoot,
    });
    act(() => void vi.advanceTimersByTime(15_000));
    expect(screen.getByText(/Не зчитується/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ввести вручну" })).toBeNull();
  });
});
