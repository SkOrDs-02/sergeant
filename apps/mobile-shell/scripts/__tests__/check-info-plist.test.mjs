// apps/mobile-shell/scripts/__tests__/check-info-plist.test.mjs
//
// Unit tests for the iOS App Transport Security audit
// (`check-info-plist.mjs`). Closes L12 — verification block.
//
// Run with: node --test apps/mobile-shell/scripts/__tests__/check-info-plist.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  parseAtsDict,
  auditPlist,
  ATS_FAIL_KEYS,
} from "../check-info-plist.mjs";

function makePlist(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTD/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

function writeTempPlist(name, body) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ats-audit-"));
  const file = path.join(dir, name);
  writeFileSync(file, makePlist(body), "utf8");
  return file;
}

describe("parseAtsDict", () => {
  it("returns null when NSAppTransportSecurity is absent", () => {
    const out = parseAtsDict(
      makePlist("<key>CFBundleIdentifier</key><string>x</string>"),
    );
    assert.equal(out, null);
  });

  it("parses self-closing <true/> / <false/>", () => {
    const out = parseAtsDict(
      makePlist(`
        <key>NSAppTransportSecurity</key>
        <dict>
          <key>NSAllowsArbitraryLoads</key>
          <true/>
          <key>NSAllowsArbitraryLoadsForMedia</key>
          <false/>
        </dict>
      `),
    );
    assert.deepEqual(out, {
      NSAllowsArbitraryLoads: true,
      NSAllowsArbitraryLoadsForMedia: false,
    });
  });

  it("parses open/close <true></true>", () => {
    const out = parseAtsDict(
      makePlist(`
        <key>NSAppTransportSecurity</key>
        <dict>
          <key>NSAllowsArbitraryLoadsInWebContent</key>
          <true></true>
        </dict>
      `),
    );
    assert.deepEqual(out, { NSAllowsArbitraryLoadsInWebContent: true });
  });

  it("ignores XML-commented keys (no false positive)", () => {
    const out = parseAtsDict(
      makePlist(`
        <key>NSAppTransportSecurity</key>
        <dict>
          <!--
            <key>NSAllowsArbitraryLoads</key>
            <true/>
          -->
          <key>NSAllowsArbitraryLoadsInWebContent</key>
          <false/>
        </dict>
      `),
    );
    assert.deepEqual(out, { NSAllowsArbitraryLoadsInWebContent: false });
  });

  it("surfaces NSExceptionDomains as a dict marker", () => {
    const out = parseAtsDict(
      makePlist(`
        <key>NSAppTransportSecurity</key>
        <dict>
          <key>NSAllowsArbitraryLoads</key>
          <false/>
          <key>NSExceptionDomains</key>
          <dict>
            <key>example.com</key>
            <dict>
              <key>NSExceptionAllowsInsecureHTTPLoads</key>
              <true/>
            </dict>
          </dict>
        </dict>
      `),
    );
    assert.equal(out.NSAllowsArbitraryLoads, false);
    assert.equal(out.NSExceptionDomains, "<dict>");
  });
});

describe("auditPlist", () => {
  it("returns missing when file does not exist", () => {
    const out = auditPlist("/tmp/__definitely_not_there_ats_audit__.plist");
    assert.equal(out.status, "missing");
  });

  it("passes when ATS dict is absent", () => {
    const file = writeTempPlist(
      "Info.plist",
      "<key>CFBundleIdentifier</key><string>com.example</string>",
    );
    const out = auditPlist(file);
    assert.equal(out.status, "ok");
    assert.match(out.findings[0].message, /NSAppTransportSecurity dict absent/);
  });

  it("passes when all listed keys are explicitly false", () => {
    const body = ATS_FAIL_KEYS.map((k) => `<key>${k}</key>\n<false/>`).join(
      "\n",
    );
    const file = writeTempPlist(
      "Info.plist",
      `<key>NSAppTransportSecurity</key>\n<dict>\n${body}\n</dict>`,
    );
    const out = auditPlist(file);
    assert.equal(out.status, "ok");
  });

  it("fails on NSAllowsArbitraryLoads=true", () => {
    const file = writeTempPlist(
      "Info.plist",
      `<key>NSAppTransportSecurity</key>
       <dict>
         <key>NSAllowsArbitraryLoads</key>
         <true/>
       </dict>`,
    );
    const out = auditPlist(file);
    assert.equal(out.status, "fail");
    assert.ok(
      out.findings.some(
        (f) =>
          f.level === "fail" && /NSAllowsArbitraryLoads=true/.test(f.message),
      ),
      "expected a NSAllowsArbitraryLoads=true failure",
    );
  });

  it("fails on NSAllowsArbitraryLoadsInWebContent=true even when global flag is false", () => {
    const file = writeTempPlist(
      "Info.plist",
      `<key>NSAppTransportSecurity</key>
       <dict>
         <key>NSAllowsArbitraryLoads</key>
         <false/>
         <key>NSAllowsArbitraryLoadsInWebContent</key>
         <true/>
       </dict>`,
    );
    const out = auditPlist(file);
    assert.equal(out.status, "fail");
    assert.ok(
      out.findings.some((f) =>
        /NSAllowsArbitraryLoadsInWebContent=true/.test(f.message),
      ),
    );
  });

  it("treats per-domain NSExceptionDomains as info, not fail", () => {
    const file = writeTempPlist(
      "Info.plist",
      `<key>NSAppTransportSecurity</key>
       <dict>
         <key>NSAllowsArbitraryLoads</key>
         <false/>
         <key>NSExceptionDomains</key>
         <dict>
           <key>idp.example.com</key>
           <dict>
             <key>NSExceptionAllowsInsecureHTTPLoads</key>
             <true/>
           </dict>
         </dict>
       </dict>`,
    );
    const out = auditPlist(file);
    assert.equal(out.status, "ok");
    assert.ok(
      out.findings.some(
        (f) => f.level === "info" && /NSExceptionDomains/.test(f.message),
      ),
    );
  });
});
