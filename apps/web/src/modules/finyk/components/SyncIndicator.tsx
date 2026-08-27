import type { IconName } from "@shared/components/ui/Icon";

// Tolerant shape: `useUnifiedFinanceData` merges mono/privat sync
// states, where `status` is an open string — the tone helper only
// pattern-matches known values and falls back to "ok" styling.
export interface SyncState {
  status?: string | undefined;
}

export interface SyncTone {
  dot: string;
  text: string;
  pill: string;
  // Другий канал стану поряд із кольором крапки — важливо на вузьких
  // екранах, де текстовий лейбл ховається (`hidden sm:inline`).
  icon: IconName;
  /**
   * `true` для станів, які вимагають уваги (не підключено / помилка /
   * частково / оновлення). Здоровий «ок» — `false`.
   *
   * AI-CONTEXT: хедер модуля має фіксовану ширину і на телефоні всі
   * `shrink-0` кнопки (Назад + Хаб + око + асистент + налаштування) уже
   * зʼїдають рядок — pill зверху виштовхував заголовок «Фінік» і візуально
   * перекривав його (звіт founder-а 2026-07-31). Тому на вузьких екранах
   * pill показуємо лише коли він щось повідомляє; «ок» там і так без
   * тексту (`hidden sm:inline`), тобто нульова інформативність.
   */
  needsAttention: boolean;
}

/**
 * Returns styling for sync status indicator.
 *
 * Pass `connected: false` when no bank account is linked yet — this prevents
 * the pill from claiming "ок" before any sync has ever occurred.
 */
export function getSyncTone(
  syncState?: SyncState | null,
  connected = true,
): SyncTone {
  if (!connected) {
    return {
      dot: "bg-muted",
      text: "не підключено",
      pill: "bg-panelHi     text-muted   border-line",
      icon: "wifi-off",
      needsAttention: true,
    };
  }
  if (syncState?.status === "error") {
    return {
      dot: "bg-danger",
      text: "помилка",
      pill: "bg-danger-soft  text-danger-strong dark:text-danger  border-danger/20",
      icon: "alert-circle",
      needsAttention: true,
    };
  }
  if (syncState?.status === "partial") {
    return {
      dot: "bg-warning",
      text: "частково",
      pill: "bg-warning/10   text-warning-strong dark:text-warning border-warning/20",
      icon: "alert-triangle",
      needsAttention: true,
    };
  }
  if (syncState?.status === "loading") {
    return {
      dot: "bg-muted",
      text: "оновлення",
      pill: "bg-panelHi     text-muted   border-line",
      icon: "refresh-cw",
      needsAttention: true,
    };
  }
  return {
    dot: "bg-success",
    text: "ок",
    pill: "bg-success/10  text-success-strong dark:text-success border-success/20",
    icon: "check-circle",
    needsAttention: false,
  };
}

// SwipeProgressBar / SWIPE_THRESHOLD_PX переїхали у
// `@shared/components/layout/SwipePages` — смуга прогресу тепер спільна для
// всіх модулів і фарбується акцентом модуля, а не жорстко `bg-finyk`.
