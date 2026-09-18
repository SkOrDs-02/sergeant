/**
 * Inline config plugin: Android static app shortcuts.
 *
 * Android app shortcuts are declared via an XML resource
 * (`res/xml/shortcuts.xml`) referenced from the launcher `<activity>`
 * through a `<meta-data android:name="android.app.shortcuts" />` entry.
 * All user-visible strings must be string resources (raw-string
 * attributes are ignored by the launcher for localisation reasons),
 * so we also merge entries into `res/values/strings.xml`.
 *
 * Why a local plugin and not `expo-quick-actions`?
 *   - The migration plan (`docs/engineering/mobile/react-native-migration.md` Phase 10)
 *     explicitly forbids adding new runtime deps for this step.
 *   - Static shortcuts don't need a runtime module — they are purely
 *     manifest-level: tapping one fires the app's existing deep-link
 *     intent filter (`sergeant://…`) which `useDeepLinks` already
 *     consumes (see `src/lib/useDeepLinks.ts`).
 *
 * iOS quick actions are wired separately in `app.config.ts` via
 * `ios.infoPlist.UIApplicationShortcutItems` — Expo merges that key
 * straight into the generated Info.plist, no plugin needed.
 *
 * The builders `buildShortcutsXml` / `shortcutStringKeys` are pure and
 * exported for unit testing.
 */
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

/**
 * `@expo/config-plugins` types the activity node without `meta-data`
 * even though xml2js keeps arbitrary child elements. We widen the
 * type locally so TypeScript lets us append the shortcuts resource
 * reference without resorting to `any`.
 */
type ManifestMetaDataEntry = {
  $: Record<string, string>;
};
type ActivityWithMetaData = {
  $: Record<string, string | undefined>;
  "meta-data"?: ManifestMetaDataEntry[];
};

export type AndroidShortcutIntent = {
  /** Fully-qualified intent action, e.g. "android.intent.action.VIEW". */
  action: string;
  /** Deep-link URI to dispatch, e.g. "sergeant://routine". */
  data: string;
  /** App package that should receive the intent, e.g. "com.sergeant.app". */
  targetPackage: string;
  /** Optional activity class name. Defaults to MainActivity. */
  targetClass?: string;
};

export type AndroidShortcutItem = {
  /** Stable shortcut id. Must be unique within the shortcut set. */
  id: string;
  /** Localised short label (<= 10 chars recommended by AOSP). */
  shortLabel: string;
  /** Localised long label (<= 25 chars recommended). */
  longLabel: string;
  /**
   * Drawable resource reference. Defaults to the launcher icon.
   * Kept as `@mipmap/ic_launcher` for PR-B so no new art asset is
   * required; a follow-up PR can swap in per-action monochrome icons.
   */
  iconResource?: string;
  /** Intent dispatched when the shortcut is tapped. */
  intent: AndroidShortcutIntent;
};

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function shortcutStringKeys(shortcut: AndroidShortcutItem): {
  shortLabelKey: string;
  longLabelKey: string;
} {
  return {
    shortLabelKey: `shortcut_${shortcut.id}_short`,
    longLabelKey: `shortcut_${shortcut.id}_long`,
  };
}

export function buildShortcutsXml(items: AndroidShortcutItem[]): string {
  const entries = items
    .map((item) => {
      const { shortLabelKey, longLabelKey } = shortcutStringKeys(item);
      const icon = item.iconResource ?? "@mipmap/ic_launcher";
      const targetClassAttr = item.intent.targetClass
        ? `\n      android:targetClass="${escapeXmlAttr(item.intent.targetClass)}"`
        : "";
      return `  <shortcut
    android:shortcutId="${escapeXmlAttr(item.id)}"
    android:enabled="true"
    android:icon="${escapeXmlAttr(icon)}"
    android:shortcutShortLabel="@string/${shortLabelKey}"
    android:shortcutLongLabel="@string/${longLabelKey}">
    <intent
      android:action="${escapeXmlAttr(item.intent.action)}"
      android:targetPackage="${escapeXmlAttr(item.intent.targetPackage)}"${targetClassAttr}
      android:data="${escapeXmlAttr(item.intent.data)}" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${entries}
</shortcuts>
`;
}

export const withAndroidShortcuts: ConfigPlugin<AndroidShortcutItem[]> = (
  config,
  shortcuts,
) => {
  // 1. Merge localisable labels into res/values/strings.xml.
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      shortcuts.flatMap((shortcut) => {
        const { shortLabelKey, longLabelKey } = shortcutStringKeys(shortcut);
        return [
          {
            $: { name: shortLabelKey, translatable: "false" },
            _: shortcut.shortLabel,
          },
          {
            $: { name: longLabelKey, translatable: "false" },
            _: shortcut.longLabel,
          },
        ];
      }),
      cfg.modResults,
    );
    return cfg;
  });

  // 2. Reference the shortcuts xml resource from MainActivity.
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    const rawActivity = app.activity?.find((a) =>
      a.$["android:name"]?.endsWith(".MainActivity"),
    );
    if (!rawActivity) return cfg;

    const mainActivity = rawActivity as unknown as ActivityWithMetaData;
    const existing: ManifestMetaDataEntry[] = mainActivity["meta-data"] ?? [];
    // Deduplicate previous runs of the plugin.
    const filtered = existing.filter(
      (entry) => entry.$["android:name"] !== "android.app.shortcuts",
    );
    filtered.push({
      $: {
        "android:name": "android.app.shortcuts",
        "android:resource": "@xml/shortcuts",
      },
    });
    mainActivity["meta-data"] = filtered;
    return cfg;
  });

  // 3. Write res/xml/shortcuts.xml. We use `withDangerousMod` because
  //    there is no dedicated helper for arbitrary xml resources and
  //    the file lives outside AndroidManifest / strings.xml.
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "shortcuts.xml"),
        buildShortcutsXml(shortcuts),
        "utf8",
      );
      return cfg;
    },
  ]);

  return config;
};

export default withAndroidShortcuts;
