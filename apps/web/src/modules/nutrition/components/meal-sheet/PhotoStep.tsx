/**
 * Last validated: 2026-08-13
 * Status: Active
 *
 * Крок «фото» всередині AddMealSheet (флоу "source" → "photo" → "fill").
 *
 * AI-CONTEXT: раніше аналіз фото жив окремою карткою у згорнутому
 * `<details>` на сторінці «Огляд», а кнопка «Фото» в цьому sheet-і
 * закривала його, навігувала на «Огляд», force-відкривала disclosure і
 * синтетично клікала file input (state-машина pendingAction у
 * NutritionApp). Тепер увесь шлях «дати фото» — це крок sheet-а, тож
 * контролер `usePhotoAnalysis`, Premium-гейт і paywall живуть тут, а не
 * в NutritionApp.
 *
 * Помилки аналізу рендеряться inline: топ-банер сторінки схований за
 * sheet-ом (z-index 120), тож `setErr` NutritionApp тут був би «тихим
 * фейлом» — та сама причина, чому статус аналізу вже inline
 * (page-audit nutrition-overview-01, issue 3).
 */
import { useEffect, useRef, useState, type Ref } from "react";
import type { NutritionPhotoResult } from "@shared/api";
import { safeReadLS } from "@shared/lib/storage/storage";
import { useLocale } from "@shared/i18n/useLocale";
import { PaywallModal, useFeatureGate } from "../../../../core/billing";
import { usePhotoAnalysis } from "../../hooks/usePhotoAnalysis";
import { fmtMacro } from "../../lib/nutritionFormat";
import { PhotoAnalyzeCard } from "../PhotoAnalyzeCard";
import { PHOTO_PRIVACY_ACK_KEY } from "../PhotoPrivacyNotice";

interface PhotoStepProps {
  /**
   * Перехід photo → fill: результат аналізу застосовано, форма
   * засівається у батька. `file` — оригінал для мініатюри в журналі
   * (зчитується ТУТ, бо file input демонтується разом із кроком).
   */
  onApply: (result: NutritionPhotoResult, file: File | null) => void;
}

