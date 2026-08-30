/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { Money, Delta } from "./Money";
import { signedDeltaClass } from "@shared/lib/ui/amountTone";

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

  it("успадковує кегль від викликача, а не навʼязує свій", () => {
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
    expect(grow.firstElementChild).toHaveClass("text-success-strong");
    expect(spend.firstElementChild).toHaveClass("text-danger");
  });

  /**
   * Регресія: `Delta` фарбувала «добре» голим `text-success`, тоді як
   * решта репо давала світлому режиму `-strong`-компаньйон. Одна роль,
   * два визначення й різний контраст на тому самому папері. Тепер колір
   * приходить із `signedDeltaClass`, тож розійтися вони більше не можуть.
   */
  it("бере ту саму пару кольорів, що й решта підписаних дельт", () => {
    const { container } = render(<Delta value={340} polarity="positive" />);
    expect(container.firstElementChild).toHaveClass(
      ...signedDeltaClass(1).split(" "),
    );
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

describe("Money — сума під час появи", () => {
  /**
   * Переписано 2026-08-06 разом із переходом на каскад тирів (П5,
   * варіант C). Доти тут крутився лічильник, і тест чекав, доки ціле
   * «доїде» до значення. Тепер число повне з першого кадру — інакше
   * зелений тест стверджував би про поведінку, якої вже немає.
   */
  it("число повне з першого кадру — анімуються тири, не значення", () => {
    const { container } = render(<Money amount={1250.5} kopecks animate />);
    const root = container.firstElementChild as HTMLElement;
    expect(flat(root)).toBe("1 250,50 ₴");
    expect(flat(kopecks(root))).toBe(",50");
    expect(flat(symbol(root))).toBe(" ₴");
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

describe("Money — каскад тирів (анти-слоп П5, варіант C)", () => {
  it("без `animate` жодних анімаційних класів немає", () => {
    const { container } = render(<Money amount={1250.5} kopecks />);
    expect(container.querySelector(".money-tier")).toBeNull();
  });

  /**
   * Рішення власника 2026-08-06: число зʼявляється відразу, тири
   * вступають за вагою — гривні → копійки → символ. Рух ЧИТАЄ ієрархію,
   * яку збудував П4; лічильник, що тут стояв доти, виглядав однаково в
   * будь-якому дашборді.
   */
  it("тири вступають трьома щаблями за вагою", () => {
    const { container } = render(
      <Money amount={-1250.5} kopecks signed animate />,
    );
    const tiers = [...container.querySelectorAll(".money-tier")];
    // знак, гривні, копійки, символ — чотири вузли у трьох щаблях
    expect(tiers).toHaveLength(4);
    const second = container.querySelector(".money-tier-2");
    const third = container.querySelector(".money-tier-3");
    expect(second?.textContent).toContain("50");
    expect(third?.textContent).toContain("₴");
  });

  /**
   * Знак іде разом із гривнями, а не окремим щаблем: він частина того,
   * що читають першим — величини. Окремо він був би дрібнотою, яка
   * вступає сама по собі.
   */
  it("знак вступає разом із гривнями, не окремо", () => {
    const { container } = render(<Money amount={-340} signed animate />);
    const sign = container.querySelector(".text-\\[0\\.78em\\]");
    expect(sign?.className).toContain("money-tier");
    expect(sign?.className).not.toContain("money-tier-2");
    expect(sign?.className).not.toContain("money-tier-3");
  });
});
