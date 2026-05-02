/**
 * Fizruk nested Stack navigator (Expo Router).
 *
 * Hosts the 9 Fizruk pages that were a single hash router on web:
 *
 *   - `index`        → Dashboard (root of the stack)
 *   - `workouts`     → Workouts list + active-session shell
 *   - `exercise`     → Exercise detail (will accept `?id=` in a follow-up)
 *   - `programs`     → Program catalogue
 *   - `progress`     → Charts + photo progress + backup
 *   - `measurements` → Body measurements input
 *   - `body`         → Body dashboard
 *   - `atlas`        → Full-screen body atlas
 *   - `plan`         → Monthly plan calendar
 *
 * All screens render header-less for now — the per-screen titles are
 * rendered inline (first heading of each screen). This keeps visual
 * parity with the web `ModuleShell`, where each page owned its title.
 * A later PR brings the shared `FizrukHeader` + settings drawer.
 */

import { Stack } from "expo-router";

export default function FizrukStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="index" options={{ animation: "fade" }} />
      <Stack.Screen name="workouts" />
      <Stack.Screen name="exercise" />
      <Stack.Screen name="programs" />
      <Stack.Screen name="progress" />
      <Stack.Screen name="measurements" />
      <Stack.Screen name="body" />
      <Stack.Screen name="atlas" />
      <Stack.Screen name="plan" />
      <Stack.Screen
        name="workout/new"
        options={{ headerShown: true, title: "Нове тренування" }}
      />
      <Stack.Screen
        name="workout/[id]"
        options={{ headerShown: true, title: "Тренування" }}
      />
    </Stack>
  );
}
