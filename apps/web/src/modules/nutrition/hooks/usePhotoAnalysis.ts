/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation } from "@tanstack/react-query";
import {
  nutritionApi,
  type NutritionPhotoItem,
  type NutritionPhotoResult,
} from "@shared/api";
import { sumMacrosNullable } from "@sergeant/shared";
import { compressImageFile } from "@shared/lib/media/compressImage";
import { fileToBase64 } from "../lib/fileToBase64";
import { formatNutritionError } from "../lib/nutritionErrors";

export interface PhotoAnalysisPayload {
  image_base64: string;
  mime_type: string;
  locale: string;
}

/**
 * Підпис, під яким вільне зауваження людини їде в `qna` разом із
 * відповідями на питання моделі.
 *
 * AI-CONTEXT: сервер приймає `qna` як довільні пари `{question, answer}`
 * (`RefinePhotoSchema`, до 8 пар, по 500 символів) і вкладає їх у промпт
 * як є — тож окремого поля в контракті цьому каналу не треба. Підпис має
 * читатись у промпті сам по собі: модель бачить рядок без нашого UI.
 *
 * Звідки взялось: тестова група 2026-08-12 — розпізнало 2 страви з 3, і
 * жодне з питань моделі не питало про третю. Питання ставить модель, а
 * знає, що саме не так, людина.
 */
export const PHOTO_NOTE_QUESTION = "Вільне зауваження користувача";

/** Ліміт `qna[].answer` у `RefinePhotoSchema` — тримаємо ввід у межах контракту. */
export const PHOTO_NOTE_MAX_LENGTH = 500;

export interface UsePhotoAnalysisParams {
  setBusy: Dispatch<SetStateAction<boolean>>;
  setErr: Dispatch<SetStateAction<string>>;
  setStatusText: Dispatch<SetStateAction<string>>;
}

export interface UsePhotoAnalysisResult {
  fileRef: React.RefObject<HTMLInputElement | null>;
  photoPreviewUrl: string;
  photoResult: NutritionPhotoResult | null;
  lastPhotoPayload: PhotoAnalysisPayload | null;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  /** Вільне зауваження — їде в `qna` під `PHOTO_NOTE_QUESTION`. */
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  portionGrams: string;
  setPortionGrams: Dispatch<SetStateAction<string>>;
  onPickPhoto: (file: File | null | undefined) => Promise<void>;
  analyzePhoto: () => void;
  refinePhoto: () => void;
  /** Прибрати позицію з результату; підсумок перераховується тут же. */
  removePhotoItem: (index: number) => void;
  /** Додати позицію з каталогу; підсумок перераховується тут же. */
  addPhotoItem: (item: NutritionPhotoItem) => void;
  /** Mirrors `analyzeMutation.isPending` — drives the in-card status line. */
  isAnalyzing: boolean;
  /** Mirrors `refineMutation.isPending` — drives the in-card status line. */
  isRefining: boolean;
}

