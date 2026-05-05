import { useEffect, useRef } from "react";
import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms/useApiForm";
import { messages } from "@shared/i18n/uk";
import { waitlistApi } from "@shared/api";
import { isApiError } from "@sergeant/api-client";
import {
  type WaitlistSource,
  type WaitlistTier,
  type WaitlistSubmitResponse,
  WaitlistTierSchema,
} from "@sergeant/shared";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

const TIER_OPTIONS: ReadonlyArray<{
  value: WaitlistTier;
  label: string;
  hint: string;
}> = [
  { value: "pro", label: "Pro", hint: "AI-чат, авто-Mono, повні звіти" },
  { value: "plus", label: "Plus", hint: "Базовий AI + cloud sync" },
  {
    value: "free",
    label: "Залишусь на Free",
    hint: "Просто слідкувати за новинами",
  },
  { value: "unsure", label: "Ще не знаю", hint: "Розкажіть мені більше" },
];

/**
 * Phase 0 monetization rails: форма для збору waitlist-ів на майбутній
 * Pro-тір. Анонімна (не вимагає логіну) — основний траффік сюди йтиме з
 * `/pricing`, де неавторизовані відвідувачі мають мати змогу залишити email.
 *
 * Аналітика: `WAITLIST_SUBMITTED` шлемо тільки після успішної відповіді
 * сервера (включно з ідемпотентним `created=false`), щоб дашборд не
 * рахував перерване подання як справжній sign-up.
 */
export interface WaitlistFormProps {
  /**
   * Звідки прийшла submission. Використовується для PostHog-сегментації
   * ("waitlist з paywall vs. з pricing-сторінки конвертять по-різному").
   */
  source: WaitlistSource;
  /**
   * Опційний preset tier (наприклад, якщо юзер натиснув CTA на конкретній
   * картці тіра). Якщо не передано — селектор стартує з `unsure`.
   */
  defaultTier?: WaitlistTier;
  /** Викликається після успішної (або ідемпотентної) відповіді сервера. */
  onSuccess?: (created: boolean) => void;
  /** Опційний className для контейнера-обгортки. */
  className?: string;
}

/**
 * Форм-схема — підмножина `WaitlistSubmitSchema` з `@sergeant/shared`:
 * `source` приходить пропсом і не редагується, тому виносимо його зі
 * scope-у форми. Месиджі помилок збігаються з тими, що повертає сервер
 * (Hard Rule #15: UA), щоб 400-валідація з бекенду і клієнтська помилка
 * виглядали для користувача однаково.
 */
const waitlistFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email(messages.validation.emailInvalidPublic)
    .max(254, messages.validation.emailMax254),
  tier_interest: WaitlistTierSchema,
});

type WaitlistFormValues = z.infer<typeof waitlistFormSchema>;

