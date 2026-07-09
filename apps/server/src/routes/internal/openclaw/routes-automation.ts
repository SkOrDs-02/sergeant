/**
 * OpenClaw internal sub-router: PR-C1c n8n delegation surface +
 * business-snapshot refresh, PR /mute (Phase 5b) founder DM mute-state,
 * and PR-C1b reminder store endpoints.
 * Split from `routes/internal/openclaw.ts` (Hard Rule #18).
 */

import type { Router } from "express";
import type { Pool } from "pg";
import { parseBody } from "../../../http/validate.js";
import {
  // PR-C1c (Phase 1): n8n delegation surface + refresh_business_snapshot.
  listN8nWorkflows,
  describeN8nWorkflow,
  triggerN8nWorkflow,
  activateN8nWorkflow,
  refreshBusinessSnapshot,
  N8nAllowlistError,
  // PR /mute (Phase 5b): founder DM mute-state CRUD + guard.
  setFounderMute,
  clearFounderMute,
  getFounderMute,
  isFounderMuted,
  // PR-C1b: reminder store + FSM helpers.
  setReminder,
  listDueReminders,
  markReminderSent,
  markReminderFailed,
  markReminderCancelled,
  listFounderReminders,
  ReminderValidationError,
} from "../../../modules/openclaw/index.js";
import {
  asN8nAllowlistFailure,
  asNotFound,
  asSchemaFailure,
} from "./helpers.js";
import {
  ListDueRemindersBody,
  MuteFounderBody,
  MuteSetBody,
  N8nActivateBody,
  N8nListBody,
  N8nWorkflowIdBody,
  ReminderMarkBody,
  RemindersListBody,
  SetReminderBody,
  SnapshotRefreshBody,
} from "./schemas.js";

