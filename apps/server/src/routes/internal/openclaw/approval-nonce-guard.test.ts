import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import {
  enforceWriteApproval,
  type ApprovalNonceConfig,
} from "./approval-nonce-guard.js";
import {
  APPROVAL_NONCE_HEADER,
  hashWriteArgs,
  newNonceId,
  signApprovalNonce,
} from "../../../modules/openclaw/index.js";

const SECRET = "guard-test-secret";
const NOW_MS = 1_700_000_000_000;
const now = () => NOW_MS;

interface LedgerRow {
  tool: string;
  argsHash: string;
  consumed: boolean;
}

/** Minimal in-memory stand-in for the openclaw_approval_nonce ledger. */
function makePool(seed: Array<[string, LedgerRow]> = []): {
  pool: Pool;
  consumeCalls: number;
} {
  const ledger = new Map(seed.map(([k, v]) => [k, { ...v }]));
  const state = { consumeCalls: 0 };
  const pool = {
    async query(sql: string, params: unknown[]) {
      if (sql.includes("UPDATE openclaw_approval_nonce")) {
        state.consumeCalls += 1;
        const jti = params[0] as string;
        const row = ledger.get(jti);
        if (row && !row.consumed) {
          row.consumed = true;
          return {
            rows: [{ tool: row.tool, args_hash: row.argsHash }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return {
    pool,
    get consumeCalls() {
      return state.consumeCalls;
    },
  } as { pool: Pool; consumeCalls: number };
}

function makeReq(token?: string): Request {
  return {
    headers: token ? { [APPROVAL_NONCE_HEADER]: token } : {},
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function mint(
  tool: string,
  args: unknown,
): { token: string; jti: string; argsHash: string } {
  const jti = newNonceId();
  const argsHash = hashWriteArgs(tool, args);
  const token = signApprovalNonce(SECRET, {
    jti,
    tool,
    argsHash,
    exp: Math.floor(NOW_MS / 1000) + 300,
  });
  return { token, jti, argsHash };
}

const graceCfg: ApprovalNonceConfig = { secret: SECRET, required: false };
const requiredCfg: ApprovalNonceConfig = { secret: SECRET, required: true };
const disabledCfg: ApprovalNonceConfig = { secret: "", required: true };

const tool = "pause_workflow";
const args = { workflowId: "wf_1", reason: "noisy" };

describe("enforceWriteApproval", () => {
  it("no-ops when the feature is disabled (empty secret)", async () => {
    const { pool } = makePool();
    const res = makeRes();
    const ok = await enforceWriteApproval({
      pool,
      req: makeReq(),
      res,
      tool,
      writeArgs: args,
      config: disabledCfg,
      now,
    });
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it("passes through a missing nonce in grace mode", async () => {
    const { pool } = makePool();
    const res = makeRes();
    const ok = await enforceWriteApproval({
      pool,
      req: makeReq(),
      res,
      tool,
      writeArgs: args,
      config: graceCfg,
      now,
    });
    expect(ok).toBe(true);
  });

  it("rejects a missing nonce with 401 in required mode", async () => {
    const { pool } = makePool();
    const res = makeRes();
    const ok = await enforceWriteApproval({
      pool,
      req: makeReq(),
      res,
      tool,
      writeArgs: args,
      config: requiredCfg,
      now,
    });
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      code: "OPENCLAW_APPROVAL_NONCE_INVALID",
      reason: "missing_nonce",
    });
  });

  it("accepts and consumes a valid nonce in required mode", async () => {
    const { token, jti, argsHash } = mint(tool, args);
    const holder = makePool([[jti, { tool, argsHash, consumed: false }]]);
    const res = makeRes();
    const ok = await enforceWriteApproval({
      pool: holder.pool,
      req: makeReq(token),
      res,
      tool,
      writeArgs: args,
      config: requiredCfg,
      now,
    });
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it("rejects a replayed (already-consumed) nonce in required mode", async () => {
    const { token, jti, argsHash } = mint(tool, args);
    const holder = makePool([[jti, { tool, argsHash, consumed: false }]]);

    const first = await enforceWriteApproval({
      pool: holder.pool,
      req: makeReq(token),
      res: makeRes(),
      tool,
      writeArgs: args,
      config: requiredCfg,
      now,
    });
    expect(first).toBe(true);

    const res2 = makeRes();
    const second = await enforceWriteApproval({
      pool: holder.pool,
      req: makeReq(token),
      res: res2,
      tool,
      writeArgs: args,
      config: requiredCfg,
      now,
    });
    expect(second).toBe(false);
    expect(res2.statusCode).toBe(401);
    expect(res2.body).toMatchObject({ reason: "already_consumed" });
  });

  it("rejects a nonce bound to different args in required mode (never touches the ledger)", async () => {
    const { token, jti, argsHash } = mint(tool, args);
    const holder = makePool([[jti, { tool, argsHash, consumed: false }]]);
    const res = makeRes();
    const ok = await enforceWriteApproval({
      pool: holder.pool,
      req: makeReq(token),
      res,
      tool,
      writeArgs: { workflowId: "wf_1", reason: "tampered" },
      config: requiredCfg,
      now,
    });
    expect(ok).toBe(false);
    expect(res.body).toMatchObject({ reason: "args_mismatch" });
    // A forged/mismatched token must not burn a real nonce.
    expect(holder.consumeCalls).toBe(0);
  });

  it("flags a present-but-invalid nonce in grace mode but still passes through", async () => {
    const { token } = mint(tool, args);
    const holder = makePool();
    const res = makeRes();
    const ok = await enforceWriteApproval({
      pool: holder.pool,
      req: makeReq(token),
      res,
      // Wrong endpoint tool → tool_mismatch, but grace mode lets it through.
      tool: "mute_alert",
      writeArgs: { issueId: "1" },
      config: graceCfg,
      now,
    });
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(holder.consumeCalls).toBe(0);
  });
});
