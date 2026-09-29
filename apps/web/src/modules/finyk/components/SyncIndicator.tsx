import type { IconName } from "@shared/components/ui/Icon";

// Tolerant shape: `useUnifiedFinanceData` merges mono/privat sync
// states, where `status` is an open string — the tone helper
// pattern-matches known values і віддає нейтральний тон на решту.
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
   * частково / оновлення / очікування). Здоровий «ок» — `false`.
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
 *
 * AI-DANGER: зелений «ок» віддається ЛИШЕ на `status === "success"`. Раніше
 * тут стояв протилежний дефолт — усе невідоме падало в гілку успіху, тож
 * `idle` (вебхук Monobank `disconnected`, або стан ще не приїхав) малювався
 * зеленою галочкою «ок». Два сусіди по тому самому енуму так не роблять:
 * `SyncStatusBadge` дає на `idle` «Очікування» з сірою крапкою, а
 * `TransactionSyncPill` ховає рядок цілком — зеленим був лише хедер модуля,
 * тобто єдине місце, де людина дивиться на стан мигцем (знахідка PR-F7,
 * аудит 2026-09-13). Додаєш новий статус — додавай явну гілку; мовчазний
 * фолбек тепер нейтральний, і це навмисно: зелене треба заслужити.
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
      text: "не синхронізовано",
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
  if (syncState?.status === "success") {
    return {
      dot: "bg-success",
      text: "ок",
      pill: "bg-success/10  text-success-strong dark:text-success border-success/20",
      icon: "check-circle",
      needsAttention: false,
    };
  }
  return {
    dot: "bg-subtle/40",
    text: "очікування",
    pill: "bg-panelHi     text-muted   border-line",
    icon: "pause-circle",
    needsAttention: true,
  };
}

// SwipeProgressBar / SWIPE_THRESHOLD_PX переїхали у
// `@shared/components/layout/SwipePages` — смуга прогресу тепер спільна для
// всіх модулів і фарбується акцентом модуля, а не жорстко `bg-finyk`.
