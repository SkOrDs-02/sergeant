/**
 * Last validated: 2026-08-13
 * Status: Active
 */
import { useState, type Dispatch, type Ref, type SetStateAction } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { Input, Textarea } from "@shared/components/ui/Input";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Spinner } from "@shared/components/ui/Spinner";
import { useResetPinchZoomAfterCameraCapture } from "@shared/hooks/useResetPinchZoomOnResume";
import { cn } from "@shared/lib/ui/cn";
import type { NutritionNotFoodKind } from "@sergeant/api-client";
import type { NullableMacros } from "@sergeant/shared";
import type { NutritionPhotoItem } from "@sergeant/api-client";
import { PHOTO_NOTE_MAX_LENGTH } from "../hooks/usePhotoAnalysis";
import { PhotoItemsList } from "./PhotoItemsList";

/**
 * Inline "in progress" line — spinner + copy, anchored right where the
 * action was triggered instead of a page-top banner the user has to
 * scroll up to notice (page-audit nutrition-overview-01, issue 3: "фото
 * не аналізується" reports where the analysis was actually running).
 * `role="status"` + `aria-live="polite"` per `Spinner`'s own a11y note.
 */
function InlineAnalysisStatus({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-center gap-2 text-style-caption text-muted"
    >
      <Spinner size="xs" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Ключ підтвердження, що людина прочитала попередження про фото.
 *
 * AI-CONTEXT: рішення founder-а 2026-07-26 — на питання «що робимо з
 * фото» обрано «попередження». Фото єдиний шлях за периметр, який
 * **неможливо** замаскувати: у кадр разом із тарілкою потрапляє чек із
 * адресою, чужа рука, екран телефона. Технічного рішення тут немає, є
 * лише чесність або мовчання.
 *
 * Попередження одноразове навмисно: постійний банер над кожним фото
 * перестають читати за тиждень, і тоді він захищає не людину, а нас.
 *
 * Ack — це ще й гейт автоаналізу (рішення founder-а 2026-08-13):
 * до підтвердження аналіз стартує лише явним тапом, після — сам при
 * виборі/заміні фото. Тому `PhotoStep` читає той самий ключ і слухає
 * `onPrivacyAck`.
 */
export const PHOTO_PRIVACY_ACK_KEY = "sergeant.nutrition.photoPrivacyAck.v1";

function PhotoPrivacyNotice({
  onAck,
  blockingAnalysis,
}: {
  onAck?: (() => void) | undefined;
  /**
   * Кадр уже обраний, тариф дозволяє аналіз — і єдине, що його стримує,
   * це непідтверджений нотіс. Тоді нотіс мусить сам сказати, що він і є
   * та кнопка, якої людина шукає.
   */
  blockingAnalysis?: boolean | undefined;
}) {
  const [acked, setAcked] = useState(
    // Пара read/write мусить бути узгоджена: `safeWriteLS` кладе JSON,
    // тому й читаємо через `safeReadLS`. Рядковий читач повернув би
    // `"true"` з лапками і банер не зникав би ніколи.
    () => safeReadLS<boolean>(PHOTO_PRIVACY_ACK_KEY, false) === true,
  );
  if (acked) return null;
  return (
    <div className="mb-3 rounded-2xl border border-line bg-panelHi p-3">
      <div className="text-style-label text-text">Куди їде фото</div>
      {/* AI-NOTE: caption тут навмисний — це дисклеймер приватності під
          заголовком нотіса, а не текст, який читають потоком. Підняти до
          `text-style-body` означало б зрівняти його з основним контентом
          картки і посилити те, що людина має прочитати один раз. */}
      <p className="mt-1 text-style-caption text-muted leading-relaxed">
        Щоб визначити КБЖВ, фото відправляється на розпізнавання до зовнішнього
        AI-сервісу. На відміну від тексту, фото приховати частково не вийде: їде
        весь кадр. Перевір, що в нього не потрапило зайве.
      </p>
      {blockingAnalysis && (
        // AI-NOTE: та сама роль, що й дисклеймер вище — рядок пояснює стан
        // кнопки в цьому ж нотісі, тож кегль тримаємо спільний.
        <p className="mt-2 text-style-caption text-text leading-relaxed">
          Аналіз почнеться, щойно підтвердиш це. Доти кадр нікуди не їде.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          safeWriteLS(PHOTO_PRIVACY_ACK_KEY, true);
          setAcked(true);
          onAck?.();
        }}
        className="mt-2 min-h-11 px-3 text-style-caption text-nutrition-strong dark:text-nutrition hover:underline"
      >
        {blockingAnalysis ? "Зрозуміло, аналізувати" : "Зрозуміло"}
      </button>
    </div>
  );
}

interface PhotoIngredient {
  name?: string;
}

/** Чи є хоч одне число КБЖВ — тільки тоді відсоток впевненості щось означає. */
function hasAnyMacro(result: {
  macros?: Partial<NullableMacros> | null;
}): boolean {
  const m = result.macros;
  if (!m) return false;
  return [m.kcal, m.protein_g, m.fat_g, m.carbs_g].some((v) => v != null);
}

interface PhotoAnalyzeResult {
  /** `false` — сервер сказав, що їжі на фото немає (див. `normalizePhotoResult`). */
  isFood?: boolean;
  /** Що в кадрі замість їжі — задає тон відмови. Див. `NotFoodNotice`. */
  notFoodKind?: NutritionNotFoodKind | null;
  dishName?: string | null;
  macros?: Partial<NullableMacros> | null;
  confidence?: number | null;
  ingredients?: PhotoIngredient[];
  /** Позиції кадру; підсумок `macros` вище — їхня сума (ініціатива 0023). */
  items?: NutritionPhotoItem[];
  questions?: string[];
}

/**
 * Відмова аналізу: на фото немає їжі.
 *
 * AI-CONTEXT: до цієї гілки картка рендерила КБЖВ, «Зберегти в журнал» і блок
 * «Уточнення порції» щойно результат був не-null — тож фото кота давало нулі,
 * «Впевненість: 100%» і питання «Чи є на фото щось інше, окрім кота?», а
 * кнопка збереження писала це в денний журнал як `macroSource: photoAI`.
 * Найдорожчою була саме кнопка, а не назва: вигадані нулі потрапляли в
 * `estimatedKcalShare` і в підсумок дня.
 */
const NOT_FOOD_COPY: Record<
  NutritionNotFoodKind,
  { title: string; unnamed: string; action: string }
> = {
  animal: {
    title: "Це не страва, а тваринка",
    unnamed: "На фото тваринка, а не їжа.",
    action:
      "Краще погладь і пригости смаколиком, а для журналу зроби фото їжі.",
  },
  person: {
    title: "Це людина, а не страва",
    unnamed: "На фото людина, а не їжа.",
    action: "Наведи камеру на тарілку, або додай прийом їжі вручну.",
  },
  other: {
    title: "Не бачу тут страви",
    unnamed: "На фото немає їжі, для якої можна порахувати КБЖВ.",
    action: "Обери інше фото вище, або додай прийом їжі вручну.",
  },
};

function NotFoodNotice({
  dishName,
  kind,
}: {
  dishName?: string | null | undefined;
  kind?: NutritionNotFoodKind | null | undefined;
}) {
  const what = (dishName || "").trim();
  const copy = NOT_FOOD_COPY[kind ?? "other"];
  return (
    <div className="mt-4 rounded-2xl border border-line bg-panelHi p-3">
      <div className="text-style-label text-text">{copy.title}</div>
      <p className="mt-1 text-style-caption text-muted leading-relaxed">
        {what
          ? `На фото схоже на «${what}», порахувати КБЖВ немає з чого.`
          : copy.unnamed}{" "}
        {copy.action}
      </p>
    </div>
  );
}

interface PhotoAnalyzeCardProps {
  busy?: boolean | undefined;
  analyzePhoto: () => void | Promise<void>;
  fileRef: Ref<HTMLInputElement>;
  onPickPhoto: (file?: File | null) => void | Promise<void>;
  photoPreviewUrl?: string | null | undefined;
  photoResult?: PhotoAnalyzeResult | null | undefined;
  fmtMacro: (v: unknown) => string | number;
  portionGrams: string;
  setPortionGrams: Dispatch<SetStateAction<string>>;
  refinePhoto: () => void | Promise<void>;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  /** Вільне зауваження людини — їде в `qna` разом із відповідями. */
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  onSaveToLog?: (() => void | Promise<void>) | undefined;
  /**
   * Підпис кнопки аналізу, або `null` — сховати її зовсім.
   *
   * AI-CONTEXT: автоаналіз (`PhotoStep`) накриває щасливий шлях, тож
   * кнопка тут — НЕ основний спосіб запустити аналіз, а запасний вихід:
   * retry після помилки й вхід у paywall для Free. Показувати її завжди
   * означало пропонувати дію, яку система вже зробила сама.
   */
  analyzeLabel?: string | null;
  /** `photo.isAnalyzing` — drives the inline status line next to «Аналізувати». */
  analyzing?: boolean | undefined;
  /** `photo.isRefining` — drives the inline status line next to «Перерахувати». */
  refining?: boolean | undefined;
  /** Fired once when the user confirms the privacy notice («Зрозуміло»). */
  onPrivacyAck?: (() => void) | undefined;
  /**
   * Кадр обраний, тариф дозволяє — аналіз стримує ЛИШЕ непідтверджений
   * нотіс. Тоді нотіс називає себе наступним кроком (див. AI-CONTEXT біля
   * `analyzeLabel`: кнопки «Аналізувати» в цьому стані навмисно немає,
   * і без підказки екран виглядав мертвим).
   */
  analysisAwaitingPrivacyAck?: boolean | undefined;
  /** Прибрати позицію зі списку. Відсутній — список лише для читання. */
  onRemoveItem?: ((index: number) => void) | undefined;
  /**
   * Пікер каталогу під кнопкою «Додати позицію».
   *
   * Приходить рендер-функцією, а не хуком пошуку: інакше картка знала б про
   * `useFoodSearch`, і кожен її тест мусив би мокати мережу заради розмітки,
   * яка до пошуку відношення не має. `close` згортає пікер назад у кнопку.
   */
  renderAddItem?: ((close: () => void) => React.ReactNode) | undefined;
}

export function PhotoAnalyzeCard({
  busy,
  analyzePhoto,
  analyzeLabel = "Аналізувати",
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
  note,
  setNote,
  onSaveToLog,
  analyzing,
  refining,
  onPrivacyAck,
  analysisAwaitingPrivacyAck,
  onRemoveItem,
  renderAddItem,
}: PhotoAnalyzeCardProps) {
  const armPinchZoomReset = useResetPinchZoomAfterCameraCapture();
  return (
    // Раніше — самостійна картка на сторінці «Огляд»; тепер живе кроком
    // усередині AddMealSheet, тож без власного Card-хрому: панель і
    // паддінги дає sheet. Заголовка тут навмисно НЕМА (main лагодив той
    // самий дубль ще під <details>-обгортку): назву «Аналіз фото страви»
    // несе title самої шторки, картці лишається тільки підпис.
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-style-caption text-muted">
            ШІ визначить КБЖВ і запропонує уточнення
          </div>
        </div>
        {analyzeLabel !== null && (
          <button
            type="button"
            onClick={analyzePhoto}
            disabled={busy}
            className={cn(
              "text-style-label shrink-0 px-5 h-10 rounded-xl",
              "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
            )}
          >
            {busy ? "…" : analyzeLabel}
          </button>
        )}
      </div>

      {analyzing && <InlineAnalysisStatus text="Аналізую фото…" />}

      <PhotoPrivacyNotice
        onAck={onPrivacyAck}
        blockingAnalysis={analysisAwaitingPrivacyAck}
      />

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
          // Озброюємо скидання масштабу рівно тут: iOS вміє повернутися з
          // нативної шторки камери зі застряглим pinch-zoom, і тоді
          // інтерфейс «їде». Поза цим сценарієм масштаб не чіпаємо.
          onClick={armPinchZoomReset}
          onChange={(e) => onPickPhoto(e.target.files?.[0])}
          className="sr-only"
          aria-label="Обрати фото страви"
          disabled={busy}
        />
        {photoPreviewUrl ? (
          <div className="relative">
            <img
              src={photoPreviewUrl}
              alt="Обране фото"
              loading="lazy"
              decoding="async"
              width="600"
              height="280"
              className="block w-full max-w-full max-h-[280px] object-cover rounded-2xl"
            />
            <span className="absolute bottom-3 right-3 rounded-xl bg-panel/95 px-3 py-2 text-style-caption text-text shadow-soft">
              Замінити фото
            </span>
          </div>
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
            <span className="text-style-caption">
              jpg / png / heic · до 4 МБ
            </span>
          </div>
        )}
      </label>

      {photoPreviewUrl ? (
        <button
          type="button"
          onClick={() => void onPickPhoto(null)}
          disabled={busy}
          className="mt-2 min-h-11 px-3 text-style-caption text-danger-strong hover:underline disabled:opacity-50"
        >
          Прибрати фото
        </button>
      ) : null}

      {photoResult && photoResult.isFood === false && (
        <NotFoodNotice
          dishName={photoResult.dishName}
          kind={photoResult.notFoodKind}
        />
      )}

      {photoResult && photoResult.isFood !== false && (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-style-label text-text">
                {photoResult.dishName || "Страва"}
              </div>
              {/* Підпис навмисно довший за «Впевненість»: це впевненість у
                  ТОМУ, ЩО НА ФОТО, а не в калоріях поруч. Коли чисел немає
                  взагалі, відсоток нічого не означає — ховаємо. */}
              {photoResult.confidence != null && hasAnyMacro(photoResult) && (
                <div className="text-style-caption text-muted mt-0.5">
                  Впевненість у розпізнаванні:{" "}
                  {Math.round(photoResult.confidence * 100)}%
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
                className="min-w-0 rounded-xl border border-nutrition/20 bg-nutrition/8 px-2 py-2 text-center"
              >
                <SectionHeading
                  as="div"
                  size="xs"
                  variant="nutrition"
                  className="leading-none mb-1"
                >
                  {m.label}
                </SectionHeading>
                {/* AI-DANGER: `text-sm` тут лишається навмисно. Роль
                    `text-style-label` явно задає `font-weight: 500`, а
                    поруч стоїть `font-extrabold` — два правила ваги на
                    одному вузлі, і хто виграє, залежить від порядку в
                    CSS. Це те саме місце, де прохід типографіки вже
                    двічі ламав вагу тихо. Значення метрики має лишатись
                    найважчим у своєму блоці. */}
                <div className="text-sm font-extrabold text-text leading-none truncate">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <PhotoItemsList
            items={photoResult.items ?? []}
            fmtMacro={fmtMacro}
            onRemoveItem={onRemoveItem}
            renderAddItem={renderAddItem}
            busy={busy}
          />

          {onSaveToLog && (
            /* AI-CONTEXT: тестер 2026-08-13 «ледь не пропустила цей пункт» —
               збереження було outline-кнопкою, а «Перерахувати» нижче —
               залитою. Тобто найважливіша дія картки виглядала слабшою за
               допоміжну. У зоні результату тепер рівно одна залита кнопка, і
               це вона; «Перерахувати» знижено до secondary (залите
               «Аналізувати» лишається в хедері — інша зона, інший момент).
               Підпис під нею потрібен
               окремо: з самої картки не видно, що без кліку аналіз нікуди
               не дінеться. */
            <div className="grid gap-1.5">
              <button
                type="button"
                onClick={onSaveToLog}
                disabled={busy}
                className={cn(
                  "text-style-label inline-flex w-full items-center justify-center gap-2 h-12 rounded-2xl shadow-soft",
                  "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                )}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Зберегти в журнал
              </button>
              {/* AI-NOTE: підказка під кнопкою — класичний випадок, який
                  правило дозволяє лишити в caption: вона супроводжує контрол,
                  а не читається окремо. */}
              <p className="text-style-caption text-muted text-center">
                Сам аналіз у журнал не потрапляє, збережи, щоб він порахувався в
                дні.
              </p>
            </div>
          )}

          {Array.isArray(photoResult.ingredients) &&
            photoResult.ingredients.length > 0 && (
              <div className="text-style-caption text-muted">
                <span className="font-semibold text-text">Інгредієнти: </span>
                {photoResult.ingredients
                  .map((x: PhotoIngredient) => x.name)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}

          {/* AI-CONTEXT: блок навмисно НЕ гейтиться на `questions.length > 0`.
              Питання ставить модель — і саме тоді, коли вона впевнена, вона
              не питає нічого. Тестова група 2026-08-12: розпізнало 2 страви
              з 3, питань — жодного, тож канал «сказати своїми словами» був
              недосяжний рівно в тому випадку, заради якого потрібен. Порція
              і вільне зауваження доступні завжди; питання — коли є. */}
          <div className="rounded-2xl border border-line bg-panelHi p-3 grid gap-3">
            <SectionHeading as="div" size="xs" variant="nutrition">
              Уточнення
            </SectionHeading>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-style-caption text-muted mb-1">
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
            </div>

            {Array.isArray(photoResult.questions) &&
              photoResult.questions.slice(0, 6).map((q: string) => (
                <div key={q}>
                  <div className="text-style-caption text-muted mb-1">{q}</div>
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

            <div>
              <div className="text-style-caption text-muted mb-1">
                Що не так? Опиши своїми словами
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={PHOTO_NOTE_MAX_LENGTH}
                aria-label="Що не так? Опиши своїми словами"
                placeholder="напр. третє: не булочка, а сирник"
                disabled={busy}
              />
            </div>

            <button
              type="button"
              onClick={refinePhoto}
              disabled={busy}
              className={cn(
                "text-style-label w-full h-11 rounded-2xl border border-nutrition/40",
                "text-nutrition-strong dark:text-nutrition hover:bg-nutrition/10 disabled:opacity-50 transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              )}
            >
              Перерахувати з урахуванням уточнень
            </button>
            {/* Чесність про ціну кнопки: перерахунок — це новий прогін
                моделі по всьому кадру, а не точкова правка. Те, що вона
                вгадала правильно, теж може змінитись. */}
            {/* AI-NOTE: підказка під контролом (див. коментар вище про
                ціну кнопки) — caption тут навмисний. */}
            <p className="text-style-caption text-muted">
              Перерахунок оновлює весь результат, а не лише те, що ти згадаєш,
              уже правильні страви теж можуть змінитися.
            </p>
            {refining && (
              <InlineAnalysisStatus text="Уточнюю порцію та перераховую…" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
