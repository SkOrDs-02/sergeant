import { useEffect, useRef } from "react";

import { useUser } from "@sergeant/api-client/react";

import { buildIdentifyTraits } from "@/lib/observability/identifyTraits";
import { identifyPostHogUser, resetPostHog } from "@/lib/observability/posthog";

/**
 * No-UI компонент, що монтується у root-дереві (`app/_layout.tsx`) і
 * мостить `useUser()` стан у PostHog `identify` / `reset` виклики —
 * mobile-аналог `apps/web/src/core/auth/AuthContext.tsx` блоку, що
 * викликає `identifyPostHogUser` / `resetPostHog` після login/logout.
 *
 * Чому окремий компонент, а не хук у `_layout.tsx`: root layout
 * рендериться над `(auth)` і `(tabs)` групами, тож `useUser()` мусить
 * жити всередині `<ApiClientProvider>`. Це той самий патерн, що
 * `<PushRegistrar/>` і `<CloudSyncProvider/>` уже використовують.
 *
 * Помилки `identify` / `reset` свідомо не логуємо: транспорт у
 * `posthog.ts` уже fire-and-forget і ловить власні throws.
 */
export function AnalyticsIdentityBridge() {
  const { data, isPending } = useUser();
  const user = data?.user ?? null;

  // Послідовність login → logout → login повертає `useUser` через
  // `null`. Кешуємо останній id, щоб реагувати тільки на справжні
  // переходи: `identifyPostHogUser` робить $anon_distinct_id stitch
  // тільки коли `userId` змінився.
  const lastIdentifiedRef = useRef<string | null>(null);

  useEffect(() => {
    // Поки `useUser` не завершила перший fetch — ні identify, ні
    // reset. Це уникає помилкового `reset` під час cold-start, поки
    // session-cookie ще ширяє у Better Auth.
    if (isPending) return;

    if (user?.id) {
      if (lastIdentifiedRef.current === user.id) return;
      lastIdentifiedRef.current = user.id;
      // Cast у `Record<string, unknown>` — `IdentifyTraits` має іменовані
      // опціональні поля без index-signature, тому TS не звужує його до
      // record-у автоматично. Контракт `identifyPostHogUser` приймає
      // довільний bag-of-properties — типи трейтів захищає сам
      // `buildIdentifyTraits`.
      identifyPostHogUser(
        user.id,
        buildIdentifyTraits(user) as Record<string, unknown>,
      );
      return;
    }

    // Перехід authenticated → unauthenticated: скидаємо distinct_id у
    // PostHog, щоб події post-logout не атрибутувались попередньому
    // юзеру.
    if (lastIdentifiedRef.current !== null) {
      lastIdentifiedRef.current = null;
      resetPostHog();
    }
  }, [isPending, user]);

  return null;
}
