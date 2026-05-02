import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { checkGlossary, buildGlossaryPrompt } from "../../../src/tasks/glossary.js";
import type { GlossaryConfig } from "../../../src/tasks/glossary.js";

describe("SF6 context_exception — DoNotUseEntry hybrid schema", () => {
  let tempDir: string;
  let glossaryPath: string;
  let docPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-ctx-exception-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    glossaryPath = join(tempDir, "glossary.yaml");
    docPath = join(tempDir, "doc.md");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Test 1: string form (backward compat) — existing ["購読"] still triggers violation
  it("string form (backward compat): triggers violation as before", () => {
    writeFileSync(
      glossaryPath,
      `version: 1
languages: [ja]
terms:
  - canonical: "Subscription"
    type: noun
    translations:
      ja: "サブスクリプション"
    do_not_use:
      ja: ["購読"]
    severity: warn
`
    );
    writeFileSync(docPath, "このイベントを購読してください。\n");

    const issues = checkGlossary(docPath, glossaryPath, "ja");
    expect(issues).toHaveLength(1);
    expect(issues[0].forbidden).toBe("購読");
    expect(issues[0].canonical).toBe("Subscription");
  });

  // Test 2: object form + except_after match — "MQTT broker" is allowed (no violation)
  it("object form + except_after match: MQTT broker is allowed", () => {
    writeFileSync(
      glossaryPath,
      `version: 1
languages: [ja]
terms:
  - canonical: "Broker"
    type: noun
    translations:
      ja: "Broker"
    do_not_use:
      ja:
        - term: "ブローカー"
          except_after: ["MQTT", "Message"]
    severity: warn
`
    );
    // "MQTT " appears within 16 chars before "ブローカー" → allowed
    writeFileSync(docPath, "MQTT ブローカーに接続します。\n");

    const issues = checkGlossary(docPath, glossaryPath, "ja");
    expect(issues).toHaveLength(0);
  });

  // Test 3: object form + except_after mismatch — "Event broker" triggers violation
  it("object form + except_after mismatch: Event broker triggers violation", () => {
    writeFileSync(
      glossaryPath,
      `version: 1
languages: [ja]
terms:
  - canonical: "Broker"
    type: noun
    translations:
      ja: "Broker"
    do_not_use:
      ja:
        - term: "ブローカー"
          except_after: ["MQTT", "Message"]
    severity: warn
`
    );
    // "Event " does NOT match except_after list → violation
    writeFileSync(docPath, "Event ブローカーを使います。\n");

    const issues = checkGlossary(docPath, glossaryPath, "ja");
    expect(issues).toHaveLength(1);
    expect(issues[0].forbidden).toBe("ブローカー");
  });

  // Test 4: lookback boundary — 16 chars inside vs outside
  it("lookback boundary: within 16 chars is allowed, outside 17 chars is not", () => {
    writeFileSync(
      glossaryPath,
      `version: 1
languages: [ja]
terms:
  - canonical: "Broker"
    type: noun
    translations:
      ja: "Broker"
    do_not_use:
      ja:
        - term: "ブローカー"
          except_after: ["X"]
    severity: warn
`
    );
    // "X" + 1 space before "ブローカー" → idx=2, lookback=slice(0,2)="X " → "X" found → allowed
    writeFileSync(docPath, "X ブローカー\n");
    const issuesInside = checkGlossary(docPath, glossaryPath, "ja");
    expect(issuesInside).toHaveLength(0);

    // "X" + 17 spaces before "ブローカー" → idx=18, lookback=slice(2,18)=16 spaces → "X" NOT found → violation
    writeFileSync(docPath, "X                 ブローカー\n");
    const issuesOutside = checkGlossary(docPath, glossaryPath, "ja");
    expect(issuesOutside).toHaveLength(1);
    expect(issuesOutside[0].forbidden).toBe("ブローカー");
  });

  // Test 5: buildGlossaryPrompt includes except_after attribute in XML
  it("buildGlossaryPrompt: except_after is reflected in XML output", () => {
    const glossaryConfig: GlossaryConfig = {
      version: 1,
      languages: ["ja"],
      terms: [
        {
          canonical: "Broker",
          type: "noun",
          translations: { ja: "ブローカー" },
          do_not_use: {
            ja: [{ term: "ブローカー", except_after: ["MQTT", "Message"] }],
          },
          severity: "warn",
        },
      ],
    };

    const prompt = buildGlossaryPrompt(glossaryConfig, "ja");
    expect(prompt).toContain('except_after="MQTT, Message"');
    expect(prompt).toContain("ブローカー");
    expect(prompt).toContain("except_after");
    expect(prompt).toContain("If a do_not_use entry has except_after");
  });
});
