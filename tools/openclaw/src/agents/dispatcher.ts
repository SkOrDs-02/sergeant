import { randomUUID } from "node:crypto";

export type DispatcherAction =
  | "status"
  | "plan"
  | "assign"
  | "review"
  | "run"
  | "approve"
  | "cancel"
  | "logs";

/**
 * Runtime specialist agents. Telegram dispatcher (`/assign <specialist> …`)
 * uses these labels to classify tasks; the Devin / Claude session loads the
 * matching governance skill from `.agents/skills/` to actually do the work.
 *
 * Canonical mapping table: `docs/agents/specialists-mapping.md`.
 */
export type SpecialistAgent =
  /** @see docs/agents/specialists-mapping.md (extra — uses `sergeant-start-here` for routing). */
  | "product-roadmap"
  /** @see .agents/skills/sergeant-monorepo-boundaries/SKILL.md */
  | "repo-architect"
  /** @see .agents/skills/sergeant-web-ui/SKILL.md */
  | "web-ui"
  /** @see .agents/skills/sergeant-server-api/SKILL.md */
  | "server-api"
  /** @see .agents/skills/sergeant-data-and-migrations/SKILL.md */
  | "data-migrations"
  /** @see .agents/skills/sergeant-mobile-expo/SKILL.md */
  | "mobile"
  /** @see .agents/skills/sergeant-hubchat/SKILL.md */
  | "hubchat-ai"
  /** @see docs/agents/specialists-mapping.md (extra — `modify-n8n-workflow.md` playbook is canonical). */
  | "n8n-automation"
  /** @see docs/agents/specialists-mapping.md (extra — output is product / launch artefacts, not repo edits). */
  | "growth-marketing"
  /**
   * @see .agents/skills/sergeant-deploy-and-observability/SKILL.md
   * @see .agents/skills/sergeant-review-and-merge/SKILL.md
   */
  | "qa-release"
  /**
   * @see .agents/skills/better-auth-best-practices/SKILL.md (auth-flow scope)
   * @see docs/agents/specialists-mapping.md (extra — broader security skill is a phase-5 candidate).
   */
  | "security";

/**
 * Specialist → governance skill mapping.
 *
 * Mirrors the canonical table in `docs/agents/specialists-mapping.md`. The
 * Telegram dispatcher uses this to render «Loading skill: `<skill>`» in the
 * status callback so reviewers (and the agent itself) can see exactly which
 * `.agents/skills/<name>/SKILL.md` is loaded for a given `/assign` task.
 *
 * `null` means the specialist has no dedicated skill yet — the table
 * marks these with `_(extra — …)_` and either points at a playbook or at
 * `sergeant-start-here` as a routing fallback. Update both this map AND
 * `docs/agents/specialists-mapping.md` together (the file is the source of
 * truth; this map is the runtime mirror).
 */
export const SPECIALIST_SKILL_MAP: Record<SpecialistAgent, string | null> = {
  "product-roadmap": "sergeant-start-here",
  "repo-architect": "sergeant-monorepo-boundaries",
  "web-ui": "sergeant-web-ui",
  "server-api": "sergeant-server-api",
  "data-migrations": "sergeant-data-and-migrations",
  mobile: "sergeant-mobile-expo",
  "hubchat-ai": "sergeant-hubchat",
  "n8n-automation": null,
  "growth-marketing": null,
  "qa-release": "sergeant-deploy-and-observability",
  security: "better-auth-best-practices",
};

export function getGoverningSkill(specialist: SpecialistAgent): string | null {
  return SPECIALIST_SKILL_MAP[specialist];
}

/**
 * Render the «Loading skill: …» status line for a Telegram callback.
 *
 * Examples:
 *   getGoverningSkill("web-ui")           → "sergeant-web-ui"
 *   formatSkillStatusLine("web-ui")       → "Loading skill: `sergeant-web-ui`"
 *   formatSkillStatusLine("n8n-automation") →
 *     "Loading skill: (no dedicated skill — see docs/agents/specialists-mapping.md)"
 */
export function formatSkillStatusLine(specialist: SpecialistAgent): string {
  const skill = getGoverningSkill(specialist);
  return skill === null
    ? "Loading skill: (no dedicated skill — see docs/agents/specialists-mapping.md)"
    : `Loading skill: \`${skill}\``;
}

