// @vitest-environment node
//
// Consumer contract: `POST /api/v1/push/register` — push-notification
// device registration. **fizruk persona** — fizruk relies on push
// (morning notifications, workout reminders) so its first run after
// onboarding hits this endpoint with a `platform: "ios" | "android" |
// "web"` discriminated-union body.
//
// Shape lives in `@sergeant/shared` (PushRegisterSchema). Drift here =
// fizruk's reminders silently stop working on one platform.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createPushEndpoints } from "../../endpoints/push";
import { createPact } from "./_pact";

describe("contract @ POST /api/v1/push/register", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("registers a web-push subscription (fizruk persona, web)", async () => {
    await pact
      .addInteraction()
      .given("authenticated session for user-pact-001 with no prior push token")
      .uponReceiving("a POST /api/v1/push/register request (platform=web)")
      .withRequest("POST", "/api/v1/push/register", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          platform: "web",
          token:
            "https://fcm.googleapis.com/fcm/send/cZ4VGTbVtps:APA91bF…example",
          keys: {
            p256dh: "BFx8e_X-3FAKE-PUBKEY-NOT-A-REAL-CRED-pact-test-vector-=",
            auth: "FAKE-AUTH-PACT-CONTRACT-TEST-VECTOR-=",
          },
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({ ok: true, platform: "web" });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const push = createPushEndpoints(http);
        const out = await push.register({
          platform: "web",
          token:
            "https://fcm.googleapis.com/fcm/send/cZ4VGTbVtps:APA91bF…example",
          keys: {
            p256dh: "BFx8e_X-3FAKE-PUBKEY-NOT-A-REAL-CRED-pact-test-vector-=",
            auth: "FAKE-AUTH-PACT-CONTRACT-TEST-VECTOR-=",
          },
        });
        expect(out.ok).toBe(true);
        expect(out.platform).toBe("web");
      });
  });
});
