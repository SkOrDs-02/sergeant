#!/usr/bin/env node
// apps/mobile-shell/scripts/check-info-plist.mjs
//
// Hardening guard for iOS App Transport Security (closes L12 —
// `docs/security/hardening/L12-ios-app-transport-security.md`).
//
// Why this guard exists
// ─────────────────────
// `apps/mobile-shell/capacitor.config.ts` sets `cleartext: false` and
// `androidScheme: "https"`. On Android that maps to
// `android:usesCleartextTraffic="false"` in the generated manifest. On
// iOS the equivalent knob is `NSAppTransportSecurity` (ATS) in
// `Info.plist`. If `NSAllowsArbitraryLoads=true` lands in the plist,
// ATS is *disabled* globally and the Capacitor `cleartext: false`
// guarantee is silently bypassed for the entire WebView traffic
// surface — including http:// loads from third-party scripts.
//
// The shell currently regenerates the iOS project on every CI run via
// `cap add ios` (see `apps/mobile-shell/.gitignore` and
// `.github/workflows/mobile-shell-ios{,-release}.yml`). There is no
// committed Info.plist to review, so the regression must be caught at
// build time — after `cap sync ios` writes the file, before
// `xcodebuild archive` consumes it.
//
// Why this is `.mjs` and not `.sh`
// ────────────────────────────────
// The L12 spec named the script `check-info-plist.sh` — the bash form
// gives the macOS-only `PlistBuddy` reader for free. Implementing it as
// a Node script instead has two concrete wins:
//   1. The workflow already calls `setup-node` before any iOS step
//      (`mobile-shell-ios.yml` line ~70), so there is no new runtime
//      dependency on the runner.
//   2. The same script runs unmodified on Linux dev boxes (and the
//      `pnpm test` Vitest gate further down), so contributors can lint
//      it without an Xcode toolchain. The hand-rolled XML-plist
//      parser is intentionally narrow (the four ATS keys we care
//      about) and matches the subset Capacitor's template can emit.
//
// CLI
// ───
//   node apps/mobile-shell/scripts/check-info-plist.mjs            # default path
//   node apps/mobile-shell/scripts/check-info-plist.mjs <plist>    # explicit
//
// Exit codes:
//   0 — plist absent OR plist clean OR explicit `--missing-ok` and missing.
//   1 — ATS audit failure (one of the four blacklisted keys = true).
//   2 — plist file missing (unless `--missing-ok` is passed).

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_PLIST = path.join(
  REPO_ROOT,
  "apps/mobile-shell/ios/App/App/Info.plist",
);

// Keys that, when `true`, weaken or disable ATS globally. Order matches
// Apple's documented precedence — see
// https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity
export const ATS_FAIL_KEYS = [
  "NSAllowsArbitraryLoads",
  "NSAllowsArbitraryLoadsForMedia",
  "NSAllowsArbitraryLoadsInWebContent",
  "NSAllowsLocalNetworking",
];

/**
 * Slice the substring of `xml` between the `<dict>` that immediately
 * follows the given `startIndex` and the matching `</dict>` that closes
 * it at the same nesting depth. Returns `null` if no balanced pair is
 * found. Counts only `<dict>`/`</dict>` (not arrays) because the only
 * thing we care about is the body of `NSAppTransportSecurity`'s dict.
 */
function sliceBalancedDictBody(xml, startIndex) {
  const openRe = /<dict\s*>/g;
  const closeRe = /<\/dict\s*>/g;
  openRe.lastIndex = startIndex;
  const firstOpen = openRe.exec(xml);
  if (!firstOpen) return null;

  let depth = 1;
  let cursor = openRe.lastIndex;
  const bodyStart = cursor;

  while (depth > 0) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(xml);
    const nextClose = closeRe.exec(xml);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = openRe.lastIndex;
    } else {
      depth -= 1;
      if (depth === 0) {
        return xml.slice(bodyStart, nextClose.index);
      }
      cursor = closeRe.lastIndex;
    }
  }

  return null;
}

/**
 * Parse the body of the `NSAppTransportSecurity` dict and return an
 * object whose own enumerable keys are the *direct* child keys of that
 * dict, valued by:
 *   - `true` / `false` for `<true/>` / `<false/>` (or open/close form)
 *   - `"<dict>"` / `"<array>"` for nested complex children (e.g.
 *     `NSExceptionDomains`) — these are surfaced so the caller can log
 *     them but never on their own a failure
 *   - `"<non-boolean>"` for unexpected leaf shapes
 *
 * Returns `null` when the ATS dict is absent (which is the secure
 * default state — iOS applies its own ATS defaults).
 *
 * Exported so the parser can be unit-tested without a real plist file.
 */