export type RiskTier = "P0" | "P1" | "P2";
export type DispatchMode = "read-only" | "mutation";

export interface DispatcherClassification {
  action: DispatcherAction;
  specialist: SpecialistAgent;
  riskTier: RiskTier;
  mode: DispatchMode;
  requiresApproval: boolean;
}

export interface AgentTaskActor {
  type: "telegram";
  telegramUserId: number;
}

export interface AgentTaskIntent {
  rawText: string;
  normalizedText: string;
}

export interface AgentStatusCallback {
  channel: "telegram-chat" | "telegram-dm";
  chatId: number;
  messageId: number;
  webhookUrl?: string;
}

export interface AgentTaskArtifact {
  type: "github_issue" | "github_pr" | "report" | "n8n_execution" | "log";
  url?: string;
  id?: string;
  title?: string;
}

export interface AgentTaskEnvelope extends DispatcherClassification {
  taskId: string;
  source: "telegram-console" | "openclaw";
  commandText: string;
  intent: AgentTaskIntent;
  actor: AgentTaskActor;
  approvalId?: string;
  telegram: {
    userId: number;
    chatId: number;
    messageId: number;
  };
  statusCallback: AgentStatusCallback;
  artifacts: AgentTaskArtifact[];
}

export type DispatcherPayload = AgentTaskEnvelope;

const READ_ONLY_ACTIONS = new Set<DispatcherAction>([
  "status",
  "plan",
  "review",
  "logs",
]);

const MUTATION_KEYWORDS = [
  "assign",
  "approve",
  "deploy",
  "migration",
  "migrate",
  "db ",
  "database",
  "import",
  "workflow",
  "credential",
  "secret",
  "write",
  "merge",
  "production",
];

export function parseDispatcherAction(commandText: string): DispatcherAction {
  const firstToken = commandText.trim().split(/\s+/)[0]?.toLowerCase();
  if (
    firstToken === "status" ||
    firstToken === "plan" ||
    firstToken === "assign" ||
    firstToken === "review" ||
    firstToken === "run" ||
    firstToken === "approve" ||
    firstToken === "cancel" ||
    firstToken === "logs"
  ) {
    return firstToken;
  }
  return "plan";
}

