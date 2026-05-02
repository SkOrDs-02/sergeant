export type DispatcherAction =
  | "status"
  | "plan"
  | "assign"
  | "review"
  | "run"
  | "approve"
  | "cancel"
  | "logs";

export type SpecialistAgent =
  | "product-roadmap"
  | "repo-architect"
  | "web-ui"
  | "server-api"
  | "data-migrations"
  | "mobile"
  | "hubchat-ai"
  | "n8n-automation"
  | "growth-marketing"
  | "qa-release"
  | "security";

export type RiskTier = "P0" | "P1" | "P2";
export type DispatchMode = "read-only" | "mutation";

export interface DispatcherClassification {
  action: DispatcherAction;
  specialist: SpecialistAgent;
  riskTier: RiskTier;
  mode: DispatchMode;
  requiresApproval: boolean;
}

export interface DispatcherPayload extends DispatcherClassification {
  source: "telegram-console";
  commandText: string;
  telegram: {
    userId: number;
    chatId: number;
    messageId: number;
  };
}

const READ_ONLY_ACTIONS = new Set<DispatcherAction>([
  "status",
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
  "release",
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
  commandText: string;
  telegramUserId: number;
  telegramChatId: number;
  messageId: number;
}): DispatcherPayload {
  return {
    source: "telegram-console",
    commandText: input.commandText,
    ...classifyDispatcherCommand(input.commandText),
    telegram: {
      userId: input.telegramUserId,
      chatId: input.telegramChatId,
      messageId: input.messageId,
    },
  };
}

export function formatApprovalPrompt(payload: DispatcherPayload): string {
  return [
    "Approval required.",
    "",
    `Action: ${payload.action}`,
    `Specialist: ${payload.specialist}`,
    `Risk: ${payload.riskTier}`,
    "",
    `Run /approve ${payload.commandText} to continue.`,
  ].join("\n");
}

export async function dispatchToN8n(
  payload: DispatcherPayload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const webhookUrl = env.N8N_AGENT_DISPATCHER_WEBHOOK_URL;
  if (!webhookUrl) {
    return [
      "n8n dispatcher webhook is not configured.",
      "",
      `Task: ${payload.commandText}`,
      `Specialist: ${payload.specialist}`,
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

  const text = await response.text();
  return text.trim() || "Task accepted by n8n dispatcher.";
}