export function PhotoStep({ onApply }: PhotoStepProps) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  // statusText — legacy-канал топ-банера NutritionApp; у кроці sheet-а
  // його роль виконують inline-рядки `isAnalyzing`/`isRefining`.
  const photo = usePhotoAnalysis({
    setBusy: setPhotoBusy,
    setErr: setPhotoErr,
    setStatusText: () => {},
  });

  // Phase 7 D2 — AI-аналіз фото за Premium. `requireAccess()` відкриває
  // paywall для Free і коротко-замикає мутацію; Modal (z 200) стоїть над
  // Sheet (z 120), тож рендер прямо звідси коректний.
  const photoGate = useFeatureGate("ai-photo-analysis");
  const { messages } = useLocale();

  // Автоаналіз після вибору/заміни фото (рішення founder-а 2026-08-13).
  // Три гейти — кожен навмисний:
  //  · privacy-ack: до «Зрозуміло» кадр НЕ їде сам — нотіс просить
  //    перевірити, що в кадр не потрапило зайве, і ця перевірка має
  //    відбутись до відправлення (founder 2026-07-26);
  //  · Pro: для Free автозапуск означав би paywall одразу після вибору
  //    файлу — paywall лишається на явний тап «Аналізувати»;
  //  · один запуск на кадр (ref по blob-URL): «Замінити фото» дає новий
  //    URL і перезапускає аналіз, а ре-рендери/ack без нового кадру — ні.
  // Кнопка «Аналізувати» лишається як retry після помилки й вхід для Free.
  const [privacyAcked, setPrivacyAcked] = useState(
    () => safeReadLS<boolean>(PHOTO_PRIVACY_ACK_KEY, false) === true,
  );
  const lastAutoAnalyzedUrlRef = useRef("");
  const previewUrl = photo.photoPreviewUrl;
  const canAutoAnalyze = photoGate.canAccess && privacyAcked;

  // Ручний запуск тримає ОБИДВА гейти, не лише тариф. Privacy-ack —
  // не косметика нотіса, а умова відправлення кадру (founder
  // 2026-07-26), тож ручний шлях мусить питати те саме, що авто-ефект
  // вище; інакше «Спробувати ще раз» після помилки піккера відправляло
  // б фото Pro-користувача, який нотіс ще не підтвердив (ревʼю
  // CodeRabbit). Порядок навмисний: `requireAccess()` спершу, бо для
  // Free ця кнопка — вхід у paywall, і ack тут ні до чого.
  const gatedAnalyzePhoto = () => {
    if (!photoGate.requireAccess()) return;
    if (!privacyAcked) return;
    void photo.analyzePhoto();
  };
  useEffect(() => {
    if (!previewUrl || !canAutoAnalyze) return;
    if (lastAutoAnalyzedUrlRef.current === previewUrl) return;
    lastAutoAnalyzedUrlRef.current = previewUrl;
    void photo.analyzePhoto();
    // `photo.analyzePhoto` навмисно поза deps: його ідентичність
    // змінюється щорендера (обгортка над mutation.mutate), а повторний
    // запуск для того самого кадру відсікає ref вище.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl, canAutoAnalyze]);

  // Вхід у крок — це вже жест «хочу дати фото», тож одразу відкриваємо
  // нативний піккер (та сама поведінка, що мав PWA-шорткат
  // `add_meal_photo`). rAF дає input-у змонтуватись; якщо браузер
  // заблокує синтетичний клік — лишається drop-zone.
  const pickerRafRef = useRef<number | null>(null);
  useEffect(() => {
    pickerRafRef.current = requestAnimationFrame(() => {
      pickerRafRef.current = null;
      try {
        photo.fileRef.current?.click();
      } catch {
        /* noop — picker may be blocked without a user gesture */
      }
    });
    return () => {
      if (pickerRafRef.current !== null) {
        cancelAnimationFrame(pickerRafRef.current);
        pickerRafRef.current = null;
      }
    };
    // Mount-only: автовідкриття піккера — одноразовий жест входу в крок.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Кнопка «Аналізувати» — запасний вихід, не основний шлях. Авто-ефект
  // вище вже запускає аналіз сам, тож показувати її на щасливому шляху
  // означало б пропонувати дію, яку система щойно зробила: людина тисне,
  // і нічого видимо не змінюється. Лишаємо рівно два випадки, де авто-
  // запуск не спрацює:
  //  · помилка — тоді це retry, і підпис має казати саме це;
  //  · Free — автозапуск для них навмисно вимкнений (інакше paywall
  //    вискакував би одразу після вибору файлу), тож кнопка лишається
  //    входом у paywall.
  // Pro без privacy-ack теж лишається без кнопки — навмисно: гейт згоди
  // знімає «Зрозуміло» в нотісі, тож видима тут кнопка вела б у глухий
  // кут (`gatedAnalyzePhoto` її б відсік і нічого видимо не сталось).
  // Але два «навмисно» разом давали інший глухий кут: Pro обирає файл,
  // автоаналіз мовчить через ack, кнопки нема — і ніщо не каже, що
  // розблоковує саме «Зрозуміло». Тому нотіс отримує прапорець і сам
  // називає себе наступним кроком.
  //
  // Помилка НЕ скасовує цього: «Спробувати ще раз» без ack — мертва
  // кнопка (див. гейт у `gatedAnalyzePhoto`), а піккер уміє покласти
  // помилку, лишивши превʼю, тож стан «Pro + помилка + без ack»
  // досяжний. Виходом звідти лишається той самий нотіс.
  const analysisAwaitingPrivacyAck =
    Boolean(previewUrl) && photoGate.canAccess && !privacyAcked;
  const analyzeLabel = !previewUrl
    ? null
    : !photoGate.canAccess
      ? // Free: автозапуск вимкнений, кнопка — вхід у paywall.
        photoErr
        ? "Спробувати ще раз"
        : "Аналізувати"
      : photoErr && privacyAcked
        ? "Спробувати ще раз"
        : null;

  const handleApply = () => {
    const result = photo.photoResult;
    // Джерело правди про «збережуване» — серверний `isFood`; не-їжа не
    // може поїхати в журнал (регресія «фото кота»).
    if (!result || result.isFood === false) return;
    onApply(result, photo.fileRef.current?.files?.[0] ?? null);
  };

  return (
    <>
      <PhotoAnalyzeCard
        busy={photoBusy}
        analyzePhoto={gatedAnalyzePhoto}
        analyzeLabel={analyzeLabel}
        fileRef={photo.fileRef as Ref<HTMLInputElement>}
        onPickPhoto={photo.onPickPhoto}
        photoPreviewUrl={photo.photoPreviewUrl}
        photoResult={photo.photoResult}
        fmtMacro={fmtMacro}
        portionGrams={photo.portionGrams}
        setPortionGrams={photo.setPortionGrams}
        refinePhoto={photo.refinePhoto}
        answers={photo.answers}
        setAnswers={photo.setAnswers}
        note={photo.note}
        setNote={photo.setNote}
        onSaveToLog={
          photo.photoResult && photo.photoResult.isFood !== false
            ? handleApply
            : undefined
        }
        analyzing={photo.isAnalyzing}
        refining={photo.isRefining}
        // «Зрозуміло» на першому фото = і згода, і намір: якщо кадр уже
        // обраний — аналіз стартує одразу (ефект вище зловить зміну гейта).
        onPrivacyAck={() => setPrivacyAcked(true)}
        analysisAwaitingPrivacyAck={analysisAwaitingPrivacyAck}
      />
      {photoErr && (
        <div
          role="alert"
          className="mt-3 text-style-caption text-danger-strong dark:text-danger"
        >
          {photoErr}
        </div>
      )}
      <PaywallModal
        open={photoGate.paywallOpen}
        onClose={photoGate.closePaywall}
        surface={photoGate.paywallSurface}
        title={messages.paywall["ai-photo-analysis"].title}
        description={messages.paywall["ai-photo-analysis"].description}
      />
    </>
  );
}
