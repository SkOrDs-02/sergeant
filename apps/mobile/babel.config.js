module.exports = function (api) {
  // Using `api.env()` instead of `api.cache(true)` so test / development /
  // production bundles each get their own cached config. Required because
  // we strip NativeWind + Reanimated Babel transforms under Jest (see below).
  const env = api.env();
  api.cache.using(() => env);

  const isTest = env === "test";

  return {
    presets: [
      // NativeWind's `jsxImportSource` rewires JSX to go through
      // `react-native-css-interop`, which in turn pulls in the Reanimated
      // worklets plugin. That plugin isn't installed (and we don't need
      // NativeWind runtime resolution under Jest — tests just inspect the
      // `className` prop that reaches the RN primitive). In `test` env
      // we therefore fall back to the plain expo preset.
      isTest
        ? "babel-preset-expo"
        : ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      // `nativewind/babel` re-exports `react-native-css-interop/babel`,
      // which also requires `react-native-worklets/plugin`. Drop it under
      // Jest for the same reason.
      ...(isTest ? [] : ["nativewind/babel"]),
    ],
    // Reanimated's Babel plugin rewrites worklet functions; the runtime
    // library isn't exercised under Jest so we skip the plugin there and
    // avoid the worklets-plugin dependency entirely.
    plugins: isTest ? [] : ["react-native-reanimated/plugin"],
  };
};
