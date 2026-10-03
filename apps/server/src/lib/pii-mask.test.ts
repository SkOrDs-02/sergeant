import { describe, expect, it } from "vitest";

import { maskPii, maskPiiObject } from "./pii-mask.js";

describe("maskPii", () => {
  it("masks common identifiers in plain text", () => {
    const masked = maskPii(
      "Email test.user+tag@example.com, phone +380501112233, IBAN UA123456789012345678901234567, card 4141-1111-1111-1111, tax 1234567890",
    );

    expect(masked).toContain("[email]");
    expect(masked).toContain("[phone]");
    expect(masked).toContain("[iban]");
    expect(masked).toContain("[card]");
    expect(masked).toContain("[taxid]");
    expect(masked).not.toContain("test.user+tag@example.com");
    expect(masked).not.toContain("+380501112233");
  });

  it("is safe to apply repeatedly", () => {
    const once = maskPii("buyer@example.com paid with 4141 1111 1111 1111");

    expect(maskPii(once)).toBe(once);
  });
});

/**
 * Попередня (квадратична) форма email-регекса. Лишена ТІЛЬКИ тут, щоб на малих
 * входах довести, що перепис не змінив маскування там, де воно було правильним.
 * На великих входах її запускати не можна: це і є rel-07.
 */
const LEGACY_EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.]+\.[a-z]{2,}\b/gi;

const EMAIL_CORPUS = [
  "buyer@example.com",
  "test.user+tag@example.com",
  "first.last@sub.domain.example.co.uk",
  "a_b%c@x.io",
  "UPPER.Case@Example.COM",
  "mail me: ivan@example.com, thanks",
  "(ivan@example.com)",
  "<ivan@example.com>",
  "mailto:ivan@example.com?subject=hi",
  "Іван ivan@example.com пише",
  "ivan@example.com та olya@example.org",
  "ivan@example.com.",
  "x@y..com",
  "two@@example.com",
  "no at sign here, just text.com",
  "a@b",
  "a@b.c",
  "@example.com",
  "user@",
  "card 4141-1111-1111-1111 user@example.com tel 0501112233",
];

describe("maskPii: email, еквівалентність старій формі", () => {
  it.each(EMAIL_CORPUS)("збігається зі старою формою: %s", (input) => {
    // Корпус підібрано без навмисних розбіжностей: вони (дефіс у домені,
    // довші за RFC частини) перелічені явно в тесті нижче.
    expect(maskPii(input)).toBe(
      maskPii(input.replace(LEGACY_EMAIL, "[email]")),
    );
  });

  it("плюс-адреса, піддомени й кирилиця поруч маскуються цілою адресою", () => {
    expect(maskPii("Пиши на ivan.p+shop@mail.kyiv.ua, дякую")).toBe(
      "Пиши на [email], дякую",
    );
    expect(maskPii("Іванivan@example.com")).toBe("Іван[email]");
    expect(maskPii("a@x.com;b@y.org")).toBe("[email];[email]");
  });

  it.each([
    "a@x.com.b@y.org",
    "a@x.com-b@y.org",
    "a@x.com+b@y.org",
    "a@x.com%b@y.org",
    "ivan@gmail.com-olya@gmail.com",
    "ivan@example.com.ua+promo@x.com",
    "a@x.com.b@y.org.c@z.net",
    "a@x.com--b@y.org",
  ])("ланцюжок адрес без пробілу не лишає жодної в клірі: %s", (input) => {
    // Регрес look-behind-форми: друга адреса після `.`/`-`/`+`/`%` не мала
    // дозволеного старту й ішла до LLM відкритим текстом.
    expect(maskPii(input)).not.toContain("@");
    expect(maskPii(input)).toContain("[email]");
  });

  it("ланцюжок: кількість масок збігається з кількістю адрес", () => {
    expect(maskPii("a@x.com.b@y.org")).toBe("[email][email]");
    expect(maskPii("ivan@gmail.com-olya@gmail.com")).toBe("[email][email]");
    expect(maskPii("a@x.com.b@y.org.c@z.net")).toBe("[email][email][email]");
  });

  it("не губить маскування там, де стара форма його губила або була вузькою", () => {
    // Дефіс у домені: стара форма не маскувала зовсім.
    expect(maskPii("user@my-host.com")).toBe("[email]");
    expect(maskPii("user@my-host.example-site.org")).toBe("[email]");
    // Локальна частина довша за RFC-64: маскується ЦІЛКОМ, без видимого хвоста.
    const long = `${"a".repeat(100)}@example.com`;
    expect(maskPii(long)).toBe("[email]");
    // Мітка домену довша за RFC-63: так само цілком.
    expect(maskPii(`u@${"b".repeat(80)}.com`)).toBe("[email]");
  });

  it("не маскує те, що не є адресою", () => {
    expect(maskPii("price 100-200 and a.b.c")).toBe("price 100-200 and a.b.c");
    expect(maskPii("a@b")).toBe("a@b");
    expect(maskPii("user@")).toBe("user@");
    expect(maskPii("@example.com")).toBe("@example.com");
  });
});

