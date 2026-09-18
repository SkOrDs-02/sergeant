// Metro config for Expo in a pnpm monorepo.
// - watchFolders points Metro at the workspace root so it can resolve
//   `@sergeant/shared` and `@sergeant/api-client` source files.
// - nodeModulesPaths + disableHierarchicalLookup make module resolution
//   deterministic with pnpm's nested `node_modules` layout.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ],
  disableHierarchicalLookup: true,
  unstable_enablePackageExports: true,
  sourceExts: [...(config.resolver.sourceExts ?? []), "mjs", "cjs"],
};

module.exports = withNativeWind(config, { input: "./global.css" });
