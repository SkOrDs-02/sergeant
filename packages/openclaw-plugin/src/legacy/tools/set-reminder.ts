/**
 * `set_reminder` tool — write-tool, але по плану Phase-1 без approval gate
 * (read-write для нагадувань вважається безпечним: текст видимий founder-у,
 * відмінити завжди можна `/reminders/cancel`).
 *
 * Server contract (`POST /api/internal/openclaw/reminders/set`):
 *   { founderUserId, reminderText, dueAtIso, persona?, topic?, channel?, sourceInvocationId?, metadata? }
 *   → { reminder: ReminderRecord }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import type { ToolDefinition, ToolResult } from "../sdk-types.js";
import { formatError } from "./github-search.js";

export const SetReminderParamsSchema = z.object({
  reminderText: z.string().min(1).max(4000),
  dueAtIso: z
    .string()
    .describe(
      "ISO-8601 timestamp with timezone offset (e.g. '2026-05-15T09:00+03:00').",
    ),
  persona: z.string().min(1).max(50).optional(),
  topic: z.string().min(1).max(100).nullable().optional(),
  channel: z.enum(["telegram", "whatsapp"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SetReminderParams = z.infer<typeof SetReminderParamsSchema>;

interface ReminderRecord {
  id: number;
  founderUserId: string;
  persona: string;
  topic: string | null;
  reminderText: string;
  dueAt: string;
  status: string;
  channel: string;
  attempts: number;
  metadata: Record<string, unknown>;
}

interface SetReminderResponse {
  reminder: ReminderRecord;
}

export interface SetReminderToolOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
}

const DESCRIPTION = `Schedule a reminder для founder-а на конкретний час (ISO-8601
with offset, e.g. '2026-05-15T09:00+03:00'). Cron-poller автоматично доставить
у Telegram/WhatsApp. Use for "нагадай завтра о 9 переглянути investor deck",
"перевір KPI у понеділок о 10".`;

export function createSetReminderTool(
  opts: SetReminderToolOptions,
): ToolDefinition<SetReminderParams> {
  return {
    name: "set_reminder",
    description: DESCRIPTION,
    parameters: SetReminderParamsSchema,
    execute: async (_invocationId, params) => {
      try {
        const response = await opts.http.post<SetReminderResponse>(
          "/reminders/set",
          {
            founderUserId: opts.founderUserId,
            ...params,
          },
        );
        return formatResult(response);
      } catch (err) {
        return formatError(err, "set_reminder");
      }
    },
  };
}

function formatResult(response: SetReminderResponse): ToolResult {
  const r = response.reminder;
  return {
    content: [
      {
        type: "text",
        text: `(reminder #${r.id} scheduled — channel=${r.channel} persona=${r.persona} due=${r.dueAt})`,
      },
      { type: "structured", data: { reminder: r } },
    ],
  };
}
