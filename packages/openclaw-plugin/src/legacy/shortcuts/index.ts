/**
 * All 17 Layer 0 shortcuts. Exported as a single array for the
 * shortcut router. Order matters: first match wins.
 */

import type { ShortcutDefinition } from "../shortcut-router.js";
import { metricsShortcut } from "./metrics.js";
import { runwayShortcut } from "./runway.js";
import { statusShortcut } from "./status.js";
import { sentryShortcut } from "./sentry.js";
import { stripeShortcut } from "./stripe.js";
import { posthogShortcut } from "./posthog.js";
import { prsShortcut } from "./prs.js";
import { releasesShortcut } from "./releases.js";
import { buildsShortcut } from "./builds.js";
import { workflowsShortcut } from "./workflows.js";
import { refreshMetricsShortcut } from "./refresh-metrics.js";
import { heartbeatShortcut } from "./heartbeat.js";
import { recallShortcut } from "./recall.js";
import { forgetShortcut } from "./forget.js";
import { decisionsShortcut } from "./decisions.js";
import { digestShortcut } from "./digest.js";
import { remindShortcut } from "./remind.js";
import { thinkShortcut } from "./think.js";

export const ALL_SHORTCUTS: ShortcutDefinition[] = [
  // Force-think must match first (before any slash that starts with /th…)
  thinkShortcut,
  // Metrics & status
  metricsShortcut,
  runwayShortcut,
  statusShortcut,
  sentryShortcut,
  stripeShortcut,
  posthogShortcut,
  // Code & repo
  prsShortcut,
  releasesShortcut,
  buildsShortcut,
  // Operations
  workflowsShortcut,
  refreshMetricsShortcut,
  heartbeatShortcut,
  // Memory & decisions
  recallShortcut,
  forgetShortcut,
  decisionsShortcut,
  digestShortcut,
  // Reminders
  remindShortcut,
];

export {
  metricsShortcut,
  runwayShortcut,
  statusShortcut,
  sentryShortcut,
  stripeShortcut,
  posthogShortcut,
  prsShortcut,
  releasesShortcut,
  buildsShortcut,
  workflowsShortcut,
  refreshMetricsShortcut,
  heartbeatShortcut,
  recallShortcut,
  forgetShortcut,
  decisionsShortcut,
  digestShortcut,
  remindShortcut,
  thinkShortcut,
};