/**
 * ReDoS-гейт (аудит 2026-10-01, rel-07). До переписування email-регекса
 * 8000 символів "a-" давали ~70 мс, 50 таких повідомлень ~3,5 с, а context у
 * 40000 символів ~1,9 с синхронно в main thread перед викликом LLM.
 *
 * Поріг свідомо не «ледве швидко»: лінійна форма робить 8000 символів за
 * частки мілісекунди, а квадратична на 8000 вже далеко за 50 мс, тож 50 мс
 * ловить регрес без флейків на повільному CI. Додатково міряємо ЗРОСТАННЯ:
 * вхід ×8 не може коштувати більше ніж у десятки разів, а квадратичний
 * коштував би ×64.
 */
describe("maskPii: захист від ReDoS (rel-07)", () => {
  const ADVERSARIAL_UNITS = [
    "a-",
    "a.",
    "-",
    ".",
    "a",
    "a-a.",
    "a%+_.-",
    "a@",
    "a@a.",
    "1-",
  ];

  function timeMs(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
  }

  it.each(ADVERSARIAL_UNITS)(
    "8000+ символів %j маскується менш ніж за 50 мс",
    (unit) => {
      const input = unit.repeat(Math.ceil(8_000 / unit.length) + 1);
      expect(input.length).toBeGreaterThanOrEqual(8_000);
      // Прогрів JIT, щоб не міряти компіляцію регекса.
      maskPii(input);
      const elapsed = timeMs(() => maskPii(input));
      expect(elapsed).toBeLessThan(50);
    },
  );

  it("доменна частина без `@`-колізій теж лінійна: a@ + 'a.'×N", () => {
    const input = `a@${"a.".repeat(5_000)}1`;
    maskPii(input);
    expect(timeMs(() => maskPii(input))).toBeLessThan(50);
    const input2 = `a@${"a-".repeat(5_000)}`;
    maskPii(input2);
    expect(timeMs(() => maskPii(input2))).toBeLessThan(50);
  });

  it("повний шлях чату: 50 повідомлень по 8000 + context 40000 < 50 мс сумарно", () => {
    const message = "a-".repeat(4_000);
    const context = "a-".repeat(20_000);
    maskPii(message);
    const elapsed = timeMs(() => {
      for (let i = 0; i < 50; i += 1) maskPii(message);
      maskPii(context);
    });
    expect(elapsed).toBeLessThan(50);
  });

  it("час росте лінійно, а не квадратично (вхід ×8 → не більш ніж ×24)", () => {
    const small = "a-".repeat(2_000);
    const large = "a-".repeat(16_000);
    // Порожній прогін для прогріву, потім медіана з 5 замірів, щоб один
    // GC-пік не зробив тест флейковим.
    maskPii(small);
    maskPii(large);
    const median = (input: string): number => {
      const samples = Array.from({ length: 5 }, () =>
        timeMs(() => maskPii(input)),
      ).sort((a, b) => a - b);
      return samples[2] as number;
    };
    const tSmall = Math.max(median(small), 0.5);
    const tLarge = median(large);
    expect(tLarge / tSmall).toBeLessThan(24);
  });

  it("не втрачає маскування в довгому тексті: адреса в кінці 100 КБ дефісів", () => {
    const input = `${"a-".repeat(50_000)} ivan@example.com`;
    const masked = maskPii(input);
    expect(masked.endsWith(" [email]")).toBe(true);
    expect(masked).not.toContain("ivan@example.com");
  });
});

describe("maskPiiObject", () => {
  it("masks shallow and nested string leaves without mutating the input", () => {
    const input = {
      note: "call 0501112233",
      nested: {
        email: "person@example.com",
      },
      list: ["person@example.com"],
      count: 2,
      nil: null,
    };

    const masked = maskPiiObject(input);

    expect(masked).toEqual({
      note: "call [phone]",
      nested: {
        email: "[email]",
      },
      list: ["person@example.com"],
      count: 2,
      nil: null,
    });
    expect(input.nested.email).toBe("person@example.com");
  });
});
