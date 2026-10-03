// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    nutritionApi: {
      analyzePhoto: vi.fn(),
      refinePhoto: vi.fn(),
    },
  };
});
vi.mock("../lib/fileToBase64.js", () => ({
  fileToBase64: vi.fn(() => Promise.resolve("BASE64")),
}));
// Дефолт `null` = «лишай оригінал» — те саме, що реальний хелпер робить у
// jsdom (немає декодера/canvas): решта тестів бачить стару поведінку.
const compressImageFileMock = vi.hoisted(() =>
  vi.fn((_file: File): Promise<File | null> => Promise.resolve(null)),
);
vi.mock("@shared/lib/media/compressImage", () => ({
  compressImageFile: compressImageFileMock,
}));

import { PHOTO_NOTE_QUESTION, usePhotoAnalysis } from "./usePhotoAnalysis";
import { nutritionApi } from "@shared/api";
import { fileToBase64 } from "../lib/fileToBase64.js";
const apiAnalyzePhoto = nutritionApi.analyzePhoto as unknown as ReturnType<
  typeof vi.fn
>;
const apiRefinePhoto = nutritionApi.refinePhoto as unknown as ReturnType<
  typeof vi.fn
>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function renderUsePhotoAnalysis() {
  const setBusy = vi.fn();
  const setErr = vi.fn();
  const setStatusText = vi.fn();
  const { result } = renderHook(
    () => usePhotoAnalysis({ setBusy, setErr, setStatusText }),
    { wrapper: makeWrapper() },
  );
  return { result, setBusy, setErr, setStatusText };
}

// Stub fileRef.current so analyzeMutation reads file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachFile(result: any, file: File) {
  // fileRef is a ref object; hook returns it directly.
  result.current.fileRef.current = { files: [file] };
}

function fakeImageFile() {
  // jsdom File is fine
  return new File([new Uint8Array([1, 2, 3])], "meal.jpg", {
    type: "image/jpeg",
  });
}

