import { Banner } from "@shared/components/ui/Banner";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

interface AuthUnavailableBannerProps {
  /** Негайний перезапит `me`, не чекаючи наступного циклу з відступом. */
  onRetry: () => void;
}

/**
 * Стримана плашка «Сервер недоступний», поки `GET /api/v1/me` не відповідає
 * (5xx, 429, мережа, битий JSON), а пристрій належить залогіненому
 * користувачу (rel-02, аудит 2026-10-01).
 *
 * Це не помилка, яку треба лагодити: перезапит іде сам з відступом, а дані
 * цілі. Тому `role="status"` (ввічливе оголошення), без модального стилю, а
 * кнопка лише дає людині змогу не чекати.
 */
export function AuthUnavailableBanner({ onRetry }: AuthUnavailableBannerProps) {
  const m = messages.auth;
  return (
    <div className="fixed inset-x-0 top-0 z-toast flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pointer-events-none">
      <Banner
        variant="warning"
        role="status"
        data-testid="auth-unavailable-banner"
        className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 py-2 shadow-soft"
      >
        <span>{m.serverUnavailable}</span>
        <Button variant="ghost" size="xs" onClick={onRetry}>
          {m.serverUnavailableRetry}
        </Button>
      </Banner>
    </div>
  );
}
