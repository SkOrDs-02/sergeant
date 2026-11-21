import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isApiError } from "@sergeant/api-client";
import type { WaitlistSource } from "@sergeant/shared";
import { billingApi, waitlistApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { messages } from "@shared/i18n/uk";
import { useAuthOptional } from "../auth/AuthContext";
import { useSessionReady } from "../auth/useSessionReady";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

/**
 * Чи можна зараз купити Premium (ux-29, рішення власника 2026-11-21).
 *
 * Джерело — наявний `GET /api/billing/providers` (той самий ключ
 * `billingKeys.providers`, що й кнопки провайдерів на /pricing), без нових
 * серверних полів:
 *   - `prelaunch`: сервер відповів, і список провайдерів порожній. Checkout
 *     тоді гарантовано падає (`PROVIDER_UNAVAILABLE` / `BILLING_UNAVAILABLE`),
 *     тож Premium-CTA стає «Повідомити про запуск»;
 *   - `available`: є хоч один провайдер, АБО запит упав (старий сервер,
 *     офлайн). Помилка не доводить відсутність оплати, тож лишається
 *     попередня поведінка з checkout-ом;
 *   - `loading`: відповіді ще немає;
 *   - `guest`: без сесії ендпоінт віддає 401, тож знати стан неможливо.
 *     Що робити гостеві, вирішує поверхня.
 */
export type PremiumCheckoutState =
  "loading" | "prelaunch" | "available" | "guest";

export interface PremiumCheckoutAvailability {
  state: PremiumCheckoutState;
  providers: ReadonlyArray<string>;
}

export function usePremiumCheckoutAvailability({
  enabled = true,
}: { enabled?: boolean } = {}): PremiumCheckoutAvailability {
  const auth = useAuthOptional();
  const sessionReady = useSessionReady();
  const signedOut = auth?.status === "unauthenticated";
  const query = useQuery({
    queryKey: billingKeys.providers,
    queryFn: ({ signal }) => billingApi.providers({ signal }),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: enabled && sessionReady,
  });
  const providers = query.data?.providers ?? [];
  if (signedOut) return { state: "guest", providers };
  if (query.data) {
    return {
      state: providers.length === 0 ? "prelaunch" : "available",
      providers,
    };
  }
  if (query.isError) return { state: "available", providers };
  return { state: "loading", providers };
}

export type PremiumLaunchOutcome =
  "created" | "alreadyListed" | "rateLimited" | "failed";

export interface PremiumLaunchNotify {
  /** Email сесії, на який піде запис; `null` → треба форма з полем email. */
  email: string | null;
  busy: boolean;
  /** Запис уже є (створено або сервер сказав, що email у списку). */
  done: boolean;
  /** Результат останньої спроби і готовий UA-текст для нього. */
  outcome: PremiumLaunchOutcome | null;
  message: string | null;
  /** Записати email сесії в лист очікування Premium. */
  notify: () => void;
}

const COPY = messages.pricing.launchNotify;

/**
 * One-tap запис у лист очікування (наявний `POST /api/waitlist`) з email
 * поточної сесії: форма з полем email для залогіненого — зайвий крок.
 *
 * Тост хук не показує сам: пейвол може стояти поза `ToastProvider` і
 * показує результат рядком під кнопкою, сторінка тарифів — тостом
 * (`onOutcome`).
 */
export function usePremiumLaunchNotify(
  source: WaitlistSource,
  onOutcome?: (
    outcome: PremiumLaunchOutcome,
    message: string,
    retry: () => void,
  ) => void,
): PremiumLaunchNotify {
  const auth = useAuthOptional();
  const [outcome, setOutcome] = useState<PremiumLaunchOutcome | null>(null);
  const email = auth?.user?.email ?? null;
  // Синхронні замки замість `isPending`/`outcome` з рендера: подвійний тап
  // інакше відправив би два POST-и, а «Повторити» з тосту, створеного ще
  // під час запиту, бачив би застарілий `isPending: true` і мовчав.
  const inFlight = useRef(false);
  const doneRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (target: string) =>
      waitlistApi.submit({ email: target, tier_interest: "pro", source }),
    onSuccess: (res) => {
      trackEvent(ANALYTICS_EVENTS.WAITLIST_SUBMITTED, {
        tier_interest: "pro",
        source,
        created: res.created,
      });
      settle(res.created ? "created" : "alreadyListed");
    },
    onError: (err) => {
      settle(isApiError(err) && err.status === 429 ? "rateLimited" : "failed");
    },
  });

  function notify(): void {
    if (!email || doneRef.current || inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(email);
  }

  function settle(next: PremiumLaunchOutcome): void {
    inFlight.current = false;
    doneRef.current = next === "created" || next === "alreadyListed";
    setOutcome(next);
    onOutcome?.(next, COPY[next], notify);
  }

  const done = outcome === "created" || outcome === "alreadyListed";
  return {
    email,
    busy: mutation.isPending,
    done,
    outcome,
    message: outcome ? COPY[outcome] : null,
    notify,
  };
}
