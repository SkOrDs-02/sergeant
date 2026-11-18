import type { messages as ukMessages, MessageGroupShape } from "./uk";

// Структурне дзеркало uk-групи `publicStatus`: кожен листовий ключ
// обовʼязковий, stub неможливий (див. shallow-merge контракт у `index.ts`).
export const publicStatusEn: MessageGroupShape<
  (typeof ukMessages)["publicStatus"]
> = {
  pageTitle: "Sergeant · Status",
  pollNote: "Current component status. Updated automatically every",
  pollNoteSuffix: "s.",
  loading: "Loading service status…",
  overallOperational: "All systems operational",
  overallDegraded: "Partial degradation",
  overallDown: "Major outage",
  pillOperational: "Operational",
  pillDegraded: "Degraded",
  pillDown: "Down",
  timestampPrefix: "updated",
  componentsLabel: "Components",
  lastIncidentNone: "No incidents in the last 7 days.",
  lastIncidentPrefix: "Last incident:",
  errorTitle: "Could not load status",
  errorRetry: "Try again",
  errorFallback: "Could not load service status.",
  errorHttpPrefix: "Server responded with HTTP",
};
