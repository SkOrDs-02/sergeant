/**
 * Збирач jsonLd для SSG-проходу (entry-server → prerender.mjs).
 *
 * Ефекти в renderToString не виконуються, тож сторінка не може покласти
 * <script type="application/ld+json"> у DOM сама – замість цього usePageMeta
 * під час серверного рендера віддає дані сюди, а entry-server забирає їх
 * після renderToString. Той самий патерн, що збір стилів у styled-components.
 * У браузері ці функції не викликаються ніколи.
 */
let collected: object | null = null;

export function reportSsgJsonLd(jsonLd: object | undefined): void {
  collected = jsonLd ?? null;
}

export function takeSsgJsonLd(): object | null {
  const out = collected;
  collected = null;
  return out;
}
