import { readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Returns the next zero-padded 3-digit migration number. */
function nextMigrationNumber() {
  const migDir = resolve(__dirname, "apps/server/src/migrations");
  const files = readdirSync(migDir);
  const nums = files
    .map((f) => parseInt(f.slice(0, 3), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1).padStart(3, "0");
}

/** Returns the next zero-padded 4-digit ADR number. */
function nextAdrNumber() {
  const adrDir = resolve(__dirname, "docs/adr");
  const files = readdirSync(adrDir);
  const nums = files
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .map((f) => parseInt(f.slice(0, 4), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1).padStart(4, "0");
}

export default function (plop) {
  plop.setHelper("timestamp", () => new Date().toISOString().slice(0, 10));

  // ── migration ──────────────────────────────────────────────────────────────
  plop.setGenerator("migration", {
    description: "New SQL migration (auto-numbered up + down)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Migration name (snake_case, e.g. add_user_settings):",
        validate: (v) => /^[a-z][a-z0-9_]*$/.test(v) || "snake_case only",
      },
    ],
    actions: (data) => {
      const num = nextMigrationNumber();
      const base = `apps/server/src/migrations/${num}_${data.name}`;
      return [
        {
          type: "add",
          path: `${base}.sql`,
          templateFile: "plop-templates/migration/up.sql.hbs",
        },
        {
          type: "add",
          path: `${base}.down.sql`,
          templateFile: "plop-templates/migration/down.sql.hbs",
        },
      ];
    },
  });

  // ── rq-hook ────────────────────────────────────────────────────────────────
  plop.setGenerator("rq-hook", {
    description: "New React Query hook (useXxx pattern)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Hook name without 'use' prefix (e.g. UserProfile):",
        validate: (v) =>
          /^[A-Z][A-Za-z0-9]+$/.test(v) || "PascalCase only, no 'use' prefix",
      },
      {
        type: "list",
        name: "module",
        message: "Target module:",
        choices: ["finyk", "fizruk", "nutrition", "routine", "core", "shared"],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/web/src/modules/{{module}}/hooks/use{{name}}.ts",
        templateFile: "plop-templates/rq-hook/hook.ts.hbs",
      },
    ],
  });

  // ── hubchat-tool ───────────────────────────────────────────────────────────
  plop.setGenerator("hubchat-tool", {
    description:
      "New HubChat tool (server tooldef stub + client action handler stub)",
    prompts: [
      {
        type: "input",
        name: "toolName",
        message: "Tool name (snake_case, e.g. log_water):",
        validate: (v) => /^[a-z][a-z0-9_]*$/.test(v) || "snake_case only",
      },
      {
        type: "list",
        name: "domain",
        message: "Domain file (server toolDefs):",
        choices: [
          "finyk",
          "fizruk",
          "nutrition",
          "routine",
          "crossModule",
          "utility",
          "memory",
        ],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/server/src/modules/chat/toolDefs/{{camelCase toolName}}.stub.ts",
        templateFile: "plop-templates/hubchat-tool/tooldef.ts.hbs",
      },
      {
        type: "add",
        path: "apps/web/src/core/lib/chatActions/{{camelCase toolName}}Action.stub.ts",
        templateFile: "plop-templates/hubchat-tool/executor.ts.hbs",
      },
    ],
  });

  // ── endpoint ───────────────────────────────────────────────────────────────
  plop.setGenerator("endpoint", {
    description: "New Express API endpoint (handler + test + api-client stub)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Endpoint name (camelCase, e.g. getUserProfile):",
        validate: (v) => /^[a-z][A-Za-z0-9]+$/.test(v) || "camelCase only",
      },
      {
        type: "list",
        name: "module",
        message: "Server module:",
        choices: [
          "finyk",
          "fizruk",
          "nutrition",
          "routine",
          "chat",
          "auth",
          "shared",
        ],
      },
      {
        type: "list",
        name: "method",
        message: "HTTP method:",
        choices: ["GET", "POST", "PATCH", "DELETE"],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/server/src/modules/{{module}}/{{name}}.ts",
        templateFile: "plop-templates/endpoint/handler.ts.hbs",
      },
      {
        type: "add",
        path: "apps/server/src/modules/{{module}}/{{name}}.test.ts",
        templateFile: "plop-templates/endpoint/handler.test.ts.hbs",
      },
      {
        type: "add",
        path: "apps/web/src/modules/{{module}}/api/{{name}}.ts",
        templateFile: "plop-templates/endpoint/api-client.ts.hbs",
      },
    ],
  });

  // ── adr ────────────────────────────────────────────────────────────────────
  plop.setGenerator("adr", {
    description:
      "New Architecture Decision Record (auto-numbered from docs/adr/)",
    prompts: [
      {
        type: "input",
        name: "title",
        message:
          "ADR title (kebab-case, e.g. rq-keys-factory or event-sourcing-queue):",
        validate: (v) =>
          /^[a-z][a-z0-9-]*[a-z0-9]$/.test(v) ||
          "kebab-case only (lowercase letters, digits, hyphens)",
      },
      {
        type: "input",
        name: "humanTitle",
        message:
          "Human-readable title (for the H1 heading, e.g. RQ keys factory):",
        validate: (v) => v.trim().length > 0 || "required",
      },
      {
        type: "input",
        name: "deciders",
        message: "Deciders (GitHub handles, comma-separated):",
        default: "@Skords-01",
      },
    ],
    actions: (data) => {
      const num = nextAdrNumber();
      data.num = num;
      return [
        {
          type: "add",
          path: `docs/adr/${num}-${data.title}.md`,
          templateFile: "plop-templates/adr/adr.md.hbs",
        },
      ];
    },
  });
}
