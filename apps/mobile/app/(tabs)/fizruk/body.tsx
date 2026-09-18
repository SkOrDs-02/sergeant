/**
 * `/fizruk/body` — Body dashboard.
 * Thin wrapper around `@/modules/fizruk/pages/Body`.
 */

import { router } from "expo-router";

import { Body } from "@/modules/fizruk/pages/Body";

export default function FizrukBodyRoute() {
  return (
    <Body onOpenMeasurements={() => router.push("/fizruk/measurements")} />
  );
}
