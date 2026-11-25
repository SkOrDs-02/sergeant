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
  pollNote: "Оновлюється кожні",
  pollNoteSuffix: "с.",
  loading: "Завантаження стану сервісу…",
  overallOperational: "Усі сервіси працюють",
  overallDegraded: "Частина сервісів працює з перебоями",
  overallDown: "Сервіс не працює",
  pillOperational: "Працює",
  pillDegraded: "Перебої",
  pillDown: "Не працює",
  timestampPrefix: "оновлено",
  componentsLabel: "Компоненти",
  lastIncidentNone: "За останні 7 днів інцидентів не було.",
  lastIncidentPrefix: "Останній інцидент:",
  errorTitle: "Не вдалося завантажити статус",
  errorRetry: "Спробувати ще",
  errorFallback: "Не вдалося завантажити статус сервісу.",
  errorHttpPrefix: "Сервер відповів HTTP",
} as const;
