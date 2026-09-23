/**
 * Єдине джерело слуга GitHub-репо (`owner/repo`).
 *
 * @status Active
 *
 * Навіщо окремий модуль. Слуг був зашитий у трьох незалежних місцях
 * (`scripts/ci/update-pr-backlinks.mjs`, `scripts/docs/generate-status.mjs`
 * і поле `repo` кожного запису pr-леджера), і жодне з них не звірялося з
 * `git remote`. Репо переїхало чотири рази (Skords-01 → SkOrDs-02 →
 * zaebal-beep → klas149), і кожен переїзд тихо ламав усі self-посилання:
 * 2026-09-19 це коштувало 93 мертвих лінки і червоний `--strict-external`
 * на КОЖНОМУ PR незалежно від змісту. Розбір — спека
 * `docs/work/specs/docs-code-drift-2026-09-19.md`.
 *
 * Джерело істини — `git remote`, а не мережа. Анонімний HEAD дає 404 на всі
 * чотири домівки (старі акаунти сторінок не віддають, поточна приватна),
 * тож мережева перевірка self-посилань не працює в принципі. Звірка з
 * remote натомість працює офлайн і ловить дрейф на коміті.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..");
export const IDENTITY_PATH = join(
  REPO_ROOT,
  "docs/governance/governance/repo-identity.json",
);

/**
 * Витягує `owner/repo` з будь-якої форми GitHub- або Bitbucket-URL (ssh,
 * https, з `.git` і без). Bitbucket додано 2026-09-23: `origin` переїхав
 * туди, а до цього парсер бачив лише `github.com` і мовчки повертав
 * `undefined` на живому `bitbucket.org`-remote - гейт `check-repo-slug`
 * тому не ловив сам переїзд (DG-10).
 */
export function slugFromRemoteUrl(url) {
  if (typeof url !== "string") return undefined;
  const m =
    /(?:github\.com|bitbucket\.org)[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/u.exec(
      url.trim(),
    );
  return m ? m[1] : undefined;
}

/**
 * Слуг поточного репо: у GitHub Actions — `GITHUB_REPOSITORY`, локально — з
 * `origin`. `undefined`, якщо немає ні того, ні того (checkout без remote,
 * пісочниця) — тоді викликач падає на `current` з реєстру.
 */
export function slugFromEnvironment(env = process.env) {
  const fromEnv = env["GITHUB_REPOSITORY"];
  if (typeof fromEnv === "string" && fromEnv.includes("/")) return fromEnv;
  try {
    return slugFromRemoteUrl(
      execFileSync("git", ["remote", "get-url", "origin"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return undefined;
  }
}

/** Читає реєстр домівок. Кидає з внятним текстом, якщо файл зламаний. */
export function readIdentity(path = IDENTITY_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw.current !== "string" || !raw.current.includes("/")) {
    throw new Error(`${path}: поле "current" мусить бути "owner/repo".`);
  }
  if (!Array.isArray(raw.previous)) {
    throw new Error(`${path}: поле "previous" мусить бути масивом.`);
  }
  if (typeof raw.legacyPrSlug !== "string" || !raw.legacyPrSlug.includes("/")) {
    throw new Error(`${path}: поле "legacyPrSlug" мусить бути "owner/repo".`);
  }
  return raw;
}

/**
 * Канонічний слуг для НОВИХ посилань: із середовища, якщо є; інакше —
 * `current` із реєстру.
 */
export function currentSlug({ env = process.env, path = IDENTITY_PATH } = {}) {
  return slugFromEnvironment(env) ?? readIdentity(path).current;
}

/**
 * Усі відомі домівки (поточна + історичні + жива з середовища), у нижньому
 * регістрі. Порівняння регістронезалежне навмисно: GitHub не розрізняє
 * регістр власника, а доки пишуть і `SkOrDs-02/sergeant`, і
 * `SkOrDs-02/Sergeant` — це та сама сторінка, не дрейф.
 */
export function knownSlugs({ env = process.env, path = IDENTITY_PATH } = {}) {
  const identity = readIdentity(path);
  const all = [identity.current, ...identity.previous, identity.legacyPrSlug];
  const live = slugFromEnvironment(env);
  if (live) all.push(live);
  return new Set(all.map((s) => s.toLowerCase()));
}

/** База PR-посилань для запису леджера: явне поле `repo` → воно, інакше легасі. */
export function prBaseForEntry(entry, { path = IDENTITY_PATH } = {}) {
  return `https://github.com/${slugForEntry(entry, { path })}/pull`;
}

/** Слуг для запису леджера: явне поле `repo` → воно, інакше легасі-фолбек. */
export function slugForEntry(entry, { path = IDENTITY_PATH } = {}) {
  return typeof entry?.repo === "string" && entry.repo.includes("/")
    ? entry.repo
    : readIdentity(path).legacyPrSlug;
}
