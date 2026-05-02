import {
  createHttpClient,
  type HttpClient,
  type HttpClientConfig,
} from "./httpClient";
import { createSyncEndpoints, type SyncEndpoints } from "./endpoints/sync";
import { createMeEndpoints, type MeEndpoints } from "./endpoints/me";
import { createCoachEndpoints, type CoachEndpoints } from "./endpoints/coach";
import { createChatEndpoints, type ChatEndpoints } from "./endpoints/chat";
import { createPushEndpoints, type PushEndpoints } from "./endpoints/push";
import {
  createNutritionEndpoints,
  type NutritionEndpoints,
} from "./endpoints/nutrition";
import {
  createBarcodeEndpoints,
  type BarcodeEndpoints,
} from "./endpoints/barcode";
import {
  createFoodSearchEndpoints,
  type FoodSearchEndpoints,
} from "./endpoints/foodSearch";
import {
  createMonoWebhookEndpoints,
  type MonoWebhookEndpoints,
} from "./endpoints/mono";
import {
  createPrivatEndpoints,
  type PrivatEndpoints,
} from "./endpoints/privat";
import {
  createWaitlistEndpoints,
  type WaitlistEndpoints,
} from "./endpoints/waitlist";
import {
  createWeeklyDigestEndpoints,
  type WeeklyDigestEndpoints,
} from "./endpoints/weeklyDigest";
import {
  createTranscribeEndpoints,
  type TranscribeEndpoints,
} from "./endpoints/transcribe";
import {
  createWebVitalsEndpoints,
  type WebVitalsEndpoints,
} from "./endpoints/webVitals";

export type ApiClientConfig = HttpClientConfig;

/**
 * Типізований API-клієнт для всіх публічних ендпоінтів Sergeant. Повертає
 * об'єкт з `http` (низькорівневі методи) та набором модульних ендпоінтів
 * (`sync`, `coach`, `chat`, `push`, `nutrition`, `barcode`, `foodSearch`,
 * `monoWebhook`, `privat`, `weeklyDigest`, `transcribe`, `webVitals`).
 *
 * Веб-додаток створює один інстанс на старті (див.
 * `apps/web/src/shared/api/client.ts`). RN-додаток зможе створити свій
 * інстанс з іншим `baseUrl` та `getToken`, що читає токен зі сховища.
 */
export interface ApiClient {
  http: HttpClient;
  me: MeEndpoints;
  sync: SyncEndpoints;
  coach: CoachEndpoints;
  chat: ChatEndpoints;
  push: PushEndpoints;
  nutrition: NutritionEndpoints;
  barcode: BarcodeEndpoints;
  foodSearch: FoodSearchEndpoints;
  monoWebhook: MonoWebhookEndpoints;
  privat: PrivatEndpoints;
  waitlist: WaitlistEndpoints;
  weeklyDigest: WeeklyDigestEndpoints;
  transcribe: TranscribeEndpoints;
  webVitals: WebVitalsEndpoints;
}

export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const http = createHttpClient(config);
  return {
    http,
    me: createMeEndpoints(http),
    sync: createSyncEndpoints(http),
    coach: createCoachEndpoints(http),
    chat: createChatEndpoints(http),
    push: createPushEndpoints(http),
    nutrition: createNutritionEndpoints(http),
    barcode: createBarcodeEndpoints(http),
    foodSearch: createFoodSearchEndpoints(http),
    monoWebhook: createMonoWebhookEndpoints(http),
    privat: createPrivatEndpoints(http),
    waitlist: createWaitlistEndpoints(http),
    weeklyDigest: createWeeklyDigestEndpoints(http),
    transcribe: createTranscribeEndpoints(http),
    webVitals: createWebVitalsEndpoints(http),
  };
}
