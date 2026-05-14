/**
 * All 17 Stage 4b Layer 0 shortcuts. Exported as `ALL_SHORTCUTS` for the
 * router. Order matters: the router iterates this list and the first
 * pattern match wins, so put narrower / sentinel-bearing shortcuts first.
 */

import { buildsShortcut } from "./builds.js";
import { decisionsShortcut } from "./decisions.js";
import { digestShortcut } from "./digest.js";
import { heartbeatShortcut } from "./heartbeat.js";
import { metricsShortcut } from "./metrics.js";
import { posthogShortcut } from "./posthog.js";
import { prsShortcut } from "./prs.js";
import { forgetShortcut } from "./forget.js";
import { recallShortcut } from "./recall.js";
import { refreshMetricsShortcut } from "./refresh-metrics.js";
import { releasesShortcut } from "./releases.js";
import { remindShortcut } from "./remind.js";
import { runwayShortcut } from "./runway.js";
import { sentryShortcut } from "./sentry.js";
import { statusShortcut } from "./status.js";
import { stripeShortcut } from "./stripe.js";
import { thinkShortcut } from "./think.js";
import { workflowsShortcut } from "./workflows.js";
import type { ShortcutDefinition } from "./types.js";

export const ALL_SHORTCUTS: ShortcutDefinition[] = [
  // /think must match first — its renderer returns the ESCALATE sentinel and
  // any slash beginning with "/th…" would otherwise risk colliding.
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
  buildsShortcut,
  decisionsShortcut,
  digestShortcut,
  forgetShortcut,
  heartbeatShortcut,
  metricsShortcut,
  posthogShortcut,
  prsShortcut,
  recallShortcut,
  refreshMetricsShortcut,
  releasesShortcut,
  remindShortcut,
  runwayShortcut,
  sentryShortcut,
  statusShortcut,
  stripeShortcut,
  thinkShortcut,
  workflowsShortcut,
};
