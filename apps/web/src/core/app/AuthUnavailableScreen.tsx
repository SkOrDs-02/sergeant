import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

interface AuthUnavailableScreenProps {
  /** Негайний перезапит `me`, не чекаючи наступного циклу з відступом. */
  onRetry: () => void;
}

/**
 * Екран-блокер «Сервер недоступний», поки `GET /api/v1/me` не відповідає
 * (5xx, 429, мережа, битий JSON), а пристрій належить залогіненому
 * користувачу (rel-02, аудит 2026-10-01).
 *
 * ЧОМУ блокер, а не банер поверх застосунку. Поки `me` мовчить, особистість
 * невідома (`status === "loading"`, `user === null`), і з цим пов'язані дві
 * дірки, які банер не закриває:
 *  - `useLocalUserId` віддає `null`, тож модулі не реєструють dual-write
 *    контекст, і запис у вікні збою мовчки губиться;
 *  - App Lock шукає PIN у слоті `pin:anon`, а не власника, тож не вмикається,
 *    а модульні екрани беруть дані користувача з persisted RQ-кешу.
 * Поки застосунок за цим екраном не рендериться, нема ні UI для запису, ні
 * даних, які можна показати стороннім. Нічого не стирається: кеш і SQLite
 * цілі, а `me` перезапитується сам з відступом.
 *
 * Завантажується ліниво (`RootLayout`): стан рідкісний, а оболонка сидить на
 * критичному шляху, стеля якого гейтиться окремо.
 */
export function AuthUnavailableScreen({ onRetry }: AuthUnavailableScreenProps) {
  const m = messages.auth;
  return (
    <main
      id="main"
      data-testid="auth-unavailable-screen"
      className="fixed inset-0 z-modal flex items-center justify-center bg-bg p-6"
    >
      <div role="status" className="w-full max-w-sm text-center">
        <div className="mb-4 flex justify-center" aria-hidden>
          <Icon
            name="cloud-off"
            className="h-10 w-10 text-warning-strong dark:text-warning"
          />
        </div>
        <h1 className="mb-3 text-style-title text-text">
          {m.serverUnavailable}
        </h1>
        <p className="mb-6 text-style-body text-muted">
          {m.serverUnavailableBody}
        </p>
        <Button variant="solid" size="lg" onClick={onRetry}>
          {m.serverUnavailableRetry}
        </Button>
      </div>
    </main>
  );
}
