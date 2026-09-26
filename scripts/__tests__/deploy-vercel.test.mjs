/** @status Active */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { botAuthorProblem, checkDeployOutput } from "../deploy-vercel.mjs";

// Скорочений реальний вивід `vercel deploy --prebuilt --prod` (54.9.1),
// успішний прогін 2026-09-26.
const OK = `▲ Production  https://sergeant-2d0cvv9dy-skords-01s-projects.vercel.app
▲ Aliased     https://app.sergeant.com.ua
{
  "deployment": {
    "url": "https://sergeant-2d0cvv9dy-skords-01s-projects.vercel.app",
    "readyState": "READY",
    "target": "production"
  }
}`;

describe("checkDeployOutput", () => {
  it("успішний production-деплой проходить", () => {
    assert.deepEqual(checkDeployOutput(OK), {
      ok: true,
      url: "https://sergeant-2d0cvv9dy-skords-01s-projects.vercel.app",
    });
  });

  it("збій мережі: CLI вийшов із 0, але деплою не було", () => {
    const r = checkDeployOutput("Vercel CLI 54.9.1\nRetrieving project…\n");
    assert.equal(r.ok, false);
    assert.match(r.reason, /URL/);
  });

  it("деплой не дійшов до READY", () => {
    const r = checkDeployOutput(OK.replace('"READY"', '"ERROR"'));
    assert.equal(r.ok, false);
    assert.match(r.reason, /READY/);
  });

  it("деплой не в production", () => {
    const r = checkDeployOutput(OK.replace('"production"', '"preview"'));
    assert.equal(r.ok, false);
    assert.match(r.reason, /production/);
  });
});

describe("botAuthorProblem", () => {
  it("бот Bitbucket, автор merge-комітів, не пройде", () => {
    const r = botAuthorProblem(
      "xqumb7c8r9ctnvfrt87m0jij79hi1z@bots.bitbucket.org\n",
    );
    assert.match(r, /бот Bitbucket/);
  });

  it("звичайний автор проходить", () => {
    assert.equal(botAuthorProblem("someone@example.com"), null);
  });
});
