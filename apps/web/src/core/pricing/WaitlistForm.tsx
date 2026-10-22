import { useEffect, useId, useRef } from "react";
import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms";
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

// User-facing labels follow the locked Free + Premium scheme (Phase 7 D3).
// `value` maps to the server `tier_interest` enum, where the paid tier is
// still `"pro"` under the hood — same internal name the Premium checkout
// sends. No standalone Plus/Pro tiers exist on the public funnel.
const TIER_OPTIONS: ReadonlyArray<{
  value: WaitlistTier;
  label: string;
  hint: string;
}> = [
  {
    value: "pro",
    label: "Premium",
    hint: "Сержант без тижневої стелі, фото і голос, PDF-звіти",
  },
  {
    value: "free",
    label: "Залишусь на Free",
    hint: "Просто слідкувати за новинами",
  },
  { value: "unsure", label: "Ще не знаю", hint: "Розкажи мені більше" },
];

/**
 * Phase 0 monetization rails: форма для збору waitlist-ів на майбутній
 * Premium-тір. Анонімна (не вимагає логіну) — основний траффік сюди йтиме з
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
    setValue,
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
        toast.success("Email збережено. Напишу, щойно Premium буде готовий.");
      } else {
        toast.info("Цей email уже в списку.");
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
  }, [defaultTier, reset, watch]);

  const tierValue = watch("tier_interest");
  const tierLabelId = useId();
  const emailErrorMessage = formState.errors.email?.message;

  return (
    <form
      onSubmit={submit}
      className={className}
      noValidate
      aria-label="Підписатись на waitlist Premium-тіру"
    >
      <div className="space-y-3">
        <div>
          <Label
            htmlFor="waitlist-email"
            className="inline-flex min-h-11 min-w-11 items-center"
          >
            Email
          </Label>
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
              className="mt-1 text-style-caption text-danger-strong"
              role="alert"
            >
              {emailErrorMessage}
            </p>
          )}
        </div>

        <div>
          <Label id={tierLabelId} className="mb-2">
            Цікавий план
          </Label>
          <ChoiceGroup<WaitlistTier>
            variant="rows"
            ariaLabelledBy={tierLabelId}
            disabled={isSubmitting}
            items={TIER_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
              description: opt.hint,
            }))}
            value={tierValue ?? null}
            onChange={(next) => setValue("tier_interest", next)}
          />
        </div>

        {serverError && (
          <p
            className="text-style-caption text-danger-strong"
            role="alert"
            data-testid="waitlist-server-error"
          >
            {serverError}
          </p>
        )}

        <Button type="submit" variant="solid" size="lg" loading={isSubmitting}>
          Підписатись на waitlist
        </Button>

        {/* AI-NOTE: дисклеймер під кнопкою відправки — названий виняток
            `no-sentence-in-caption`. Він свідомо тихіший за саму дію, бо
            читається один раз і не конкурує з CTA. */}
        <p className="text-style-caption text-muted">
          Без спаму. Один лист, коли Premium запуститься. Ціна зʼявиться на
          запуску.
        </p>
      </div>
    </form>
  );
}
