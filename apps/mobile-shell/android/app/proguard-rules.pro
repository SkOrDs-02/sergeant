# ProGuard / R8 rules for the Capacitor shell (`apps/mobile-shell`).
#
# These rules pair with `buildTypes.release { minifyEnabled true; shrinkResources true }`
# in `app/build.gradle`. Without them R8 strips Capacitor's plugin
# classes (they are discovered reflectively at runtime via
# `@CapacitorPlugin` annotations), which breaks the WebView <→> native
# bridge and throws `PluginNotImplemented` at first use.
#
# Upstream reference for the Capacitor keep-rules:
#   https://forum.ionicframework.com/t/how-to-use-proguard-with-capacitor/222915
#   https://capgo.app/blog/how-to-resolve-android-build-errors-in-capacitor/
#
# When adding a new `@capacitor/*` or `@capacitor-community/*` plugin to
# `apps/mobile-shell/package.json`, also add a matching `-keep class`
# entry below. `cap sync` only wires up the Gradle module — it does not
# emit ProGuard rules.

# ---------------------------------------------------------------------------
# Capacitor core + bridge (WebView <→> Java).
# ---------------------------------------------------------------------------
# The entire `com.getcapacitor` tree is reflective: `PluginManager` loads
# plugin classes by FQCN from `@CapacitorPlugin`-annotated class files,
# and `MessageHandler` / `PluginHandle` dispatch method calls via
# reflection on `@PluginMethod`-annotated members.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keepclassmembers class com.getcapacitor.** { *; }

# Capacitor annotations — read at runtime by `PluginManager`.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    <init>(...);
    @com.getcapacitor.annotation.CapacitorPlugin *;
}
-keepclassmembers @com.getcapacitor.annotation.CapacitorPlugin class ** {
    @com.getcapacitor.PluginMethod *;
}
-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature, Exceptions

# The Cordova shim Capacitor keeps around for legacy plugins.
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# JavaScript-facing interface injected into the WebView
# (`MessageHandler.postMessage`, etc). Method names MUST match the JS
# side literally, so we forbid renaming any `@JavascriptInterface` member.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------------------------------------------------------------------------
# Capacitor plugins declared in apps/mobile-shell/package.json.
# ---------------------------------------------------------------------------
# @capacitor/app
-keep class com.capacitorjs.plugins.app.** { *; }
# @capacitor/keyboard
-keep class com.capacitorjs.plugins.keyboard.** { *; }
# @capacitor/preferences
-keep class com.capacitorjs.plugins.preferences.** { *; }
# @capacitor/push-notifications
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
# @capacitor/splash-screen
-keep class com.capacitorjs.plugins.splashscreen.** { *; }
# @capacitor/status-bar
-keep class com.capacitorjs.plugins.statusbar.** { *; }
# @capacitor-mlkit/barcode-scanning
-keep class io.capawesome.capacitorjs.plugins.mlkit.barcodescanning.** { *; }

# ---------------------------------------------------------------------------
# Transitive dependencies brought in by the plugins.
# ---------------------------------------------------------------------------
# Firebase / Google Play Services (used by push-notifications + mlkit).
-keep class com.google.firebase.** { *; }
-keep interface com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-keep interface com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ML Kit barcode scanning ships an optional module that R8 tries to
# resolve even when the app doesn't use the bundled variant.
-keep class com.google.mlkit.** { *; }
-keep interface com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# androidx — Capacitor bridge uses a few reflective androidx APIs (core
# splashscreen, appcompat). R8 is generally fine with these, but keep
# `@Keep` annotations honored defensively.
-keep class androidx.core.splashscreen.** { *; }
-dontwarn androidx.**

# ---------------------------------------------------------------------------
# Generic niceties.
# ---------------------------------------------------------------------------
# Keep any class annotated with @Keep (AndroidX) — covers plugins that
# declare explicit keep markers on their own API surface.
-keep @androidx.annotation.Keep class * { *; }
-keepclassmembers class * {
    @androidx.annotation.Keep <fields>;
    @androidx.annotation.Keep <methods>;
}

# Preserve enums' reflection-friendly methods (Gson/Jackson/Moshi-free
# code in Capacitor still uses `valueOf` / `values` for plugin configs).
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Native method names (JNI) must not be obfuscated.
-keepclasseswithmembernames class * {
    native <methods>;
}

# Stack traces in release-AAB — keep source filenames + line numbers so
# Play Console + Sentry can symbolicate crashes.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
