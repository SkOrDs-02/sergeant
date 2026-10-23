import { useState } from "react";
import { coreMessages as messages } from "@shared/i18n/uk.core";
import { hasSessionExpiredMarker } from "./sessionExpiredMarker";

/**
 * `sec-18`: пояснення над формою входу, коли людину привело сюди завершення
 * сесії (маркер від identity-wipe), а не власний вибір «Увійти». Без нього
 * екран входу після 401 виглядав як звичайний холодний старт.
 *
 * Маркер читаємо один раз при монтуванні: після успішного входу `AuthContext`
 * його знімає, а сторінка в цей момент уже йде геть.
 */
export function SessionExpiredNotice() {
  const [expired] = useState(hasSessionExpiredMarker);
  if (!expired) return null;
  return (
    <div
      role="status"
      data-testid="session-expired-notice"
      className="mb-4 rounded-panel border border-warning/30 bg-warning/5 px-4 py-3"
    >
      <p className="text-style-label font-semibold text-text">
        {messages.auth.sessionExpiredTitle}
      </p>
      <p className="mt-1 text-style-body text-subtle">
        {messages.auth.sessionExpiredBody}
      </p>
    </div>
  );
}