export function usePhotoAnalysis({
  setBusy,
  setErr,
  setStatusText,
}: UsePhotoAnalysisParams): UsePhotoAnalysisResult {
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** Стиснута копія обраного фото (`compressImageFile`) — analyze бере її
   * замість оригіналу з input-а. Скидається на КОЖЕН новий вибір ДО
   * валідації, щоб стара стиснута копія не пережила заміну файлу. */
  const compressedFileRef = useRef<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoResult, setPhotoResult] = useState<NutritionPhotoResult | null>(
    null,
  );
  const [lastPhotoPayload, setLastPhotoPayload] =
    useState<PhotoAnalysisPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [portionGrams, setPortionGrams] = useState("");

  const [prevPhotoResult, setPrevPhotoResult] =
    useState<NutritionPhotoResult | null>(null);
  if (
    photoResult !== prevPhotoResult &&
    photoResult &&
    Array.isArray(photoResult.questions)
  ) {
    setPrevPhotoResult(photoResult);
    setAnswers((cur) => {
      const next = { ...cur };
      photoResult.questions.slice(0, 6).forEach((q) => {
        if (next[q] == null) next[q] = "";
      });
      return next;
    });
    seedPortionGrams(photoResult);
  } else if (photoResult !== prevPhotoResult) {
    setPrevPhotoResult(photoResult);
    seedPortionGrams(photoResult);
  }

  /**
   * Підставити вагу, яку модель уже прочитала, у поле «Порція (г)».
   *
   * WHY. На фото цінника вага написана просто в кадрі ("Вага (кг) 0,314"), і
   * модель кладе її в `portion.gramsApprox` — а поле лишалось порожнім із
   * плейсхолдером «напр. 320», бо `analyzeMutation.onMutate` гасить його на
   * кожен новий аналіз. Людина бачила, що «грами не зчитались», і вводила
   * вручну те, що застосунок уже знав.
   *
   * Тільки коли поле порожнє: щойно людина ввела свою вагу, вона головніша
   * за оцінку моделі — інакше `refine` затирав би власний ввід користувача
   * значенням, яке сам же і повернув.
   */
  function seedPortionGrams(next: NutritionPhotoResult | null): void {
    const grams = next?.portion?.gramsApprox;
    if (typeof grams !== "number" || !Number.isFinite(grams) || grams <= 0) {
      return;
    }
    setPortionGrams((cur) => (cur.trim() ? cur : String(Math.round(grams))));
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        try {
          URL.revokeObjectURL(photoPreviewUrl);
        } catch {
          /* ignore */
        }
      }
    };
  }, [photoPreviewUrl]);

  const onPickPhoto = async (file: File | null | undefined) => {
    setErr("");
    setPhotoResult(null);
    compressedFileRef.current = null;
    if (!file) {
      if (photoPreviewUrl) {
        try {
          URL.revokeObjectURL(photoPreviewUrl);
        } catch {
          /* ignore */
        }
      }
      setPhotoPreviewUrl("");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!/^image\//.test(file.type || "")) {
      setErr("Обери файл зображення (jpg/png/heic).");
      return;
    }
    // Стиснення ДО перевірки розміру: телефонні 4–6 МБ фото після
    // canvas-downscale проходять ліміт самі; `null` = лишай оригінал
    // (skip або декодер не впорався) — тоді спрацює гейт нижче, як і до
    // появи стиснення.
    const compressed = await compressImageFile(file).catch(() => null);
    compressedFileRef.current = compressed;
    const effective = compressed ?? file;
    if (effective.size > 4.5 * 1024 * 1024) {
      setErr(
        "Фото завелике для швидкого аналізу. Обріж або стисни (≈ до 4 МБ).",
      );
      return;
    }
    try {
      if (photoPreviewUrl) {
        try {
          URL.revokeObjectURL(photoPreviewUrl);
        } catch {
          /* ignore */
        }
      }
      const url = URL.createObjectURL(effective);
      setPhotoPreviewUrl(url);
    } catch {
      /* ignore */
    }
  };

  // ─── Analyze photo ──────────────────────────────────────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const original = fileRef.current?.files?.[0];
      if (!original) throw new Error("Спочатку обери фото.");
      // Стиснута копія з onPickPhoto; оригінал — лише fallback (напр.
      // декодер не впорався і compressImageFile віддав null).
      const file = compressedFileRef.current ?? original;
      const b64 = await fileToBase64(file);
      const payload: PhotoAnalysisPayload = {
        image_base64: b64,
        mime_type: file.type || "image/jpeg",
        locale: "uk-UA",
      };
      setLastPhotoPayload(payload);
      return nutritionApi.analyzePhoto(payload);
    },
    onMutate: () => {
      setBusy(true);
      setErr("");
      setStatusText("Аналізую фото…");
      setPhotoResult(null);
      setAnswers({});
      // Новий кадр — новий контекст: зауваження до попередньої страви
      // поїхало б у промпт мовчки і зіпсувало б розбір цієї.
      setNote("");
      setPortionGrams("");
    },
    onSuccess: (data) => {
      setPhotoResult(data?.result || null);
    },
    onError: (err) => {
      setErr(formatNutritionError(err, "Помилка аналізу фото"));
    },
    onSettled: () => {
      setStatusText("");
      setBusy(false);
    },
  });

  const analyzePhoto = useCallback(
    () => analyzeMutation.mutate(),
    [analyzeMutation],
  );

  // ─── Refine photo ───────────────────────────────────────────────────────
  const refineMutation = useMutation({
    mutationFn: () => {
      if (!lastPhotoPayload)
        throw new Error("Немає вихідного фото. Спочатку зроби аналіз.");
      const questions = Array.isArray(photoResult?.questions)
        ? photoResult.questions.slice(0, 6)
        : [];
      const answered = questions
        .map((q) => ({ question: q, answer: String(answers[q] || "").trim() }))
        .filter((x) => x.answer);
      // Зауваження стоїть ПЕРШИМ: `qna` ріжеться до 8 пар на сервері, і
      // якщо модель колись поставить більше питань, першою випаде не та
      // репліка, яку людина написала своїми словами.
      const freeNote = note.trim().slice(0, PHOTO_NOTE_MAX_LENGTH);
      const qna = freeNote
        ? [{ question: PHOTO_NOTE_QUESTION, answer: freeNote }, ...answered]
        : answered;
      const grams = Number(String(portionGrams).replace(",", "."));
      return nutritionApi.refinePhoto({
        ...lastPhotoPayload,
        prior_result: photoResult,
        portion_grams: Number.isFinite(grams) && grams > 0 ? grams : null,
        qna,
        locale: "uk-UA",
      });
    },
    onMutate: () => {
      setBusy(true);
      setErr("");
      setStatusText("Уточнюю порцію та перераховую…");
    },
    onSuccess: (data) => {
      setPhotoResult(data?.result || null);
    },
    onError: (err) => {
      setErr(formatNutritionError(err, "Помилка уточнення"));
    },
    onSettled: () => {
      setStatusText("");
      setBusy(false);
    },
  });

  const refinePhoto = useCallback(
    () => refineMutation.mutate(),
    [refineMutation],
  );

  // Підсумок ЗАВЖДИ перераховується з позицій — тією самою
  // `sumMacrosNullable`, якою його рахує сервер. Тримати тут окрему
  // арифметику означало б два джерела правди для числа, яке людина бачить
  // на екрані: прибрала рядок, а сума лишилась старою (ініціатива 0023).
  const withRecomputedTotal = useCallback(
    (
      result: NutritionPhotoResult,
      items: NutritionPhotoItem[],
    ): NutritionPhotoResult => ({
      ...result,
      items,
      macros: sumMacrosNullable(items.map((i) => i.macros)),
    }),
    [],
  );

  const removePhotoItem = useCallback(
    (index: number) => {
      setPhotoResult((prev) => {
        if (!prev) return prev;
        const items = prev.items.filter((_, i) => i !== index);
        // Порожній список не лишаємо: без жодної позиції картка показала б
        // прочерки замість КБЖВ і кнопку збереження порожнього прийому.
        if (!items.length) return prev;
        return withRecomputedTotal(prev, items);
      });
    },
    [withRecomputedTotal],
  );

  const addPhotoItem = useCallback(
    (item: NutritionPhotoItem) => {
      setPhotoResult((prev) =>
        prev ? withRecomputedTotal(prev, [...prev.items, item]) : prev,
      );
    },
    [withRecomputedTotal],
  );

  return {
    fileRef,
    photoPreviewUrl,
    removePhotoItem,
    addPhotoItem,
    photoResult,
    lastPhotoPayload,
    answers,
    setAnswers,
    note,
    setNote,
    portionGrams,
    setPortionGrams,
    onPickPhoto,
    analyzePhoto,
    refinePhoto,
    // `NutritionApp`'s shared `busy`/`statusText` flip for every nutrition
    // mutation (pantry writes, recipe/day-plan fetches, …), not just this
    // one — that's why they only drive the top-of-page Banner. These two
    // are scoped to `usePhotoAnalysis`'s own mutations so `PhotoAnalyzeCard`
    // can render an inline "Аналізую фото…" status that is never
    // wrong-attributed to an unrelated busy flow (page-audit
    // nutrition-overview-01, issue 3).
    isAnalyzing: analyzeMutation.isPending,
    isRefining: refineMutation.isPending,
  };
}
