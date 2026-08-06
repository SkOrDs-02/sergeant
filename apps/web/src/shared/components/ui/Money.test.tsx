/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { Money, Delta } from "./Money";

afterEach(cleanup);

/** Текст без розривів, як його прочитає людина і скопіює буфер. */
function flat(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/[\s\u00a0\u202f]/g, " ");
}

/** Тири за їхнім кеглем: копійки 0.64em, символ 0.72em, знак 0.78em. */
const kopecks = (r: HTMLElement) =>
  r.querySelector(".text-\\[0\\.64em\\]") as HTMLElement;
const symbol = (r: HTMLElement) =>
  r.querySelector(".text-\\[0\\.72em\\]") as HTMLElement;

describe("Money — тири суми", () => {
  it("гривні лишаються повним кеглем, копійки й символ — окремим", () => {
    const { container } = render(<Money amount={1250.5} kopecks />);
    const root = container.firstElementChild as HTMLElement;

    // Ціле — прямий текстовий вузол кореня, без класу розміру: воно і є
    // числом, решта від нього похідна.
    expect(flat(root)).toBe("1 250,50 ₴");

    // Три різні кеглі: копійки найдрібніші, символ трохи більший (на
    // 0.64em ₴ у caption практично зникав), сума — повний.
    expect(flat(kopecks(root))).toBe(",50");
    expect(flat(symbol(root))).toBe(" ₴");
  });

  it("без копійок їх немає ні в тексті, ні в DOM", () => {
    const { container } = render(<Money amount={1250.5} />);
    const root = container.firstElementChild as HTMLElement;
    expect(flat(root)).toBe("1 251 ₴");
    expect(root.querySelector(".text-\\[0\\.64em\\]")).toBeNull();
  });

  it("мінус — окремий тир і справжній U+2212, а не дефіс", () => {
    const { container } = render(<Money amount={-340} />);
    const root = container.firstElementChild as HTMLElement;
    const sign = root.querySelector(".text-\\[0\\.78em\\]");
    expect(sign).not.toBeNull();
    expect(sign!.textContent).toBe("−");
    expect(sign!.textContent).not.toBe("-");
    expect(root.textContent).not.toContain("-");
  });

  it("tabular-nums стоїть завжди — інакше колонка сум перестає бути колонкою", () => {
    const { container } = render(<Money amount={7} />);
    expect(container.firstElementChild).toHaveClass("tabular-nums");
  });

  it("успадковує кегль від викликача, а не нав'язує свій", () => {
    const { container } = render(
      <Money amount={7} className="text-style-title" />,
    );
    expect(container.firstElementChild).toHaveClass("text-style-title");
  });

  it("inherit-тон бере колір самого числа, а не власний приглушений", () => {
    const { container } = render(<Money amount={-7} tone="inherit" />);
    const sign = container.querySelector(".text-\\[0\\.78em\\]");
    // Жодного власного кольору — лише прозорість поверх currentColor.
    expect(sign).toHaveClass("opacity-65");
    expect(sign!.className).not.toMatch(/text-(muted|hero-ink)/);
  });

  it("нескінченність і NaN не ламають рендер", () => {
    const { container } = render(<Money amount={Number.NaN} />);
    expect(flat(container.firstElementChild as HTMLElement)).toBe("0 ₴");
  });
});