export function WaitlistForm({
  source,
  defaultTier,
  onSuccess,
  className,
}: WaitlistFormProps) {
  const toast = useToast();
  // 429 — rate-limit ловимо окремим toast-ом і прибираємо top-level
  // serverError-банер (інакше дублюємо повідомлення). Цей ref ставиться
  // у `onSubmit` при rate-limit і скидається на наступному успішному
  // submit / у `clearServerError`.
  const rateLimitedRef = useRef(false);

  // `useApiForm` зводить zod-валідацію + isSubmitting + server-error mapping
  // в один hook. 400-помилка з `details: [{path, message}]` від сервера
  // автоматично кладеться у `formState.errors`; top-level `error` — у
  // `serverError`. 429 (rate-limit) показуємо окремим toast-ом, щоб не
  // конфліктувати з emailError у тій же позиції.
  const {
    register,
    submit,
    formState,
    watch,
    isSubmitting,
    serverError,
    reset,
    clearServerError,
  } = useApiForm<WaitlistFormValues, WaitlistSubmitResponse>({
    schema: waitlistFormSchema,
    defaultValues: {
      email: "",
      tier_interest: defaultTier ?? "unsure",
    },
    onSubmit: async (values) => {
      rateLimitedRef.current = false;
      try {
        return await waitlistApi.submit({
          email: values.email,
          tier_interest: values.tier_interest,
          source,
        });
      } catch (err) {
        if (isApiError(err) && err.status === 429) {
          rateLimitedRef.current = true;
          toast.error("Забагато запитів. Спробуй за годину.");
        }
        throw err;
      }
    },
    onSuccess: (res, values) => {
      trackEvent(ANALYTICS_EVENTS.WAITLIST_SUBMITTED, {
        tier_interest: values.tier_interest,
        source,
        created: res.created,
      });
      if (res.created) {
        toast.success("Дякуємо! Повідомимо щойно Pro буде готовий.");
      } else {
        toast.info("Ми вже памʼятаємо твій інтерес — жодних дублікатів.");
      }
      reset({ email: "", tier_interest: values.tier_interest });
      onSuccess?.(res.created);
    },
  });

  // Якщо submit упав через 429, ефект після першого render-у з
  // `serverError !== null` чистить банер: `applyServerError` уже встиг
  // повернути серверний error-текст, але користувач бачить toast і не
  // потребує дубля у формі.
  useEffect(() => {
    if (rateLimitedRef.current && serverError) {
      rateLimitedRef.current = false;
      clearServerError();
    }
  }, [serverError, clearServerError]);

  // Якщо preset tier змінився ззовні (батьківський компонент перерендерив
  // форму з іншим defaultTier — напр. користувач клікнув іншу tier-картку
  // у `/pricing`), синхронізуємо це з form-state. RHF не реєструє defaults
  // після першого `useForm`, тому без цього effect-у форма залишилась би
  // на старому виборі.
  useEffect(() => {
    if (defaultTier) {
      reset({
        email: watch("email") ?? "",
        tier_interest: defaultTier,
      });
    }
    // `reset` із RHF стабільний; `watch` не запускає лишніх render-ів через
    // те, що ми його викликаємо вручну.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTier]);

  const tierValue = watch("tier_interest");
  const emailErrorMessage = formState.errors.email?.message;

  return (
    <form
      onSubmit={submit}
      className={className}
      noValidate
      aria-label="Підписатись на waitlist Pro-тіру"
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="waitlist-email">Email</Label>
          <Input
            id="waitlist-email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isSubmitting}
            error={!!emailErrorMessage}
            aria-invalid={emailErrorMessage ? true : undefined}
            aria-describedby={
              emailErrorMessage ? "waitlist-email-error" : undefined
            }
            {...register("email")}
          />
          {emailErrorMessage && (
            <p
              id="waitlist-email-error"
              className="mt-1 text-xs text-danger-strong"
              role="alert"
            >
              {emailErrorMessage}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="text-style-label text-text mb-2">
            Який тариф цікавить найбільше?
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TIER_OPTIONS.map((opt) => {
              const checked = tierValue === opt.value;
              const inputId = `waitlist-tier-${opt.value}`;
              return (
                <label
                  key={opt.value}
                  htmlFor={inputId}
                  aria-label={`${opt.label} — ${opt.hint}`}
                  className={
                    "flex items-start gap-3 rounded-2xl border p-3 cursor-pointer transition-colors " +
                    (checked
                      ? "border-brand-500 bg-brand/10 dark:bg-brand/15"
                      : "border-line bg-panel hover:bg-panelHi")
                  }
                >
                  <input
                    id={inputId}
                    type="radio"
                    value={opt.value}
                    className="mt-1 accent-brand-strong"
                    disabled={isSubmitting}
                    {...register("tier_interest")}
                  />
                  <span className="flex flex-col">
                    <span className="text-style-label text-text">
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted">{opt.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {serverError && (
          <p
            className="text-xs text-danger-strong"
            role="alert"
            data-testid="waitlist-server-error"
          >
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
        >
          Підписатись на waitlist
        </Button>

        <p className="text-xs text-muted">
          Без спаму. Один лист, коли Pro запуститься. Ціни теж покажемо
          фіналізовано — поки в
          `docs/launch/business/01-monetization-and-pricing.md` лише драфт.
        </p>
      </div>
    </form>
  );
}
