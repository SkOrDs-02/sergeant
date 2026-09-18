import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell над `@sergeant/web`.
 *
 * `webDir` вказує на існуючий артефакт Vite-білду, який лежить у
 * `apps/server/dist` (див. `apps/web/vite.config.js` → `build.outDir`).
 * Це дозволяє переюзати готовий production-бандл без копіювання.
 *
 * `appId` свідомо відрізняється від RN-апки (`com.sergeant.app`, див.
 * `apps/mobile/app.config.ts`), щоб PoC-shell і канонічна RN-апка могли
 * жити на одному пристрої пліч-о-пліч без колізії.
 *
 * Призначення PoC:
 *   - довести, що поточний веб-код запускається у WebView «з коробки»;
 *   - дати вимір «скільки саме зусиль треба», не чіпаючи `apps/web`.
 * Production-рішення (native push, bearer-auth, barcode scanner) —
 * окремими PR-ами після того, як shell стартує.
 */
const config: CapacitorConfig = {
  appId: "com.sergeant.shell",
  appName: "Sergeant Shell",
  webDir: "../server/dist",
  server: {
    // Native WebView звертається до `apps/server` через HTTPS; ніяких
    // dev-only `server.url` / `cleartext: true` у production-config-у
    // тримати не можна — вони б ефективно робили cleartext-режим і
    // ламали б `android:usesCleartextTraffic="false"` у маніфесті.
    androidScheme: "https",
    // Явне `cleartext: false` — belt-and-braces поруч з
    // `androidScheme: "https"` і `android.allowMixedContent: false`
    // нижче. Default у Capacitor 7 і так `false`, але фіксуємо явно,
    // щоб випадкова зміна default-у у мажорному апгрейді Capacitor
    // не перемкнула shell у cleartext-режим.
    cleartext: false,
  },
  android: {
    // Паралельно до `android:usesCleartextTraffic="false"` та
    // `@xml/network_security_config` — захист від ситуації, коли
    // WebView завантажить https-сторінку, яка мікс-контент тягне http-
    // ресурс. Тримаємо явний `false`, хоча це і default у Capacitor 7.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // `launchAutoHide: false` віддає керування хайдом splash-а коду у
      // `initNativeShell()` (`SplashScreen.hide({ fadeOutDuration })`)
      // — інакше дефолтний auto-hide після 500 ms створює flash між
      // OS-splash і першим React-рендером. `launchShowDuration` — це
      // failsafe на випадок, якщо runtime-код ніколи не дійде до
      // `hide()` (bootstrap-помилка ще до маунту React).
      launchAutoHide: false,
      launchShowDuration: 3000,
      // Збігається з web `--c-bg` (light-тема, #fdf9f3). Покриває
      // області, де `splash.png` не розтягується до країв (wide /
      // short екрани), щоб не було білої смуги.
      backgroundColor: "#fdf9f3",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Не дозволяємо WebView-контенту рендеритись під status-bar-ом —
      // BottomNav / safe-area плиток web-сайду на iOS рахується без
      // offset-а під notch. Runtime-код у `initNativeShell()` дальше
      // перевизначає стиль/колір у залежності від dark/light-теми.
      overlaysWebView: false,
      style: "DEFAULT",
      backgroundColor: "#fdf9f3",
    },
  },
};

export default config;