describe("Delta — зміна як типографіка, а не бейдж", () => {
  it("не малює плашки: жодного фону чи радіуса", () => {
    const { container } = render(<Delta value={340} polarity="positive" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/\bbg-/);
    expect(root.className).not.toMatch(/\brounded/);
  });

  it("показує явний плюс — бо це зміна, а не сума", () => {
    render(<Delta value={340} polarity="positive" />);
    expect(screen.getByText("+")).toBeInTheDocument();
  });

  /**
   * Колір несе не знак, а СЕНС: +340 ₴ доходу — добре, +340 ₴ витрат —
   * ні. Якби колір читався зі знака, картка витрат зеленіла б від
   * поганої новини.
   */
  it("той самий знак фарбується протилежно за різної полярності", () => {
    const { container: grow } = render(
      <Delta value={340} polarity="positive" />,
    );
    const { container: spend } = render(
      <Delta value={340} polarity="negative" />,
    );
    expect(grow.firstElementChild).toHaveClass("text-success");
    expect(spend.firstElementChild).toHaveClass("text-danger");
  });

  it("нуль нейтральний за будь-якої полярності — це не зміна", () => {
    const { container } = render(<Delta value={0} polarity="positive" />);
    expect(container.firstElementChild).toHaveClass("text-muted");
    expect(container.firstElementChild).not.toHaveClass("text-success");
  });

  /**
   * Регресія: `Delta` фарбує число, а тири лишались `text-muted` — сірий
   * мінус упритул до червоної суми. Знак несе половину повідомлення, тож
   * він мусить бути того самого кольору, лише тихішим.
   */
  it("на забарвленій дельті тири беруть її колір, а не сірий", () => {
    const { container } = render(<Delta value={-340} polarity="positive" />);
    const sign = container.querySelector(".text-\\[0\\.78em\\]");
    const sym = container.querySelector(".text-\\[0\\.72em\\]");
    expect(container.firstElementChild).toHaveClass("text-danger");
    for (const tier of [sign, sym]) {
      expect(tier).toHaveClass("opacity-65");
      expect(tier!.className).not.toMatch(/text-muted/);
    }
  });

  it("на нейтральній дельті тири лишаються приглушеними власним кольором", () => {
    const { container } = render(<Delta value={340} polarity="neutral" />);
    const sign = container.querySelector(".text-\\[0\\.78em\\]");
    expect(sign).toHaveClass("text-muted");
    expect(sign!.className).not.toMatch(/opacity-65/);
  });

  it("приймає інший символ для часток", () => {
    const { container } = render(<Delta value={-12} symbol="%" />);
    expect(
      (container.textContent ?? "").replace(/[\s\u00a0\u202f]/g, " "),
    ).toBe("−12 %");
  });
});

describe("Money — анімоване ціле", () => {
  it("анімується лише ціла частина; копійки й символ стоять на місці", async () => {
    const { container } = render(<Money amount={1250.5} kopecks animate />);
    const root = container.firstElementChild as HTMLElement;

    // Копійки й символ незмінні з першого кадру — вони поза tween-ом.
    expect(flat(kopecks(root))).toBe(",50");
    expect(flat(symbol(root))).toBe(" ₴");

    // А ціле доїжджає до кінцевого значення.
    // Явний таймаут: tween 800 ms надто близько до дефолтних 1000 ms
    // `waitFor`, і на завантаженому CI така пара дає флейк.
    await waitFor(() => expect(flat(root)).toBe("1 250,50 ₴"), {
      timeout: 2000,
    });
  });

  it("порожній symbol не лишає привида пробілу", () => {
    // Вживається там, де символ стоїть один раз на пару чисел
    // («сплачено 1 000 з 5 000 ₴»). Без цієї гілки в розмітці лишався б
    // самотній U+202F — вузький нерозривний пробіл, який нічого не
    // відділяє, і рядок мовчки набував зайвого відступу перед сусіднім
    // словом.
    const { container } = render(<Money amount={1000} symbol="" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.textContent).toBe("1\u00a0000");
    expect(root.textContent).not.toContain("\u202f");
    expect(container.querySelector(".text-\\[0\\.72em\\]")).toBeNull();
  });

  it("знак лишається окремим тиром і не потрапляє в анімацію", async () => {
    const { container } = render(<Money amount={-1250} animate />);
    const sign = container.querySelector(".text-\\[0\\.78em\\]");
    // Мінус стоїть уже на першому кадрі, коли ціле ще нуль: він властивість
    // суми, а не проміжного значення відліку.
    expect(sign!.textContent).toBe("−");
    await waitFor(
      () =>
        expect(flat(container.firstElementChild as HTMLElement)).toBe(
          "−1 250 ₴",
        ),
      { timeout: 2000 },
    );
  });
});
