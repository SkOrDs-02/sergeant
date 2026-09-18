// Workspace-package-only flat-config blocks.
export const packageBlocks = [
  // Storage-rule fixtures intentionally contain raw legacy key literals.
  {
    files: ["packages/eslint-plugin-sergeant-design/**/*.{js,mjs}"],
    rules: {
      "sergeant-design/no-raw-storage-key": "off",
    },
  },
];