export function requiresApproval(commandText: string): boolean {
  const action = parseDispatcherAction(commandText);
  if (!READ_ONLY_ACTIONS.has(action)) return true;

  const normalized = ` ${commandText.toLowerCase()} `;
  return MUTATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function chooseSpecialist(commandText: string): SpecialistAgent {
  const normalized = commandText.toLowerCase();

  if (normalized.includes("web-ui") || normalized.includes("frontend")) {
    return "web-ui";
  }
  if (normalized.includes("server") || normalized.includes("api")) {
    return "server-api";
  }
  if (
    normalized.includes("migration") ||
    normalized.includes("postgres") ||
    normalized.includes("db ")
  ) {
    return "data-migrations";
  }
  if (normalized.includes("mobile") || normalized.includes("expo")) {
    return "mobile";
  }
  if (
    normalized.includes("hubchat") ||
    normalized.includes("prompt") ||
    normalized.includes("ai tool")
  ) {
    return "hubchat-ai";
  }
  if (normalized.includes("n8n") || normalized.includes("workflow")) {
    return "n8n-automation";
  }
  if (normalized.includes("growth") || normalized.includes("marketing")) {
    return "growth-marketing";
  }
  if (
    normalized.includes("ci") ||
    normalized.includes("test") ||
    normalized.includes("check")
  ) {
    return "qa-release";
  }
  if (
    normalized.includes("security") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.includes("approve")
  ) {
    return "security";
  }
  if (
    normalized.includes("status") ||
    normalized.includes("run") ||
    normalized.includes("logs")
  ) {
    return "qa-release";
  }
  if (normalized.includes("roadmap") || normalized.includes("plan")) {
    return "product-roadmap";
  }
  return "repo-architect";
}

function chooseRiskTier(
  commandText: string,
  mode: DispatchMode,
  specialist: SpecialistAgent,
): RiskTier {
  const normalized = commandText.toLowerCase();
  if (
    normalized.includes("approve") ||
    normalized.includes("deploy") ||
    normalized.includes("production") ||
    normalized.includes("secret") ||
    normalized.includes("credential")
  ) {
    return "P0";
  }
  if (mode === "mutation" || specialist === "security") return "P1";
  return "P2";
}

export function classifyDispatcherCommand(
  commandText: string,
): DispatcherClassification {
  const action = parseDispatcherAction(commandText);
  const approvalRequired = requiresApproval(commandText);
  const mode: DispatchMode = approvalRequired ? "mutation" : "read-only";
  const specialist = chooseSpecialist(commandText);
  const riskTier = chooseRiskTier(commandText, mode, specialist);

  return {
    action,
    specialist,
    riskTier,
    mode,
    requiresApproval: approvalRequired,
  };
}

export function buildDispatcherPayload(input: {
  taskId?: string | undefined;
  source?: DispatcherPayload["source"] | undefined;
  approvalId?: string | undefined;
  statusCallbackWebhookUrl?: string | undefined;
  commandText: string;
  telegramUserId: number;
  telegramChatId: number;
  messageId: number;
}): DispatcherPayload {
  const source = input.source ?? "telegram-console";
  const taskId =
    input.taskId ?? `agent-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const normalizedText = input.commandText.trim().toLowerCase();
  return {
    taskId,
    source,
    commandText: input.commandText,
    intent: {
      rawText: input.commandText,
      normalizedText,
    },
    ...classifyDispatcherCommand(input.commandText),
    actor: {
      type: "telegram",
      telegramUserId: input.telegramUserId,
    },
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    telegram: {
      userId: input.telegramUserId,
      chatId: input.telegramChatId,
      messageId: input.messageId,
    },
    statusCallback: {
      channel:
        source === "openclaw" && input.telegramChatId === input.telegramUserId
          ? "telegram-dm"
          : "telegram-chat",
      chatId: input.telegramChatId,
      messageId: input.messageId,
      ...(input.statusCallbackWebhookUrl
        ? { webhookUrl: input.statusCallbackWebhookUrl }
        : {}),
    },
    artifacts: [],
  };
}

export function formatApprovalPrompt(payload: DispatcherPayload): string {
  return [
    "Approval required.",
    "",
    `Task: ${payload.taskId}`,
    `Source: ${payload.source}`,
    ...(payload.approvalId ? [`Approval: ${payload.approvalId}`] : []),
    `Action: ${payload.action}`,
    `Specialist: ${payload.specialist}`,
    formatSkillStatusLine(payload.specialist),
    `Risk: ${payload.riskTier}`,
    "",
    `Run /approve ${payload.commandText} to continue.`,
  ].join("\n");
}

const OPENCLAW_AGENT_NETWORK_KEYWORDS = [
  "agent",
  "ci",
  "test",
  "check",
  "pr ",
  " pr",
  "pull request",
  "github",
  "issue",
  "branch",
  "review",
  "repo",
  "n8n",
  "workflow",
  "security",
  "secret",
  "credential",
  "deploy",
  "migration",
  "migrate",
  "railway",
  "sentry",
  "перевір",
  "перевiр",
  "гітхаб",
  "гiтхаб",
  "воркфлоу",
  "деплой",
  "міграц",
  "мiграц",
  "секрет",
];

export function shouldDelegateOpenClawToAgentNetwork(
  commandText: string,
): boolean {
  const normalized = ` ${commandText.trim().toLowerCase()} `;
  if (!normalized.trim()) return false;
  return OPENCLAW_AGENT_NETWORK_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
}

export async function dispatchToN8n(
  payload: DispatcherPayload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const skillLine = formatSkillStatusLine(payload.specialist);
  const webhookUrl = env["N8N_AGENT_DISPATCHER_WEBHOOK_URL"];
  if (!webhookUrl) {
    return [
      "n8n dispatcher webhook is not configured.",
      "",
      `Task: ${payload.commandText}`,
      `Specialist: ${payload.specialist}`,
      skillLine,
      `Risk: ${payload.riskTier}`,
    ].join("\n");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return `n8n dispatcher failed: HTTP ${response.status}`;
  }

  const text = (await response.text()).trim();
  const accepted = text || "Task accepted by n8n dispatcher.";
  return `${skillLine}\n${accepted}`;
}
