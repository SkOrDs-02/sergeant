#!/usr/bin/env node
// scripts/agent/mcp-server.mjs
//
// Thin, zero-dependency MCP stdio server exposing one tool — `agent_find` —
// over the committed retrieval manifest (Initiative 0018 Phase 4). It is a thin
// wrapper: the ranking lives in find.mjs, which this server shells out to, so
// there is exactly one search engine. No @modelcontextprotocol/sdk dependency —
// the stdio transport is newline-delimited JSON-RPC 2.0, implemented by hand
// (same "no new deps" stance as the TS-compiler symbol extractor, ADR-0059).
//
// Wired in .mcp.json as the `sergeant-agent-find` server. See
// docs/04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md.

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const FIND = resolve(REPO_ROOT, "scripts/agent/find.mjs");
const PROTOCOL_VERSION = "2024-11-05";

const TOOL = {
  name: "agent_find",
  description:
    "Search the Sergeant repo's knowledge (ADRs, playbooks, skills, hard rules, " +
    "audits, package exports) by meaning and return ranked file:line pointers. " +
    "Use this first instead of grepping blind when you need to find where " +
    "something lives or which governance artifact owns a topic.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural-language search query." },
      type: {
        type: "string",
        description:
          "Optional filter to one chunk type (adr, initiative, playbook, skill, hard-rule, audit, export).",
      },
      k: {
        type: "integer",
        description: "Max results (default 8).",
        minimum: 1,
      },
    },
    required: ["query"],
  },
};

function runFind({ query, type, k }) {
  const args = [FIND, String(query ?? ""), "--json"];
  if (type) args.push("--type", String(type));
  if (k) args.push("--k", String(k));
  const out = execFileSync("node", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return JSON.parse(out);
}

function formatResults({ mode, results }) {
  if (!results || results.length === 0) return "No matches.";
  const lines = results.map((r) => {
    const where =
      r.line && !r.path.includes("#") ? `${r.path}:${r.line}` : r.path;
    const status = r.status ? ` {${r.status}}` : "";
    return `- ${where} — ${r.title} [${r.type}]${status} (score ${r.score})`;
  });
  return `mode: ${mode}\n${lines.join("\n")}`;
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "sergeant-agent-find", version: "1.0.0" },
      });
      return;
    case "notifications/initialized":
    case "notifications/cancelled":
      return; // notifications — no response
    case "ping":
      reply(id, {});
      return;
    case "tools/list":
      reply(id, { tools: [TOOL] });
      return;
    case "tools/call": {
      if (params?.name !== TOOL.name) {
        replyError(id, -32602, `Unknown tool: ${params?.name}`);
        return;
      }
      try {
        const result = runFind(params.arguments ?? {});
        reply(id, {
          content: [{ type: "text", text: formatResults(result) }],
        });
      } catch (err) {
        reply(id, {
          content: [
            { type: "text", text: `agent_find failed: ${err.message}` },
          ],
          isError: true,
        });
      }
      return;
    }
    default:
      if (!isNotification)
        replyError(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // ignore non-JSON lines
  }
  try {
    handle(msg);
  } catch (err) {
    if (msg?.id != null)
      replyError(msg.id, -32603, `Internal error: ${err.message}`);
  }
});
