import { useLocale } from "@shared/i18n/useLocale";
import {
  PaywallModal,
  isQuotaError,
  useFeatureGate,
} from "../../../../core/billing";

/**
 * Пейвол vision-сканів Фініка (фото чека без QR і скрін банку). Free має 5
 * сканів на тиждень, спільних для обох шляхів (спека access-tiers). QR-шлях
 * через ДПС лишається безлімітним, тож копія пейвола називає його виходом.
 *
 * `requireAccess` відсікає скан до запиту, коли знімок доступу вже каже
 * «вичерпано»; `onError` відкриває пейвол за 429 від сервера, коли знімок
 * застарів між двома сканами.
 */
export function useFinykVisionPaywall() {
  const gate = useFeatureGate("ai.finykVision");
  const { messages } = useLocale();
  const copy = messages.paywall["ai.finykVision"];
  return {
    requireAccess: gate.requireAccess,
    onError: (err: unknown) => {
      if (isQuotaError(err, "AI_FINYK_VISION_QUOTA")) gate.openPaywall();
    },
    // Монтуємо лише відкритим: `PaywallModal` тягне `useNavigate`, а аркуші
    // Фініка рендеряться і поза `<Router>` (ізольовані тести).
    modal: gate.paywallOpen ? (
      <PaywallModal
        open
        onClose={gate.closePaywall}
        surface={gate.paywallSurface}
        title={copy.title}
        description={copy.description}
      />
    ) : null,
  };
}
