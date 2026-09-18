import { describe, it, expect } from "vitest";

import { __testing, sanitizeUserImage } from "./sanitizeUserImage.js";

/**
 * Захист від реального інциденту 2026-05-02: юзер з 19 286-байтним
 * `data:image/png;base64,...` у `user.image` колонці. Better Auth
 * писав весь user-обʼєкт у session cookie cache (стратегія `compact`,
 * HMAC-SHA256 + base64), що чанкилось на 7+ Set-Cookie заголовків і
 * призводило до 90+ секундного зависання у Vercel-edge → Railway →
 * iOS Safari ланцюгу. Логін у юзера тривав 90 с і обривався Vercel-ом
 * як 504; фронт перекладав це в «Сервер тимчасово недоступний».
 *
 * Серверний фікс: `databaseHooks.user.{create,update}.before` пропускає
 * payload через `sanitizeUserImage`, який зариває рукою data: URL і
 * рядки > 2 КБ (нулить `image`) — інші поля (`name`, etc.) лишаються.
 */
describe("sanitizeUserImage", () => {
  it("data: URL → image нулиться, reason=data_url", () => {
    const r = sanitizeUserImage({
      name: "Діма",
      image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA…",
    });
    expect(r.imageStripped).toBe(true);
    expect(r.reason).toBe("data_url");
    expect(r.data.image).toBeNull();
    expect(r.data.name).toBe("Діма");
  });

  it("DATA: префікс case-insensitive (DATA:image/jpeg…)", () => {
    const r = sanitizeUserImage({
      image: "DATA:image/jpeg;base64,/9j/4AAQ",
    });
    expect(r.imageStripped).toBe(true);
    expect(r.reason).toBe("data_url");
    expect(r.data.image).toBeNull();
  });

  it("надмірно довгий URL (>2 КБ) → нулиться, reason=too_long", () => {
    const longUrl =
      "https://example.com/" + "x".repeat(__testing.MAX_IMAGE_URL_LENGTH);
    const r = sanitizeUserImage({ image: longUrl });
    expect(r.imageStripped).toBe(true);
    expect(r.reason).toBe("too_long");
    expect(r.data.image).toBeNull();
  });

  it("звичайний HTTPS URL — пропускає без змін", () => {
    const r = sanitizeUserImage({
      image: "https://lh3.googleusercontent.com/a/AAcHTtdXyz=s96-c",
    });
    expect(r.imageStripped).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.data.image).toBe(
      "https://lh3.googleusercontent.com/a/AAcHTtdXyz=s96-c",
    );
  });

  it("payload без поля `image` — return-проксі, нічого не торкається", () => {
    const input = { name: "Тарас", email: "taras@example.com" };
    const r = sanitizeUserImage(input);
    expect(r.imageStripped).toBe(false);
    expect(r.reason).toBeNull();
    // Той самий обʼєкт, не клон — це важливо для no-op шляху, щоб не
    // плодити alloc-и на кожен update без image.
    expect(r.data).toBe(input);
  });

  it("image=null — пропускає без змін (валідний «нема аватарки»)", () => {
    const input = { image: null };
    const r = sanitizeUserImage(input);
    expect(r.imageStripped).toBe(false);
    expect(r.data.image).toBeNull();
  });

  it('image="" — пропускає без змін (треатимо як null-equivalent)', () => {
    const input = { image: "" };
    const r = sanitizeUserImage(input);
    expect(r.imageStripped).toBe(false);
    expect(r.data.image).toBe("");
  });

  it("граничний випадок: рівно MAX_IMAGE_URL_LENGTH символів — не нулиться", () => {
    const url =
      "https://x.example/" +
      "y".repeat(__testing.MAX_IMAGE_URL_LENGTH - "https://x.example/".length);
    expect(url.length).toBe(__testing.MAX_IMAGE_URL_LENGTH);
    const r = sanitizeUserImage({ image: url });
    expect(r.imageStripped).toBe(false);
    expect(r.data.image).toBe(url);
  });

  it("граничний випадок: MAX_IMAGE_URL_LENGTH+1 — нулиться", () => {
    const url =
      "https://x.example/" + "y".repeat(__testing.MAX_IMAGE_URL_LENGTH);
    expect(url.length).toBeGreaterThan(__testing.MAX_IMAGE_URL_LENGTH);
    const r = sanitizeUserImage({ image: url });
    expect(r.imageStripped).toBe(true);
    expect(r.reason).toBe("too_long");
    expect(r.data.image).toBeNull();
  });

  it("input не мутується — створюємо клон", () => {
    const input = {
      name: "Зміна",
      image: "data:image/png;base64,xxx",
    };
    const before = { ...input };
    sanitizeUserImage(input);
    expect(input).toEqual(before);
  });

  it("non-string image (number, object) — пропускає без змін, типи розбирає Better Auth", () => {
    // У Better Auth Zod-валідаторах image — це опціональний string;
    // якщо клієнт дотягнув не-string, ми не корегуємо це (інакше
    // прикриваємо їхні баги) — нехай впадає на наступному кроці.
    const r1 = sanitizeUserImage({ image: 12345 as unknown as string });
    expect(r1.imageStripped).toBe(false);
    expect(r1.data.image).toBe(12345);

    const r2 = sanitizeUserImage({
      image: { foo: "bar" } as unknown as string,
    });
    expect(r2.imageStripped).toBe(false);
  });
});
