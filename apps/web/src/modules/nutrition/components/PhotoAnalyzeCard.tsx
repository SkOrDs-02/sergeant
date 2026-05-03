import type { Dispatch, Ref, SetStateAction } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import type { NullableMacros } from "@sergeant/shared";

interface PhotoIngredient {
  name?: string;
}

interface PhotoAnalyzeResult {
  dishName?: string | null;
  macros?: Partial<NullableMacros> | null;
  confidence?: number | null;
  ingredients?: PhotoIngredient[];
  questions?: string[];
}

interface PhotoAnalyzeCardProps {
  busy?: boolean;
  analyzePhoto: () => void | Promise<void>;
  fileRef: Ref<HTMLInputElement>;
  onPickPhoto: (file?: File) => void | Promise<void>;
  photoPreviewUrl?: string | null;
  photoResult?: PhotoAnalyzeResult | null;
  fmtMacro: (v: unknown) => string | number;
  portionGrams: string;
  setPortionGrams: Dispatch<SetStateAction<string>>;
  refinePhoto: () => void | Promise<void>;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  onSaveToLog?: () => void | Promise<void>;
}

export function PhotoAnalyzeCard({
  busy,
  analyzePhoto,
  fileRef,
  onPickPhoto,
  photoPreviewUrl,
  photoResult,
  fmtMacro,
  portionGrams,
  setPortionGrams,
  refinePhoto,
  answers,
  setAnswers,
  onSaveToLog,
}: PhotoAnalyzeCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-style-label text-text">Аналіз фото страви</div>
          <div className="text-xs text-subtle mt-0.5">
            ШІ визначить КБЖВ і запропонує уточнення
          </div>
        </div>
        <button
          type="button"
          onClick={analyzePhoto}
          disabled={busy}
          className={cn(
            "text-style-label shrink-0 px-5 h-10 rounded-xl",
            "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
          )}
        >
          {busy ? "…" : "Аналізувати"}
        </button>
      </div>

      {/* Drop-zone */}
      <label
        className={cn(
          "block w-full rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
          photoPreviewUrl
            ? "border-nutrition/30 bg-nutrition/5"
            : "border-line hover:border-nutrition/40 bg-panel",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => onPickPhoto(e.target.files?.[0])}
          className="sr-only"
          aria-label="Обрати фото страви"
          disabled={busy}
        />
        {photoPreviewUrl ? (
          <img
            src={photoPreviewUrl}
            alt="Обране фото"
            loading="lazy"
            decoding="async"
            width="600"
            height="280"
            className="w-full max-h-[280px] object-cover rounded-2xl"
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-style-label">Натисни щоб обрати фото</span>
            <span className="text-xs">jpg / png / heic · до 4 МБ</span>
          </div>
        )}
      </label>

      {photoResult && (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-text">
                {photoResult.dishName || "Страва"}
              </div>
              {photoResult.confidence != null && (
                <div className="text-xs text-subtle mt-0.5">
                  Впевненість: {Math.round(photoResult.confidence * 100)}%
                </div>
              )}
            </div>
          </div>

          {/* 4 macro tiles */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Ккал", value: fmtMacro(photoResult.macros?.kcal) },
              {
                label: "Білки",
                value: `${fmtMacro(photoResult.macros?.protein_g)} г`,
              },
              {
                label: "Жири",
                value: `${fmtMacro(photoResult.macros?.fat_g)} г`,
              },
              {
                label: "Вуглев.",
                value: `${fmtMacro(photoResult.macros?.carbs_g)} г`,
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-nutrition/20 bg-nutrition/8 px-2 py-2 text-center"
              >
                <SectionHeading
                  as="div"
                  size="xs"
                  variant="nutrition"
                  className="leading-none mb-1"
                >
                  {m.label}
                </SectionHeading>
                <div className="text-sm font-extrabold text-text leading-none">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {onSaveToLog && (
            <button
              type="button"
              onClick={onSaveToLog}
              disabled={busy}
              className={cn(
                "text-style-label w-full h-11 rounded-2xl border border-nutrition/40",
                "text-nutrition-strong dark:text-nutrition hover:bg-nutrition/10 disabled:opacity-50 transition-colors",
              )}
            >
              📓 Зберегти в журнал
            </button>
          )}

          {Array.isArray(photoResult.ingredients) &&
            photoResult.ingredients.length > 0 && (
              <div className="text-xs text-subtle">
                <span className="font-semibold text-text">Інгредієнти: </span>
                {photoResult.ingredients
                  .map((x: PhotoIngredient) => x.name)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}

          {Array.isArray(photoResult.questions) &&
            photoResult.questions.length > 0 && (
              <div className="rounded-2xl border border-line bg-panelHi p-3 grid gap-3">
                <SectionHeading as="div" size="sm">
                  Уточнення порції
                </SectionHeading>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-subtle mb-1">
                      Порція (г), якщо знаєш
                    </div>
                    <Input
                      value={portionGrams}
                      onChange={(e) => setPortionGrams(e.target.value)}
                      inputMode="decimal"
                      placeholder="напр. 320"
                      disabled={busy}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={refinePhoto}
                      disabled={busy}
                      className={cn(
                        "text-style-label w-full h-11 rounded-2xl",
                        "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
                      )}
                    >
                      Перерахувати
                    </button>
                  </div>
                </div>

                {photoResult.questions.slice(0, 6).map((q: string) => (
                  <div key={q}>
                    <div className="text-xs text-subtle mb-1">{q}</div>
                    <Input
                      value={answers[q] || ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [q]: e.target.value }))
                      }
                      placeholder="твоя відповідь…"
                      disabled={busy}
                    />
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </Card>
  );
}
