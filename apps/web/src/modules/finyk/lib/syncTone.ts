export interface SyncTone {
  dot: string;
  text: string;
  pill: string;
}

type SyncStatus = "error" | "partial" | "loading" | string | undefined;

const DEFAULT_TONE: SyncTone = {
  dot: "bg-success",
  text: "ок",
  pill: "bg-success/10  text-success border-success/20",
};

const PARTIAL_TONE: SyncTone = {
  dot: "bg-warning",
  text: "частково",
  pill: "bg-warning/10   text-warning border-warning/20",
};

const LOADING_TONE: SyncTone = {
  dot: "bg-muted",
  text: "оновлення",
  pill: "bg-panelHi     text-muted   border-line",
};

const ERROR_TONE: SyncTone = {
  dot: "bg-danger",
  text: "помилка",
  pill: "bg-danger-soft  text-danger  border-danger/20",
};

const TONE_BY_STATUS: Record<string, SyncTone> = {
  error: ERROR_TONE,
  partial: PARTIAL_TONE,
  loading: LOADING_TONE,
};

export function getFinykSyncTone(syncStatus: SyncStatus): SyncTone {
  if (!syncStatus) return DEFAULT_TONE;
  return TONE_BY_STATUS[syncStatus] ?? DEFAULT_TONE;
}
