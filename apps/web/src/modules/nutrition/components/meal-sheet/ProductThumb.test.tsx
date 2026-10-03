// @vitest-environment jsdom
/**
 * Last validated: 2026-09-13
 * Status: Active
 */
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ProductThumb } from "./ProductThumb";

const OFF_URL =
  "https://images.openfoodfacts.org/images/products/front.200.jpg";

describe("ProductThumb", () => {
  afterEach(cleanup);

  it("показує фото, коли джерело його дало", () => {
    render(<ProductThumb name="Молоко 2.5%" imageUrl={OFF_URL} />);
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe(OFF_URL);
  });

  // Фолбек резолвиться з САМОЇ НАЗВИ — без мережі й без штрихкода, тож
  // квадратик ніколи не буває порожнім.
  it("без фото малює іконку категорії, а не діру", () => {
    const { container } = render(<ProductThumb name="Молоко 2.5%" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  /**
   * РЕГРЕСІЯ, ЯКОЇ ЛЕГКО НЕ ПОМІТИТИ. Хост OFF лежить поза нашим
   * контролем і час від часу віддає 404 на URL, який сам же й видав.
   * Без `onError` у макеті лишалась би діра — і побачити це можна лише
   * на живому мертвому посиланні, не в юнітах і не в typecheck.
   */
  it("битий URL деградує в іконку, а не лишає порожнє місце", () => {
    const { container } = render(
      <ProductThumb name="Молоко 2.5%" imageUrl={OFF_URL} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  // Квадратик має бути чимось для скрінрідера, а не безіменною картинкою.
  it("несе доступну назву категорії", () => {
    render(<ProductThumb name="Молоко 2.5%" imageUrl={OFF_URL} />);
    // Підпис дає контейнер; конкретна категорія — справа `categorizeFood`,
    // тож перевіряємо наявність ролі з іменем, а не саме слово.
    const labelled = screen.getByRole("img", { name: /.+/ });
    expect(labelled).toBeTruthy();
  });

  // `alt=""` навмисно порожній — підпис уже несе контейнер, і дубль
  // змусив би скрінрідер прочитати те саме двічі.
  it("сама картинка не дублює підпис", () => {
    const { container } = render(
      <ProductThumb name="Молоко 2.5%" imageUrl={OFF_URL} />,
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});