export function parseAtsDict(xml) {
  // Strip XML comments so a commented-out `<key>NSAllowsArbitraryLoads</key>`
  // doesn't cause a false positive.
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, "");

  const keyRe = /<key>\s*NSAppTransportSecurity\s*<\/key>/;
  const keyMatch = stripped.match(keyRe);
  if (!keyMatch) return null;

  const body = sliceBalancedDictBody(
    stripped,
    keyMatch.index + keyMatch[0].length,
  );
  if (body === null) return null;

  const result = {};

  // Walk only the *direct* children of the ATS dict by skipping any
  // nested dict/array bodies (so an inner `<true/>` deep inside
  // NSExceptionDomains never leaks out as if it were a top-level ATS
  // flag).
  let i = 0;
  while (i < body.length) {
    const keyMatch = /<key>\s*([A-Za-z0-9_]+)\s*<\/key>/g.exec(body.slice(i));
    if (!keyMatch) break;
    const keyName = keyMatch[1];
    let cursor = i + keyMatch.index + keyMatch[0].length;

    // Find the next non-whitespace tag.
    const tagMatch = /\s*<(\/?)([A-Za-z0-9_]+)\b([^>]*)>/.exec(
      body.slice(cursor),
    );
    if (!tagMatch) {
      break;
    }
    const closingSlash = tagMatch[1];
    const tagName = tagMatch[2];
    const tagAttrs = tagMatch[3];
    if (closingSlash) {
      // Malformed — closing tag where an opener was expected.
      result[keyName] = "<non-boolean>";
      cursor = cursor + tagMatch.index + tagMatch[0].length;
      i = cursor;
      continue;
    }

    const selfClosing = /\/\s*$/.test(tagAttrs);
    const tagEnd = cursor + tagMatch.index + tagMatch[0].length;

    if (selfClosing) {
      if (tagName === "true" || tagName === "false") {
        result[keyName] = tagName === "true";
      } else {
        result[keyName] = `<${tagName}>`;
      }
      i = tagEnd;
      continue;
    }

    if (tagName === "dict" || tagName === "array") {
      // Skip the nested body via the same balanced-slice helper so
      // grand-children don't leak as direct ATS keys.
      const nestedBody = sliceBalancedDictBody(body, cursor + tagMatch.index);
      result[keyName] = `<${tagName}>`;
      if (nestedBody === null) {
        // Couldn't find a matching close; bail out for safety.
        break;
      }
      const closeRe = new RegExp(`</${tagName}\\s*>`, "g");
      closeRe.lastIndex = tagEnd + nestedBody.length;
      const closeMatch = closeRe.exec(body);
      if (!closeMatch) break;
      i = closeMatch.index + closeMatch[0].length;
      continue;
    }

    // Inline open/close form: <true>...</true>, <false>...</false>,
    // <string>...</string>, etc.
    const inlineCloseRe = new RegExp(`</${tagName}\\s*>`);
    const inlineClose = inlineCloseRe.exec(body.slice(tagEnd));
    if (!inlineClose) break;
    if (tagName === "true" || tagName === "false") {
      result[keyName] = tagName === "true";
    } else {
      result[keyName] = "<non-boolean>";
    }
    i = tagEnd + inlineClose.index + inlineClose[0].length;
  }

  return result;
}

/**
 * Run the audit against the given plist file. Returns an object with
 * `status` (`"ok" | "fail" | "missing"`) and a `findings` array
 * suitable for printing.
 */
export function auditPlist(plistPath) {
  if (!existsSync(plistPath)) {
    return { status: "missing", findings: [] };
  }
  const xml = readFileSync(plistPath, "utf8");
  const ats = parseAtsDict(xml);

  if (ats === null) {
    return {
      status: "ok",
      findings: [
        {
          level: "ok",
          message:
            "NSAppTransportSecurity dict absent — iOS default ATS applies (secure).",
        },
      ],
    };
  }

  const findings = [];
  let fail = false;

  for (const key of ATS_FAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(ats, key)) {
      const value = ats[key];
      if (value === true) {
        findings.push({
          level: "fail",
          message: `NSAppTransportSecurity.${key}=true (in ${plistPath})`,
        });
        fail = true;
      } else if (value === false) {
        findings.push({
          level: "ok",
          message: `NSAppTransportSecurity.${key}=false`,
        });
      } else {
        // Non-boolean values are not the documented shape; flag as fail
        // so a malformed plist doesn't silently slip past.
        findings.push({
          level: "fail",
          message: `NSAppTransportSecurity.${key} has non-boolean value (${String(value)}) — expected <true/> or <false/>`,
        });
        fail = true;
      }
    } else {
      findings.push({
        level: "ok",
        message: `NSAppTransportSecurity.${key} not set (iOS default applies)`,
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(ats, "NSExceptionDomains")) {
    findings.push({
      level: "info",
      message:
        "NSExceptionDomains present — per-domain ATS exceptions are allowed by policy.",
    });
  }

  return { status: fail ? "fail" : "ok", findings };
}

function main() {
  const args = process.argv.slice(2);
  const missingOk = args.includes("--missing-ok");
  const plistPath = path.resolve(
    args.find((a) => !a.startsWith("--")) ?? DEFAULT_PLIST,
  );

  const { status, findings } = auditPlist(plistPath);

  for (const f of findings) {
    const prefix = `[check-info-plist] ${f.level === "fail" ? "FAIL" : f.level === "info" ? "info" : "OK  "} —`;
    const stream = f.level === "fail" ? process.stderr : process.stdout;
    stream.write(`${prefix} ${f.message}\n`);
  }

  if (status === "missing") {
    if (missingOk) {
      console.log(
        `[check-info-plist] info — ${plistPath} not present; --missing-ok set, treating as pass.`,
      );
      return 0;
    }
    process.stderr.write(
      [
        `[check-info-plist] FAIL — Info.plist not found at "${plistPath}"`,
        "  Expected the Capacitor-generated plist. Did `cap add ios` /",
        "  `cap sync ios` run before this step?",
      ].join("\n") + "\n",
    );
    return 2;
  }

  if (status === "fail") {
    process.stderr.write(
      [
        "",
        "[check-info-plist] iOS App Transport Security audit FAILED.",
        "  The Capacitor shell mandates ATS-enforced HTTPS (see",
        "  apps/mobile-shell/capacitor.config.ts `cleartext: false` and",
        "  docs/security/hardening/L12-ios-app-transport-security.md).",
        "  Remove the offending key(s) from Info.plist or — if a cleartext",
        "  exception is unavoidable — switch to a per-domain entry under",
        "  NSExceptionDomains and document it in",
        "  docs/security/audit-exceptions.md.",
      ].join("\n") + "\n",
    );
    return 1;
  }

  return 0;
}

// Allow `import { auditPlist }` in tests without running main().
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