export function registerAutomationRoutes(r: Router, pool: Pool): void {
  // ─────────────────────────────────────────────────────────────────────
  // PR-C1c (Phase 1): n8n delegation surface
  // ─────────────────────────────────────────────────────────────────────

  // ---- n8n: list workflows ----
  r.post("/api/internal/openclaw/n8n/list", async (req, res) => {
    const parsed = parseBody(N8nListBody, req);
    const result = await listN8nWorkflows({
      tiers: parsed.tiers,
      limit: parsed.limit,
    });
    res.json(result);
  });

  // ---- n8n: describe a single workflow ----
  r.post("/api/internal/openclaw/n8n/describe", async (req, res) => {
    const parsed = parseBody(N8nWorkflowIdBody, req);
    const result = await describeN8nWorkflow({
      workflowId: parsed.workflowId,
    });
    res.json(result);
  });

  // ---- n8n: trigger (Tier A auto / Tier C gated; Tier B/D + unknown refused) ----
  r.post("/api/internal/openclaw/n8n/trigger", async (req, res) => {
    const parsed = parseBody(N8nWorkflowIdBody, req);
    try {
      const result = await triggerN8nWorkflow({
        workflowId: parsed.workflowId,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof N8nAllowlistError) {
        return asN8nAllowlistFailure(res, err);
      }
      throw err;
    }
  });

  // ---- n8n: activate / deactivate (Tier A/C only; Tier B/D + unknown refused) ----
  r.post("/api/internal/openclaw/n8n/activate", async (req, res) => {
    const parsed = parseBody(N8nActivateBody, req);
    try {
      const result = await activateN8nWorkflow({
        workflowId: parsed.workflowId,
        active: parsed.active,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof N8nAllowlistError) {
        return asN8nAllowlistFailure(res, err);
      }
      throw err;
    }
  });

  // ---- snapshot/refresh: fires every Tier A workflow in parallel ----
  r.post("/api/internal/openclaw/snapshot/refresh", async (req, res) => {
    const parsed = parseBody(SnapshotRefreshBody, req);
    const result = await refreshBusinessSnapshot({
      workflowIds: parsed.workflowIds,
    });
    res.json(result);
  });

  // ─── PR /mute (Phase 5b): founder DM "do not disturb" ─────────────────
  //
  // Чотири endpoints: `set`, `clear`, `status`, `check`. Slash `/mute`
  // (handler — `tools/openclaw/.../handler-info-commands.ts`) обертає
  // duration → ISO timestamp → POST /mute/set; `/mute off` → /mute/clear;
  // `/mute status` → /mute/status. `/mute/check` — read-only guard для
  // outbound channels (alerts shipper, briefing endpoint, ranok-cron).
  //
  // Critical-override: цей endpoint НЕ перевіряє severity — повертає
  // raw state. Caller (alerts shipper) сам приймає рішення про bypass
  // на P0 alerts. Це дозволяє кожному channel-у мати свій override-
  // criterion без перевантаженого guard-API.

  // ---- mute/set ----
  r.post("/api/internal/openclaw/mute/set", async (req, res) => {
    const parsed = parseBody(MuteSetBody, req);
    const mutedUntil = parsed.mutedUntilIso
      ? new Date(parsed.mutedUntilIso)
      : null;
    const state = await setFounderMute(pool, {
      founderUserId: parsed.founderUserId,
      mutedUntil,
      reason: parsed.reason ?? null,
    });
    res.json(state);
  });

  // ---- mute/clear ("/mute off") ----
  r.post("/api/internal/openclaw/mute/clear", async (req, res) => {
    const parsed = parseBody(MuteFounderBody, req);
    const state = await clearFounderMute(pool, {
      founderUserId: parsed.founderUserId,
    });
    res.json(state);
  });

  // ---- mute/status ("/mute status" reply payload) ----
  r.post("/api/internal/openclaw/mute/status", async (req, res) => {
    const parsed = parseBody(MuteFounderBody, req);
    const state = await getFounderMute(pool, {
      founderUserId: parsed.founderUserId,
    });
    res.json({ state });
  });

  // ---- mute/check (runtime guard for outbound channels) ----
  r.post("/api/internal/openclaw/mute/check", async (req, res) => {
    const parsed = parseBody(MuteFounderBody, req);
    const result = await isFounderMuted(pool, {
      founderUserId: parsed.founderUserId,
    });
    res.json(result);
  });

  // ─── PR-C1b: reminders ──────────────────────────────────────────────

  // ---- reminders/set ----
  r.post("/api/internal/openclaw/reminders/set", async (req, res) => {
    const parsed = parseBody(SetReminderBody, req);
    try {
      const reminder = await setReminder(pool, parsed);
      res.json({ reminder });
    } catch (err) {
      if (err instanceof ReminderValidationError) {
        return asSchemaFailure(res, err);
      }
      throw err;
    }
  });

  // ---- reminders/list-due ----
  r.post("/api/internal/openclaw/reminders/list-due", async (req, res) => {
    const parsed = parseBody(ListDueRemindersBody, req);
    const opts: { limit?: number; nowIso?: string } = {};
    if (parsed.limit !== undefined) opts.limit = parsed.limit;
    if (parsed.nowIso !== undefined) opts.nowIso = parsed.nowIso;
    const reminders = await listDueReminders(pool, opts);
    res.json({ reminders });
  });

  // ---- reminders/mark-sent (used by cron-poller after delivery) ----
  r.post("/api/internal/openclaw/reminders/mark-sent", async (req, res) => {
    const parsed = parseBody(ReminderMarkBody, req);
    const reminder = await markReminderSent(pool, parsed.reminderId);
    if (!reminder) {
      return asNotFound(
        res,
        new Error(`reminder ${parsed.reminderId} not in 'pending' state`),
      );
    }
    res.json({ reminder });
  });

  // ---- reminders/mark-failed (used after attempts exhausted) ----
  r.post("/api/internal/openclaw/reminders/mark-failed", async (req, res) => {
    const parsed = parseBody(ReminderMarkBody, req);
    const reminder = await markReminderFailed(
      pool,
      parsed.reminderId,
      parsed.reason,
    );
    if (!reminder) {
      return asNotFound(
        res,
        new Error(`reminder ${parsed.reminderId} not in 'pending' state`),
      );
    }
    res.json({ reminder });
  });

  // ---- reminders/cancel (founder-initiated) ----
  r.post("/api/internal/openclaw/reminders/cancel", async (req, res) => {
    const parsed = parseBody(ReminderMarkBody, req);
    const founderUserId = parsed.founderUserId;
    if (!founderUserId) {
      return asSchemaFailure(
        res,
        new Error("reminders/cancel: founderUserId required"),
      );
    }
    const reminder = await markReminderCancelled(
      pool,
      parsed.reminderId,
      founderUserId,
    );
    if (!reminder) {
      return asNotFound(
        res,
        new Error(
          `reminder ${parsed.reminderId} not cancellable (not pending or not owned)`,
        ),
      );
    }
    res.json({ reminder });
  });

  // ---- reminders/list (founder-scoped) ----
  r.post("/api/internal/openclaw/reminders/list", async (req, res) => {
    const parsed = parseBody(RemindersListBody, req);
    const reminders = await listFounderReminders(pool, {
      founderUserId: parsed.founderUserId,
      statuses: parsed.statuses,
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    });
    res.json({ reminders });
  });
}
