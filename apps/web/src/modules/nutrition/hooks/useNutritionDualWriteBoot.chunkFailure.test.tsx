// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Окремий файл навмисно. Щоб змусити `import("../lib/dualWriteBoot.js")`
 * ВІДХИЛИТИСЬ, треба керувати реєстром модулів (`resetModules` + `doMock`),
 * а сусідній `useNutritionDualWriteBoot.test.tsx` спирається на статичні
 * `vi.mock` і кешований модуль. Мішати обидва підходи в одному файлі —
 * найкоротший шлях до тесту, що проходить із неправильної причини.
 *
 * Що саме тут охороняється: динамічна межа створює вікно, у якому «не
 * спрацювало» і «ще не спрацювало» виглядають однаково. Без `.catch` у
 * хуку збій завантаження чанка дав би unhandled rejection, а dual-write
 * лишився б вимкненим МОВЧКИ — записи не доходили б до SQLite аж до
 * перезавантаження, і жодного сигналу про це не було б.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../lib/dualWriteBoot.js");
  vi.doUnmock("@shared/lib");
  vi.doUnmock("../../../core/auth/AuthContext");
});

describe("useNutritionDualWriteBoot — збій завантаження чанка", () => {
  it("звітує про збій і не лишає unhandled rejection", async () => {
    const failure = new Error("chunk load failed");
    const warn = vi.fn();

    vi.resetModules();
    vi.doMock("../lib/dualWriteBoot.js", () => {
      throw failure;
    });
    vi.doMock("../../../core/auth/AuthContext", () => ({
      useAuth: () => ({
        user: { id: "nutrition-u1" },
        status: "authenticated",
      }),
    }));
    vi.doMock("@shared/lib", async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    }));

    const { useNutritionDualWriteBoot } =
      await import("./useNutritionDualWriteBoot");
    renderHook(() => useNutritionDualWriteBoot());

    await waitFor(() => expect(warn).toHaveBeenCalled());

    // Перше позиційне — впізнаваний префікс, щоб лог можна було знайти.
    expect(warn.mock.calls[0]?.[0]).toContain("dual-write boot chunk failed");

    // Друге — сама помилка. Тотожність тут НЕ перевіряємо: vitest обгортає
    // помилку мок-фабрики у власну («There was an error when mocking…»), а
    // оригінал кладе в `cause`. У проді обгортки не буде, тож перевіряємо
    // те, що важить в обох випадках: причина доїжджає до логів, а не
    // губиться — інакше діагностика звелася б до «щось не працює».
    const reported = warn.mock.calls[0]?.[1];
    const chain = [reported, (reported as { cause?: unknown })?.cause]
      .map((e) => (e instanceof Error ? e.message : String(e ?? "")))
      .join(" | ");
    expect(chain).toContain("chunk load failed");
  });
});