describe("usePhotoAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("редагування позицій (ініціатива 0023)", () => {
    const twoItems = {
      isFood: true,
      dishName: "Обід",
      items: [
        {
          name: "Котлета",
          macros: { kcal: 300, protein_g: 21, fat_g: 18, carbs_g: 6 },
          gramsApprox: 120,
          confidence: 0.9,
        },
        {
          name: "Пюре",
          macros: { kcal: 180, protein_g: 4, fat_g: 6, carbs_g: 27 },
          gramsApprox: 200,
          confidence: 0.7,
        },
      ],
      macros: { kcal: 480, protein_g: 25, fat_g: 24, carbs_g: 33 },
    };

    async function seedResult(payload: unknown) {
      apiAnalyzePhoto.mockResolvedValueOnce({ result: payload });
      const rendered = renderUsePhotoAnalysis();
      attachFile(rendered.result, fakeImageFile());
      act(() => {
        rendered.result.current.analyzePhoto();
      });
      await waitFor(() => {
        expect(rendered.result.current.photoResult).not.toBeNull();
      });
      return rendered.result;
    }

    it("прибирає позицію і перераховує підсумок із того, що лишилось", async () => {
      const result = await seedResult(twoItems);

      act(() => {
        result.current.removePhotoItem(1);
      });

      expect(result.current.photoResult?.items).toHaveLength(1);
      expect(result.current.photoResult?.items[0]?.name).toBe("Котлета");
      // Підсумок зменшився рівно на КБЖВ прибраної позиції — інакше екран
      // показував би число, якого в рядках немає.
      expect(result.current.photoResult?.macros).toEqual({
        kcal: 300,
        protein_g: 21,
        fat_g: 18,
        carbs_g: 6,
      });
    });

    it("не дає прибрати останню позицію", async () => {
      const result = await seedResult({
        ...twoItems,
        items: [twoItems.items[0]],
        macros: twoItems.items[0]?.macros,
      });

      act(() => {
        result.current.removePhotoItem(0);
      });

      // Порожній список означав би прочерки замість КБЖВ і кнопку
      // збереження порожнього прийому.
      expect(result.current.photoResult?.items).toHaveLength(1);
    });

    it("додає позицію з каталогу і збільшує підсумок", async () => {
      const result = await seedResult(twoItems);

      act(() => {
        result.current.addPhotoItem({
          name: "Сирник",
          macros: { kcal: 220, protein_g: 12, fat_g: 9, carbs_g: 22 },
          gramsApprox: 100,
          confidence: 1,
        });
      });

      expect(result.current.photoResult?.items).toHaveLength(3);
      expect(result.current.photoResult?.macros.kcal).toBe(700);
    });

    it("лишає макрос null, коли жодна позиція його не має", async () => {
      const result = await seedResult({
        isFood: true,
        dishName: "Салат",
        items: [
          {
            name: "Салат",
            macros: { kcal: 120, protein_g: null, fat_g: 9, carbs_g: null },
            gramsApprox: null,
            confidence: 0.6,
          },
          {
            name: "Соус",
            macros: { kcal: 60, protein_g: null, fat_g: null, carbs_g: null },
            gramsApprox: null,
            confidence: 0.4,
          },
        ],
        macros: { kcal: 180, protein_g: null, fat_g: 9, carbs_g: null },
      });

      act(() => {
        result.current.removePhotoItem(1);
      });

      // Нуль замість невідомого не ставимо ніколи — те саме правило, що на
      // сервері (`sumMacrosNullable`).
      expect(result.current.photoResult?.macros).toEqual({
        kcal: 120,
        protein_g: null,
        fat_g: 9,
        carbs_g: null,
      });
    });
  });

  describe("analyzePhoto", () => {
    it("posts image payload and stores photoResult on success", async () => {
      apiAnalyzePhoto.mockResolvedValueOnce({
        result: { name: "Борщ", kcal: 300 },
      });
      const { result, setBusy, setErr } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });

      await waitFor(() => {
        expect(result.current.photoResult).toEqual({
          name: "Борщ",
          kcal: 300,
        });
      });

      expect(apiAnalyzePhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          image_base64: "BASE64",
          mime_type: "image/jpeg",
          locale: "uk-UA",
        }),
      );
      expect(result.current.lastPhotoPayload).toEqual(
        expect.objectContaining({ image_base64: "BASE64" }),
      );
      // Lifecycle flags toggled.
      expect(setBusy).toHaveBeenCalledWith(true);
      expect(setBusy).toHaveBeenLastCalledWith(false);
      expect(setErr).toHaveBeenCalledWith("");
      // `isAnalyzing` settles back to false once the mutation resolves —
      // this is what `PhotoAnalyzeCard`'s inline status line reads.
      expect(result.current.isAnalyzing).toBe(false);
    });

    // Репорт тестера 2026-08-11: на фото цінника Сільпо вага стоїть просто в
    // кадрі («Вага (кг) 0,314»), модель клала її в `portion.gramsApprox` — а
    // поле «Порція (г)» лишалось порожнім із плейсхолдером «напр. 320», бо
    // `onMutate` гасить його на кожен аналіз. Виглядало як «грами не зчитались».
    it("seeds the portion field from the grams the model already read", async () => {
      apiAnalyzePhoto.mockResolvedValueOnce({
        result: {
          dishName: "Салат із запечених овочів",
          portion: { label: "314 г з етикетки", gramsApprox: 314 },
          questions: ["Чи є на етикетці таблиця харчової цінності?"],
        },
      });
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });

      await waitFor(() => {
        expect(result.current.portionGrams).toBe("314");
      });
    });

    it("never overwrites grams the user typed", async () => {
      apiAnalyzePhoto.mockResolvedValueOnce({
        result: {
          dishName: "Салат",
          portion: { label: "314 г", gramsApprox: 314 },
          questions: ["Яка вага порції?"],
        },
      });
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.setPortionGrams("250");
      });
      act(() => {
        result.current.analyzePhoto();
      });

      await waitFor(() => {
        expect(result.current.photoResult).not.toBeNull();
      });
      // `onMutate` чистить поле перед запитом, тож після відповіді сюди
      // лягає оцінка моделі — але це вже НЕ ввід користувача, він стерся
      // разом із попереднім результатом. Пін тут на тому, що підстановка
      // не бʼється з непорожнім полем: див. `refine` нижче.
      expect(result.current.portionGrams).toBe("314");

      apiRefinePhoto.mockResolvedValueOnce({
        result: {
          dishName: "Салат",
          portion: { label: "314 г", gramsApprox: 314 },
          questions: [],
        },
      });
      act(() => {
        result.current.setPortionGrams("250");
      });
      act(() => {
        result.current.refinePhoto();
      });

      await waitFor(() => {
        expect(apiRefinePhoto).toHaveBeenCalled();
      });
      expect(result.current.portionGrams).toBe("250");
    });

    it("flips isAnalyzing true while the mutation is in flight", async () => {
      let resolveAnalyze!: (v: unknown) => void;
      apiAnalyzePhoto.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAnalyze = resolve;
        }),
      );
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });

      await waitFor(() => expect(result.current.isAnalyzing).toBe(true));
      expect(result.current.isRefining).toBe(false);

      await act(async () => {
        resolveAnalyze({ result: { name: "Борщ" } });
      });

      await waitFor(() => expect(result.current.isAnalyzing).toBe(false));
    });

    it("surfaces error when no file is selected", async () => {
      const { result, setErr } = renderUsePhotoAnalysis();
      // no file attached
      act(() => {
        result.current.analyzePhoto();
      });

      await waitFor(() => {
        expect(setErr).toHaveBeenCalledWith("Спочатку обери фото.");
      });
      expect(apiAnalyzePhoto).not.toHaveBeenCalled();
    });

    it("surfaces API error message via setErr", async () => {
      apiAnalyzePhoto.mockRejectedValueOnce(new Error("Сервер AI впав"));
      const { result, setErr } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });

      await waitFor(() => {
        expect(setErr).toHaveBeenCalledWith("Сервер AI впав");
      });
      expect(result.current.photoResult).toBeNull();
    });
  });

  describe("refinePhoto", () => {
    it("throws before any analyze has run (no lastPhotoPayload)", async () => {
      const { result, setErr } = renderUsePhotoAnalysis();
      act(() => {
        result.current.refinePhoto();
      });
      await waitFor(() => {
        expect(setErr).toHaveBeenCalledWith(
          "Немає вихідного фото. Спочатку зроби аналіз.",
        );
      });
      expect(apiRefinePhoto).not.toHaveBeenCalled();
    });

    it("reuses lastPhotoPayload and updates photoResult", async () => {
      apiAnalyzePhoto.mockResolvedValueOnce({
        result: { name: "v1", questions: ["Яка порція?"] },
      });
      apiRefinePhoto.mockResolvedValueOnce({
        result: { name: "v2", kcal: 420 },
      });
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.current.photoResult as any)?.name).toBe("v1"),
      );

      act(() => {
        result.current.setPortionGrams("250");
        result.current.setAnswers((a) => ({ ...a, "Яка порція?": "звичайна" }));
      });

      act(() => {
        result.current.refinePhoto();
      });
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.current.photoResult as any)?.name).toBe("v2"),
      );

      expect(apiRefinePhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          image_base64: "BASE64",
          portion_grams: 250,
          qna: [{ question: "Яка порція?", answer: "звичайна" }],
          locale: "uk-UA",
        }),
      );
    });

    it("sends the free-form note first, ahead of the model's own questions", async () => {
      // Порядок не косметичний: сервер ріже `qna` до 8 пар, і при повному
      // наборі питань першим випав би саме той рядок, який людина написала
      // своїми словами (звіт тестової групи 2026-08-12 — «третє не булочка,
      // а сирник»).
      apiAnalyzePhoto.mockResolvedValueOnce({
        result: { name: "v1", questions: ["Яка порція?"] },
      });
      apiRefinePhoto.mockResolvedValueOnce({ result: { name: "v2" } });
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.current.photoResult as any)?.name).toBe("v1"),
      );

      act(() => {
        result.current.setAnswers((a) => ({ ...a, "Яка порція?": "звичайна" }));
        result.current.setNote("  третє — не булочка, а сирник  ");
      });

      act(() => {
        result.current.refinePhoto();
      });
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.current.photoResult as any)?.name).toBe("v2"),
      );

      expect(apiRefinePhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          qna: [
            {
              question: PHOTO_NOTE_QUESTION,
              answer: "третє — не булочка, а сирник",
            },
            { question: "Яка порція?", answer: "звичайна" },
          ],
        }),
      );
    });

    it("omits the note pair when the field is blank", async () => {
      apiAnalyzePhoto.mockResolvedValueOnce({ result: { name: "v1" } });
      apiRefinePhoto.mockResolvedValueOnce({ result: { name: "v2" } });
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.analyzePhoto();
      });
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.current.photoResult as any)?.name).toBe("v1"),
      );

      act(() => {
        result.current.setNote("   ");
      });
      act(() => {
        result.current.refinePhoto();
      });
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((result.current.photoResult as any)?.name).toBe("v2"),
      );

      expect(apiRefinePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ qna: [] }),
      );
    });

    it("drops the note when a new photo is analyzed", async () => {
      // Зауваження до попередньої страви поїхало б у промпт наступного
      // кадру мовчки — і зіпсувало б розбір, який людина навіть не
      // повʼязала б із тим, що вона колись написала.
      apiAnalyzePhoto.mockResolvedValue({ result: { name: "v1" } });
      const { result } = renderUsePhotoAnalysis();
      attachFile(result, fakeImageFile());

      act(() => {
        result.current.setNote("третє — сирник");
      });
      expect(result.current.note).toBe("третє — сирник");

      act(() => {
        result.current.analyzePhoto();
      });
      await waitFor(() => expect(result.current.note).toBe(""));
    });
  });

  describe("onPickPhoto", () => {
    it("rejects non-image files", async () => {
      const { result, setErr } = renderUsePhotoAnalysis();
      const txt = new File(["hello"], "note.txt", { type: "text/plain" });
      await act(async () => {
        await result.current.onPickPhoto(txt);
      });
      expect(setErr).toHaveBeenCalledWith(
        "Обери файл зображення (jpg/png/heic).",
      );
    });

    it("rejects oversized files", async () => {
      const { result, setErr } = renderUsePhotoAnalysis();
      // 5 MB image — above 4.5 MB cap
      const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.jpg", {
        type: "image/jpeg",
      });
      await act(async () => {
        await result.current.onPickPhoto(big);
      });
      expect(setErr).toHaveBeenCalledWith(
        "Фото завелике для швидкого аналізу. Обріж або стисни (≈ до 4 МБ).",
      );
    });

    it("приймає завелике фото, коли стиснення дало малий JPEG, і analyze шле саме його", async () => {
      const small = new File([new Uint8Array(1000)], "big.jpg", {
        type: "image/jpeg",
      });
      compressImageFileMock.mockResolvedValueOnce(small);
      const { result, setErr } = renderUsePhotoAnalysis();
      const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", {
        type: "image/heic",
      });

      await act(async () => {
        await result.current.onPickPhoto(big);
      });
      expect(setErr).not.toHaveBeenCalledWith(
        "Фото завелике для швидкого аналізу. Обріж або стисни (≈ до 4 МБ).",
      );

      // analyze читає оригінал з input-а, але шле стиснуту копію.
      attachFile(result, big);
      await act(async () => {
        result.current.analyzePhoto();
      });
      await waitFor(() =>
        expect(vi.mocked(fileToBase64)).toHaveBeenCalledWith(small),
      );
    });
  });
});
