import base from "./playwright.smoke.config";
const cfg: typeof base = {
  ...base,
  projects: (base.projects ?? []).map((p) => ({
    ...p,
    use: {
      ...p.use,
      launchOptions: {
        executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
      },
    },
  })),
};
export default cfg;
