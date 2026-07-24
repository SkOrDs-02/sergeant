/**
 * Smoke-перевірка `app.config.ts` перед EAS build.
 *
 * Читає динамічний конфіг, друкує основні поля та падає якщо:
 *   - bundleIdentifier / package не виставлені;
 *   - у `plugins` відсутній `expo-notifications` (push не запрацює);
 *   - `ios.infoPlist.UIBackgroundModes` не містить `remote-notification`.
 *
 * Запуск: `pnpm --filter @sergeant/mobile check-build-config`.
 */
import type { ExpoConfig } from "expo/config";

import appConfig from "../app.config";

function pluginName(
  plugin: NonNullable<ExpoConfig["plugins"]>[number],
): string {
  if (typeof plugin === "string") return plugin;
  if (Array.isArray(plugin) && typeof plugin[0] === "string") return plugin[0];
  return "";
}

function main(): void {
  const config = typeof appConfig === "function" ? appConfig() : appConfig;
  const bundleId = config.ios?.bundleIdentifier ?? "";
  const androidPackage = config.android?.package ?? "";
  const plugins = (config.plugins ?? []).map(pluginName).filter(Boolean);
  const backgroundModes = config.ios?.infoPlist?.UIBackgroundModes as
    | string[]
    | undefined;

  console.log(`name=${config.name}`);
  console.log(`slug=${config.slug}`);
  console.log(`bundleId=${bundleId}`);
  console.log(`androidPackage=${androidPackage}`);
  console.log(`plugins=${JSON.stringify(plugins)}`);
  console.log(`iosBackgroundModes=${JSON.stringify(backgroundModes ?? [])}`);

  const errors: string[] = [];
  if (!bundleId) {
    errors.push("ios.bundleIdentifier is missing");
  }
  if (!androidPackage) {
    errors.push("android.package is missing");
  }
  if (!plugins.includes("expo-notifications")) {
    errors.push("plugins must include 'expo-notifications' for push to work");
  }
  if (!backgroundModes?.includes("remote-notification")) {
    errors.push(
      "ios.infoPlist.UIBackgroundModes must include 'remote-notification'",
    );
  }

  if (errors.length > 0) {
    console.error("\ncheck-build-config FAILED:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log("\ncheck-build-config OK");
}

main();
