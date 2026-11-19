/** @status Active */

/**
 * Копія публічної сторінки стану (`/status`).
 *
 * AI-CONTEXT: винесено з `uk.ts` 2026-11-19. Після вливання `main` каталог
 * перетнув `max-lines: 600` (Hard Rule #18): обидва боки додали рядки в різні
 * групи. Конвенція каталогу: ділити, а не піднімати ліміт. Група самодостатня
 * (ні від чого в каталозі не залежить), тож переїзд механічний.
 */
export const publicStatusMessages = {
  pageTitle: "Sergeant · Status",
  pollNote: "Поточний стан компонентів. Оновлюється автоматично кожні",
  pollNoteSuffix: "с.",
  loading: "Завантаження стану сервісу…",
  overallOperational: "Усі сервіси працюють",
  overallDegraded: "Часткова деградація",
  overallDown: "Серйозна проблема",
  pillOperational: "Працює",
  pillDegraded: "Деградація",
  pillDown: "Не працює",
  timestampPrefix: "оновлено",
  componentsLabel: "Компоненти",
  lastIncidentNone: "Інцидентів за останні 7 днів не зафіксовано.",
  lastIncidentPrefix: "Останній інцидент:",
  errorTitle: "Не вдалося завантажити статус",
  errorRetry: "Спробувати ще",
  errorFallback: "Не вдалося завантажити статус сервісу.",
  errorHttpPrefix: "Сервер відповів HTTP",
} as const;
