// Типи для site-url.mjs: файл лишається .mjs, бо його імпортують і Node-скрипти
// білда (postbuild-seo, prerender), і vite.config.ts.
export declare function resolveSiteUrl(
  env?: Record<string, string | undefined>,
): string;
