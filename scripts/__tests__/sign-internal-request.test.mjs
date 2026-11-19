// scripts/__tests__/sign-internal-request.test.mjs
//
// Підпис CLI-скриптів має збігатися з серверним верифікатором байт у байт.
//
// Run with:  node --test scripts/__tests__/sign-internal-request.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { internalSignatureHeaders } from "../lib/sign-internal-request.mjs";

test("без секрета заголовків підпису немає", () => {
  assert.deepEqual(internalSignatureHeaders('{"a":1}', undefined), {});
  assert.deepEqual(internalSignatureHeaders('{"a":1}', ""), {});
});

test("підпис = hex(HMAC-SHA256(secret, '<ts>.<body>')), ts у секундах", () => {
  const body = '{"eventId":"evt_1"}';
  const headers = internalSignatureHeaders(
    body,
    "s3cret",
    () => 1_700_000_000_999,
  );
  assert.equal(headers["x-timestamp"], "1700000000");
  const expected = crypto
    .createHmac("sha256", "s3cret")
    .update(`1700000000.${body}`)
    .digest("hex");
  assert.equal(headers["x-signature"], expected);
});
