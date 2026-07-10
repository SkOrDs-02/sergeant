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
import { nutritionApi, type NutritionPhotoResult } from "@shared/api";
import { fileToBase64 } from "../lib/fileToBase64";
import { formatNutritionError } from "../lib/nutritionErrors";

export interface PhotoAnalysisPayload {
  image_base64: string;
  mime_type: string;
  locale: string;
}

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
  portionGrams: string;
  setPortionGrams: Dispatch<SetStateAction<string>>;
  onPickPhoto: (file: File | null | undefined) => Promise<void>;
  analyzePhoto: () => void;
  refinePhoto: () => void;
}

export function usePhotoAnalysis({
  setBusy,
  setErr,
  setStatusText,
}: UsePhotoAnalysisParams): UsePhotoAnalysisResult {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoResult, setPhotoResult] = useState<NutritionPhotoResult | null>(
    null,
  );
  const [lastPhotoPayload, setLastPhotoPayload] =
    useState<PhotoAnalysisPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
  } else if (photoResult !== prevPhotoResult) {
    setPrevPhotoResult(photoResult);
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
    if (!file) return;
    if (!/^image\//.test(file.type || "")) {
      setErr("Обери файл зображення (jpg/png/heic).");
      return;
    }
    if (file.size > 4.5 * 1024 * 1024) {
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
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrl(url);
    } catch {
      /* ignore */
    }
  };

  // ─── Analyze photo ──────────────────────────────────────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Спочатку обери фото.");
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
      const qna = questions
        .map((q) => ({ question: q, answer: String(answers[q] || "").trim() }))
        .filter((x) => x.answer);
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

  return {
    fileRef,
    photoPreviewUrl,
    photoResult,
    lastPhotoPayload,
    answers,
    setAnswers,
    portionGrams,
    setPortionGrams,
    onPickPhoto,
    analyzePhoto,
    refinePhoto,
  };
}
