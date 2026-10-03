/**
 * Pure tests for the `shortcuts.xml` builder.
 *
 * We verify only the string output — the actual plugin body
 * (`withAndroidManifest` / `withStringsXml` / `withDangerousMod`) is
 * exercised by `expo prebuild` at native-build time and doesn't lend
 * itself to meaningful unit testing without a full Expo config fixture.
 * The builder itself is pure, so we pin its output shape here so that
 * future tweaks to the XML surface are intentional.
 */
import {
  buildShortcutsXml,
  shortcutStringKeys,
  type AndroidShortcutItem,
} from "./withAndroidShortcuts";

function makeShortcut(
  overrides: Partial<AndroidShortcutItem> = {},
): AndroidShortcutItem {
  return {
    id: "add_expense",
    shortLabel: "Додати",
    longLabel: "Додати витрату",
    intent: {
      action: "android.intent.action.VIEW",
      data: "sergeant://finance/tx/new",
      targetPackage: "com.sergeant.app",
    },
    ...overrides,
  };
}

describe("shortcutStringKeys", () => {
  it("prefixes the string-resource ids with the shortcut id", () => {
    expect(shortcutStringKeys(makeShortcut({ id: "open_today" }))).toEqual({
      shortLabelKey: "shortcut_open_today_short",
      longLabelKey: "shortcut_open_today_long",
    });
  });
});

describe("buildShortcutsXml", () => {
  it("emits a single <shortcut> block pointing at the deep link", () => {
    const xml = buildShortcutsXml([makeShortcut()]);

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain(
      '<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">',
    );
    expect(xml).toContain('android:shortcutId="add_expense"');
    expect(xml).toContain(
      'android:shortcutShortLabel="@string/shortcut_add_expense_short"',
    );
    expect(xml).toContain(
      'android:shortcutLongLabel="@string/shortcut_add_expense_long"',
    );
    expect(xml).toContain('android:data="sergeant://finance/tx/new"');
    expect(xml).toContain('android:targetPackage="com.sergeant.app"');
    expect(xml).toContain('android:action="android.intent.action.VIEW"');
  });

  it("defaults the icon to the launcher mipmap", () => {
    const xml = buildShortcutsXml([makeShortcut()]);
    expect(xml).toContain('android:icon="@mipmap/ic_launcher"');
  });

  it("honours a custom icon resource", () => {
    const xml = buildShortcutsXml([
      makeShortcut({ iconResource: "@drawable/ic_shortcut_add" }),
    ]);
    expect(xml).toContain('android:icon="@drawable/ic_shortcut_add"');
    expect(xml).not.toContain('android:icon="@mipmap/ic_launcher"');
  });

  it("embeds the optional targetClass when provided", () => {
    const xml = buildShortcutsXml([
      makeShortcut({
        intent: {
          action: "android.intent.action.VIEW",
          data: "sergeant://routine",
          targetPackage: "com.sergeant.app",
          targetClass: "com.sergeant.app.MainActivity",
        },
      }),
    ]);
    expect(xml).toContain(
      'android:targetClass="com.sergeant.app.MainActivity"',
    );
  });

  it("omits targetClass when not provided", () => {
    const xml = buildShortcutsXml([makeShortcut()]);
    expect(xml).not.toContain("android:targetClass");
  });

  it("emits multiple <shortcut> blocks preserving order", () => {
    const xml = buildShortcutsXml([
      makeShortcut({ id: "add_expense" }),
      makeShortcut({
        id: "open_today",
        shortLabel: "Сьогодні",
        longLabel: "Рутина: сьогодні",
        intent: {
          action: "android.intent.action.VIEW",
          data: "sergeant://routine",
          targetPackage: "com.sergeant.app",
        },
      }),
      makeShortcut({
        id: "start_workout",
        shortLabel: "Тренування",
        longLabel: "Почати тренування",
        intent: {
          action: "android.intent.action.VIEW",
          data: "sergeant://workout/new",
          targetPackage: "com.sergeant.app",
        },
      }),
    ]);

    const matches = xml.match(/<shortcut\s/g) ?? [];
    expect(matches).toHaveLength(3);

    const addIdx = xml.indexOf('android:shortcutId="add_expense"');
    const todayIdx = xml.indexOf('android:shortcutId="open_today"');
    const workoutIdx = xml.indexOf('android:shortcutId="start_workout"');
    expect(addIdx).toBeGreaterThan(0);
    expect(todayIdx).toBeGreaterThan(addIdx);
    expect(workoutIdx).toBeGreaterThan(todayIdx);
  });

  it("escapes special characters in attribute values", () => {
    const xml = buildShortcutsXml([
      makeShortcut({
        id: "quirky",
        intent: {
          action: "android.intent.action.VIEW",
          // Contrived but exercises the ampersand escape path.
          data: 'sergeant://finance?tag="ops"&amp=1',
          targetPackage: "com.sergeant.app",
        },
      }),
    ]);

    expect(xml).toContain(
      'android:data="sergeant://finance?tag=&quot;ops&quot;&amp;amp=1"',
    );
    expect(xml).not.toContain('data="sergeant://finance?tag="ops"&amp=1"');
  });
});
