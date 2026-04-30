import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  initGlossary,
  checkGlossary,
  syncGlossary,
  reviewGlossary,
  loadGlossary,
  buildGlossaryPrompt,
  type GlossaryConfig,
} from "../../../src/tasks/glossary.js";
import { fixGlossary } from "../../../src/tasks/glossary-fix.js";
import { formatSarif } from "../../../src/lib/sarif-formatter.js";

describe("Glossary Tasks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-glossary-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // loadGlossary
  // ---------------------------------------------------------------------------
  describe("loadGlossary", () => {
    it("should load a valid glossary.yaml", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ", "えーぴーあい"]
`
      );

      const glossary = loadGlossary(glossaryPath);
      expect(glossary).not.toBeNull();
      expect(glossary!.version).toBe(1);
      expect(glossary!.languages).toEqual(["ja", "en"]);
      expect(glossary!.terms).toHaveLength(1);
      expect(glossary!.terms[0].canonical).toBe("API");
      expect(glossary!.terms[0].translations.ja).toBe("API");
      expect(glossary!.terms[0].do_not_use?.ja).toEqual([
        "ＡＰＩ",
        "えーぴーあい",
      ]);
    });

    it("should return null when file does not exist", () => {
      const glossary = loadGlossary(join(tempDir, "nonexistent.yaml"));
      expect(glossary).toBeNull();
    });

    it("should throw when glossary file is invalid YAML", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "{ invalid: yaml: content:");
      expect(() => loadGlossary(glossaryPath)).toThrow();
    });

    it("should throw when terms field is missing", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja, en]\n");
      expect(() => loadGlossary(glossaryPath)).toThrow(/terms/i);
    });

    it("should throw when languages field is missing", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nterms: []\n");
      expect(() => loadGlossary(glossaryPath)).toThrow(/languages/i);
    });
  });

  // ---------------------------------------------------------------------------
  // initGlossary
  // ---------------------------------------------------------------------------
  describe("initGlossary", () => {
    it("should create a glossary.yaml skeleton", () => {
      const outputPath = join(tempDir, "glossary.yaml");
      initGlossary(outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, "utf-8");
      expect(content).toContain("version:");
      expect(content).toContain("languages:");
      expect(content).toContain("terms:");
      expect(content).toContain("canonical:");
    });

    it("should include example term in skeleton", () => {
      const outputPath = join(tempDir, "glossary.yaml");
      initGlossary(outputPath);

      const content = readFileSync(outputPath, "utf-8");
      expect(content).toContain("do_not_use:");
      expect(content).toContain("translations:");
    });

    it("should throw when file already exists without force", () => {
      const outputPath = join(tempDir, "glossary.yaml");
      writeFileSync(outputPath, "existing content");

      expect(() => initGlossary(outputPath)).toThrow(/already exists/i);
    });

    it("should overwrite existing file with force=true", () => {
      const outputPath = join(tempDir, "glossary.yaml");
      writeFileSync(outputPath, "old content");

      initGlossary(outputPath, true);

      const content = readFileSync(outputPath, "utf-8");
      expect(content).toContain("version:");
      expect(content).not.toBe("old content");
    });

    it("should create the glossary as parseable YAML", () => {
      const outputPath = join(tempDir, "glossary.yaml");
      initGlossary(outputPath);

      const glossary = loadGlossary(outputPath);
      expect(glossary).not.toBeNull();
      expect(glossary!.version).toBe(1);
      expect(Array.isArray(glossary!.languages)).toBe(true);
      expect(Array.isArray(glossary!.terms)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // checkGlossary
  // ---------------------------------------------------------------------------
  describe("checkGlossary", () => {
    let glossaryPath: string;

    beforeEach(() => {
      glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ", "えーぴーあい"]
  - canonical: "webhook"
    type: noun
    translations:
      ja: "Webhook"
      en: "webhook"
    do_not_use:
      ja: ["ウェブフック"]
      en: ["web hook", "Web Hook"]
`
      );
    });

    it("should return no issues for a clean document", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "# API Documentation\n\nThis is about the API and Webhook.\n");

      const issues = checkGlossary(docPath, glossaryPath, "en");
      expect(issues).toHaveLength(0);
    });

    it("should detect do_not_use terms in Japanese document", () => {
      const docPath = join(tempDir, "doc.ja.md");
      writeFileSync(
        docPath,
        "# ＡＰＩドキュメント\n\nこれはＡＰＩとウェブフックについてのドキュメントです。\n"
      );

      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);

      const issueTerms = issues.map((i) => i.forbidden);
      expect(issueTerms).toContain("ＡＰＩ");
      expect(issueTerms).toContain("ウェブフック");
    });

    it("should detect do_not_use terms in English document", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "# Documentation\n\nUse web hook instead of webhook.\n");

      const issues = checkGlossary(docPath, glossaryPath, "en");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].forbidden).toBe("web hook");
    });

    it("should include line number in issue", () => {
      const docPath = join(tempDir, "doc.ja.md");
      writeFileSync(docPath, "# Title\n\nＡＰＩの説明\n");

      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].line).toBe(3);
    });

    it("should include suggested canonical term in issue", () => {
      const docPath = join(tempDir, "doc.ja.md");
      writeFileSync(docPath, "えーぴーあいを使ってください。\n");

      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].canonical).toBe("API");
    });

    it("should throw when glossary file does not exist", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "some content");

      expect(() =>
        checkGlossary(docPath, join(tempDir, "nonexistent.yaml"), "en")
      ).toThrow();
    });

    it("should throw when document file does not exist", () => {
      expect(() =>
        checkGlossary(join(tempDir, "nonexistent.md"), glossaryPath, "en")
      ).toThrow(/not found|ENOENT/i);
    });

    it("should throw when lang is not defined in glossary", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "some content\n");
      expect(() =>
        checkGlossary(docPath, glossaryPath, "zh")
      ).toThrow(/not defined in glossary/i);
    });

    describe("false positive suppression", () => {
      let fpGlossaryPath: string;

      beforeEach(() => {
        fpGlossaryPath = join(tempDir, "glossary-fp.yaml");
        writeFileSync(
          fpGlossaryPath,
          `version: 1
languages: [en]
terms:
  - canonical: "webhook"
    type: noun
    translations:
      en: "webhook"
    do_not_use:
      en: ["web hook", "hook"]
`
        );
      });

      it("should not flag forbidden words inside fenced code blocks", () => {
        const docPath = join(tempDir, "doc-fenced.md");
        writeFileSync(
          docPath,
          "Text before.\n\n```\nweb hook example\n```\n\nText after.\n"
        );
        const issues = checkGlossary(docPath, fpGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden words inside inline code", () => {
        const docPath = join(tempDir, "doc-inline.md");
        writeFileSync(docPath, "Use `web hook` syntax here.\n");
        const issues = checkGlossary(docPath, fpGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden words inside URLs", () => {
        const docPath = join(tempDir, "doc-url.md");
        writeFileSync(
          docPath,
          "See [docs](https://example.com/hook-events/list) for info.\n"
        );
        // "hook" appears inside URL https://example.com/hook-events/list but should not be flagged
        const issues = checkGlossary(docPath, fpGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden words inside frontmatter", () => {
        const docPath = join(tempDir, "doc-fm.md");
        writeFileSync(
          docPath,
          "---\ntitle: web hook reference guide\n---\n\nBody is clean.\n"
        );
        const issues = checkGlossary(docPath, fpGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should preserve line numbers for violations after fenced code blocks", () => {
        const docPath = join(tempDir, "doc-line-map.md");
        writeFileSync(
          docPath,
          "```\nweb hook in code\n```\n\nThis hook should be flagged.\n"
        );
        const issues = checkGlossary(docPath, fpGlossaryPath, "en");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("hook");
        expect(issues[0].line).toBe(5);
      });
    });

    describe("Markdown link URL path exclusion", () => {
      let linkGlossaryPath: string;

      beforeEach(() => {
        linkGlossaryPath = join(tempDir, "glossary-link.yaml");
        writeFileSync(
          linkGlossaryPath,
          `version: 1
languages: [ja, en]
terms:
  - canonical: "GeonicDB"
    type: noun
    translations:
      ja: "GeonicDB"
      en: "GeonicDB"
    do_not_use:
      ja: ["geonicdb"]
      en: ["geonicdb"]
`
        );
      });

      it("should not flag forbidden word inside relative URL path /path", () => {
        const docPath = join(tempDir, "doc-link-root.md");
        writeFileSync(
          docPath,
          "[なぜ GeonicDB を選ぶのか？](/ja/introduction/why-geonicdb)\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "ja");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden word inside relative URL path ./path", () => {
        const docPath = join(tempDir, "doc-link-rel.md");
        writeFileSync(
          docPath,
          "[Docs](./why-geonicdb/overview)\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden word inside relative URL path ../path", () => {
        const docPath = join(tempDir, "doc-link-parent.md");
        writeFileSync(
          docPath,
          "[Back](../geonicdb-intro)\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should still flag forbidden word in link text", () => {
        const docPath = join(tempDir, "doc-link-text.md");
        writeFileSync(
          docPath,
          "[geonicdb でできること](/docs/overview)\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "ja");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("geonicdb");
      });

      it("should still flag forbidden word in plain text (not in a link)", () => {
        const docPath = join(tempDir, "doc-plain.md");
        writeFileSync(
          docPath,
          "このドキュメントは geonicdb を説明します。\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "ja");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("geonicdb");
      });

      it("should not break existing absolute URL exclusion", () => {
        const docPath = join(tempDir, "doc-abs-url.md");
        writeFileSync(
          docPath,
          "See [docs](https://example.com/geonicdb/intro) for info.\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });
    });

    describe("technical identifier boundary detection", () => {
      let techGlossaryPath: string;

      beforeEach(() => {
        techGlossaryPath = join(tempDir, "glossary-tech.yaml");
        writeFileSync(
          techGlossaryPath,
          `version: 1
languages: [ja, en]
terms:
  - canonical: "NGSI-LD"
    type: brand
    translations:
      ja: "NGSI-LD"
      en: "NGSI-LD"
    do_not_use:
      ja: ["NGSILD", "ngsi-ld"]
      en: ["NGSILD", "ngsi-ld"]
  - canonical: "GeonicDB"
    type: brand
    translations:
      ja: "GeonicDB"
      en: "GeonicDB"
    do_not_use:
      ja: ["geonicdb"]
      en: ["geonicdb"]
`
        );
      });

      it("should not flag forbidden word inside hyphenated compound (NGSILD-Warning)", () => {
        const docPath = join(tempDir, "doc-compound.md");
        writeFileSync(
          docPath,
          "| Warning header (NGSILD-Warning) | description |\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden word inside underscore identifier (API_NGSILD.md)", () => {
        const docPath = join(tempDir, "doc-ident.md");
        writeFileSync(
          docPath,
          "See API_NGSILD.md for NGSI-LD API details.\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden word in markdown link text that is a filename", () => {
        const docPath = join(tempDir, "doc-linktext.md");
        writeFileSync(
          docPath,
          "[API_NGSILD.md](./ngsild.md) - NGSI-LD API reference\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden word inside URN pattern (urn:ngsi-ld:null)", () => {
        const docPath = join(tempDir, "doc-urn.md");
        writeFileSync(
          docPath,
          "| supports merge-patch+json, urn:ngsi-ld:null, keyValues |\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should not flag forbidden word in compound package name (geonicdb-cli)", () => {
        const docPath = join(tempDir, "doc-package.md");
        writeFileSync(
          docPath,
          "Source: [geolonia/geonicdb-cli](https://github.com/geolonia/geonicdb-cli)\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(0);
      });

      it("should still flag standalone forbidden word", () => {
        const docPath = join(tempDir, "doc-standalone.md");
        writeFileSync(
          docPath,
          "Use NGSILD for testing.\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("NGSILD");
      });

      it("should still flag forbidden word at end of sentence", () => {
        const docPath = join(tempDir, "doc-endsentence.md");
        writeFileSync(
          docPath,
          "This uses NGSILD.\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("NGSILD");
      });

      it("should still flag standalone lowercase forbidden word", () => {
        const docPath = join(tempDir, "doc-lower.md");
        writeFileSync(
          docPath,
          "Use geonicdb for this project.\n"
        );
        const issues = checkGlossary(docPath, techGlossaryPath, "en");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("geonicdb");
      });
    });

    describe("substring match false positive suppression", () => {
      let substrGlossaryPath: string;

      beforeEach(() => {
        substrGlossaryPath = join(tempDir, "glossary-substr.yaml");
        writeFileSync(
          substrGlossaryPath,
          `version: 1
languages: [ja]
terms:
  - canonical: "Subscription"
    type: noun
    translations:
      ja: "サブスクリプション"
    do_not_use:
      ja: ["サブスク"]
  - canonical: "Context Broker"
    type: noun
    translations:
      ja: "コンテキストブローカー"
    do_not_use:
      ja: ["ブローカー"]
`
        );
      });

      it("should not flag サブスク when it appears as part of canonical translation サブスクリプション", () => {
        const docPath = join(tempDir, "doc-substr1.md");
        writeFileSync(docPath, "サブスクリプションモデルを採用しています。\n");
        const issues = checkGlossary(docPath, substrGlossaryPath, "ja");
        expect(issues).toHaveLength(0);
      });

      it("should not flag ブローカー when it appears as part of canonical translation コンテキストブローカー", () => {
        const docPath = join(tempDir, "doc-substr2.md");
        writeFileSync(docPath, "コンテキストブローカーを設定します。\n");
        const issues = checkGlossary(docPath, substrGlossaryPath, "ja");
        expect(issues).toHaveLength(0);
      });

      it("should flag サブスク when used standalone (not part of canonical translation)", () => {
        const docPath = join(tempDir, "doc-substr3.md");
        writeFileSync(docPath, "サブスク管理画面を開きます。\n");
        const issues = checkGlossary(docPath, substrGlossaryPath, "ja");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("サブスク");
      });

      it("should flag ブローカー when used standalone (not part of canonical translation)", () => {
        const docPath = join(tempDir, "doc-substr4.md");
        writeFileSync(docPath, "ブローカーに接続します。\n");
        const issues = checkGlossary(docPath, substrGlossaryPath, "ja");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("ブローカー");
      });

      it("should detect standalone do_not_use when both canonical and forbidden appear on same line", () => {
        // "サブスクリプション"（canonical） と "サブスク"（standalone do_not_use）が同一行に存在する場合
        // standalone の "サブスク" のみ違反として検出する
        const docPath = join(tempDir, "doc-substr5.md");
        writeFileSync(
          docPath,
          "サブスクリプションとサブスクの違いを説明します。\n"
        );
        const issues = checkGlossary(docPath, substrGlossaryPath, "ja");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("サブスク");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // syncGlossary
  // ---------------------------------------------------------------------------
  describe("syncGlossary", () => {
    let glossaryPath: string;

    beforeEach(() => {
      glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
  - canonical: "webhook"
    type: noun
    translations:
      ja: "Webhook"
      en: "webhook"
`
      );
    });

    it("should return a sync result with term coverage", () => {
      const result = syncGlossary(glossaryPath);
      expect(result).toHaveProperty("totalTerms");
      expect(result).toHaveProperty("termsByLanguage");
      expect(result.totalTerms).toBe(2);
    });

    it("should list terms for each language", () => {
      const result = syncGlossary(glossaryPath);
      expect(result.termsByLanguage).toHaveProperty("ja");
      expect(result.termsByLanguage).toHaveProperty("en");
      expect(result.termsByLanguage.ja).toHaveLength(2);
      expect(result.termsByLanguage.en).toHaveLength(2);
    });

    it("should detect missing translations", () => {
      const glossaryPath2 = join(tempDir, "glossary-partial.yaml");
      writeFileSync(
        glossaryPath2,
        `version: 1
languages: [ja, en, zh]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
`
      );

      const result = syncGlossary(glossaryPath2);
      expect(result.missingTranslations).toBeDefined();
      expect(result.missingTranslations.length).toBeGreaterThan(0);
      const missing = result.missingTranslations.find(
        (m) => m.canonical === "API"
      );
      expect(missing).toBeDefined();
      expect(missing!.missingLanguages).toContain("zh");
    });

    it("should throw when glossary file does not exist", () => {
      expect(() =>
        syncGlossary(join(tempDir, "nonexistent.yaml"))
      ).toThrow();
    });

    it("should write stub placeholders for missing translations", () => {
      const partialPath = join(tempDir, "glossary-partial.yaml");
      writeFileSync(
        partialPath,
        `version: 1
languages: [ja, en, zh]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
`
      );

      const result = syncGlossary(partialPath);
      expect(result.stubsCreated).toBeGreaterThan(0);

      // Reload to verify stubs were written
      const updated = loadGlossary(partialPath);
      expect(updated).not.toBeNull();
      const apiTerm = updated!.terms.find((t) => t.canonical === "API");
      expect(apiTerm).toBeDefined();
      expect("zh" in apiTerm!.translations).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // reviewGlossary
  // ---------------------------------------------------------------------------
  describe("reviewGlossary", () => {
    let glossaryPath: string;

    beforeEach(() => {
      glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ"]
  - canonical: "webhook"
    type: noun
    translations:
      ja: "Webhook"
      en: "webhook"
`
      );
    });

    it("should generate a review report with all terms", () => {
      const report = reviewGlossary(glossaryPath);
      expect(report).toHaveProperty("terms");
      expect(report.terms).toHaveLength(2);
    });

    it("should include term details in report", () => {
      const report = reviewGlossary(glossaryPath);
      const apiTerm = report.terms.find((t) => t.canonical === "API");
      expect(apiTerm).toBeDefined();
      expect(apiTerm!.type).toBe("noun");
      expect(apiTerm!.translations.ja).toBe("API");
    });

    it("should include do_not_use in report", () => {
      const report = reviewGlossary(glossaryPath);
      const apiTerm = report.terms.find((t) => t.canonical === "API");
      expect(apiTerm!.do_not_use?.ja).toContain("ＡＰＩ");
    });

    it("should include summary statistics in report", () => {
      const report = reviewGlossary(glossaryPath);
      expect(report).toHaveProperty("summary");
      expect(report.summary.totalTerms).toBe(2);
      expect(report.summary.languages).toEqual(["ja", "en"]);
    });

    it("should throw when glossary file does not exist", () => {
      expect(() =>
        reviewGlossary(join(tempDir, "nonexistent.yaml"))
      ).toThrow();
    });

    it("should format report as Markdown string", () => {
      const report = reviewGlossary(glossaryPath);
      const md = report.toMarkdown();
      expect(typeof md).toBe("string");
      expect(md).toContain("API");
      expect(md).toContain("webhook");
      expect(md).toContain("#");
    });
  });

  // ---------------------------------------------------------------------------
  // checkGlossary — JSON i18n mode
  // ---------------------------------------------------------------------------
  describe("checkGlossary (JSON mode)", () => {
    let glossaryPath: string;

    beforeEach(() => {
      glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ", "えーぴーあい"]
  - canonical: "webhook"
    type: noun
    translations:
      ja: "Webhook"
      en: "webhook"
    do_not_use:
      ja: ["ウェブフック"]
      en: ["web hook", "Web Hook"]
`
      );
    });

    it("should return no issues for a flat JSON with clean values", () => {
      const docPath = join(tempDir, "clean.json");
      writeFileSync(
        docPath,
        JSON.stringify({ title: "API ドキュメント", description: "Webhook の説明" })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues).toHaveLength(0);
    });

    it("should detect do_not_use terms in flat JSON values", () => {
      const docPath = join(tempDir, "flat.json");
      writeFileSync(
        docPath,
        JSON.stringify({ title: "ＡＰＩ設定", description: "ウェブフックを登録する" })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      const forbidden = issues.map((i) => i.forbidden);
      expect(forbidden).toContain("ＡＰＩ");
      expect(forbidden).toContain("ウェブフック");
    });

    it("should include keyPath (not line number) in JSON issues", () => {
      const docPath = join(tempDir, "keypathtest.json");
      writeFileSync(
        docPath,
        JSON.stringify({ title: "ＡＰＩ設定" })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].keyPath).toBe("title");
    });

    it("should detect violations in nested object values", () => {
      const docPath = join(tempDir, "nested.json");
      writeFileSync(
        docPath,
        JSON.stringify({
          dashboard: {
            title: "ＡＰＩ管理",
            subtitle: "概要",
          },
        })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].keyPath).toBe("dashboard.title");
    });

    it("should detect violations in array string values", () => {
      const docPath = join(tempDir, "array.json");
      writeFileSync(
        docPath,
        JSON.stringify({ items: ["API の説明", "ＡＰＩは使わない"] })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].keyPath).toBe("items[1]");
    });

    it("should skip non-string values (null, number, boolean)", () => {
      const docPath = join(tempDir, "nonstringvals.json");
      writeFileSync(
        docPath,
        JSON.stringify({
          count: 42,
          enabled: true,
          nothing: null,
          label: "正常な値",
        })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues).toHaveLength(0);
    });

    it("should skip URL content inside JSON string values", () => {
      const docPath = join(tempDir, "json-url.json");
      writeFileSync(
        docPath,
        JSON.stringify({ link: "See https://example.com/web%20hook/setup for details" })
      );
      const issues = checkGlossary(docPath, glossaryPath, "en");
      expect(issues).toHaveLength(0);
    });

    it("should not affect existing Markdown check (no regression)", () => {
      const mdPath = join(tempDir, "doc.md");
      writeFileSync(mdPath, "# API ドキュメント\n\nＡＰＩを使ってください。\n");
      const issues = checkGlossary(mdPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].line).toBeGreaterThan(0);
      expect(issues[0].keyPath).toBeUndefined();
    });

    it("should throw on invalid JSON file", () => {
      const docPath = join(tempDir, "invalid.json");
      writeFileSync(docPath, "{ not valid json }");
      expect(() => checkGlossary(docPath, glossaryPath, "ja")).toThrow();
    });

    it("should handle deeply nested key paths correctly", () => {
      const docPath = join(tempDir, "deep.json");
      writeFileSync(
        docPath,
        JSON.stringify({
          a: { b: { c: "ＡＰＩの設定" } },
        })
      );
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].keyPath).toBe("a.b.c");
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 3: severity schema
  // ---------------------------------------------------------------------------
  describe("severity schema", () => {
    it("should default severity to 'warn' when not specified", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
    do_not_use:
      ja: ["ＡＰＩ"]
`
      );
      const glossary = loadGlossary(glossaryPath);
      expect(glossary!.terms[0].severity).toBe("warn");
    });

    it("should preserve explicit severity values", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "GeonicDB"
    type: noun
    severity: block
    translations:
      ja: "GeonicDB"
    do_not_use:
      ja: ["ジオニックDB"]
  - canonical: "webhook"
    type: noun
    severity: auto-fix
    translations:
      ja: "Webhook"
    do_not_use:
      ja: ["ウェブフック"]
`
      );
      const glossary = loadGlossary(glossaryPath);
      expect(glossary!.terms[0].severity).toBe("block");
      expect(glossary!.terms[1].severity).toBe("auto-fix");
    });

    it("should throw on invalid severity value", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "API"
    type: noun
    severity: invalid-level
    translations:
      ja: "API"
`
      );
      expect(() => loadGlossary(glossaryPath)).toThrow(/invalid severity/i);
    });

    it("should include severity in GlossaryIssue", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "GeonicDB"
    type: noun
    severity: block
    translations:
      ja: "GeonicDB"
    do_not_use:
      ja: ["ジオニックDB"]
`
      );
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "ジオニックDBを使ってください。\n");
      const issues = checkGlossary(docPath, glossaryPath, "ja");
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("block");
    });

    it("should filter issues by severityFilter", () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "GeonicDB"
    type: noun
    severity: block
    translations:
      ja: "GeonicDB"
    do_not_use:
      ja: ["ジオニックDB"]
  - canonical: "webhook"
    type: noun
    severity: warn
    translations:
      ja: "Webhook"
    do_not_use:
      ja: ["ウェブフック"]
`
      );
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "ジオニックDBとウェブフックを使ってください。\n");

      const blockOnly = checkGlossary(docPath, glossaryPath, "ja", {
        severityFilter: ["block"],
      });
      expect(blockOnly).toHaveLength(1);
      expect(blockOnly[0].severity).toBe("block");

      const warnOnly = checkGlossary(docPath, glossaryPath, "ja", {
        severityFilter: ["warn"],
      });
      expect(warnOnly).toHaveLength(1);
      expect(warnOnly[0].severity).toBe("warn");

      const all = checkGlossary(docPath, glossaryPath, "ja");
      expect(all).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 1: buildGlossaryPrompt
  // ---------------------------------------------------------------------------
  describe("buildGlossaryPrompt", () => {
    const makeConfig = (overrides?: Partial<GlossaryConfig>): GlossaryConfig => ({
      version: 1,
      languages: ["ja"],
      terms: [
        {
          canonical: "GeonicDB",
          type: "noun",
          severity: "block",
          translations: { ja: "GeonicDB" },
          do_not_use: { ja: ["ジオニックDB"] },
        },
        {
          canonical: "webhook",
          type: "noun",
          severity: "warn",
          translations: { ja: "Webhook" },
          do_not_use: { ja: ["ウェブフック"] },
        },
        {
          canonical: "subscription",
          type: "noun",
          severity: "auto-fix",
          translations: { ja: "サブスクリプション" },
          do_not_use: { ja: ["サブスク"] },
        },
      ],
      ...overrides,
    });

    it("should wrap glossary in XML tags", () => {
      const prompt = buildGlossaryPrompt(makeConfig(), "ja");
      expect(prompt).toContain("<glossary>");
      expect(prompt).toContain("</glossary>");
    });

    it("should include severity attribute in term elements", () => {
      const prompt = buildGlossaryPrompt(makeConfig(), "ja");
      expect(prompt).toContain('severity="block"');
      expect(prompt).toContain('severity="warn"');
      expect(prompt).toContain('severity="auto-fix"');
    });

    it("should re-state severity=block terms at the top", () => {
      const prompt = buildGlossaryPrompt(makeConfig(), "ja");
      const blockHeaderIdx = prompt.indexOf("STRICT BRAND TERMS");
      const glossaryIdx = prompt.indexOf("<glossary>");
      expect(blockHeaderIdx).toBeGreaterThanOrEqual(0);
      expect(blockHeaderIdx).toBeLessThan(glossaryIdx);
    });

    it("should include few-shot examples", () => {
      const prompt = buildGlossaryPrompt(makeConfig(), "ja");
      expect(prompt).toContain("<example>");
      expect(prompt).toContain("<input>");
      expect(prompt).toContain("<output>");
    });

    it("should include do_not_use in term XML", () => {
      const prompt = buildGlossaryPrompt(makeConfig(), "ja");
      expect(prompt).toContain("<do_not_use>");
    });

    it("should return empty string for empty relevant terms", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["ja"],
        terms: [],
      };
      expect(buildGlossaryPrompt(config, "ja")).toBe("");
    });

    it("should include canonical translation in term XML", () => {
      const prompt = buildGlossaryPrompt(makeConfig(), "ja");
      expect(prompt).toContain('canonical="GeonicDB"');
      expect(prompt).toContain('canonical="Webhook"');
      expect(prompt).toContain('canonical="サブスクリプション"');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2: fixGlossary (glossary-fix.ts)
  // ---------------------------------------------------------------------------
  describe("fixGlossary", () => {
    let glossaryPath: string;

    beforeEach(() => {
      glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "GeonicDB"
    type: noun
    severity: block
    translations:
      ja: "GeonicDB"
    do_not_use:
      ja: ["ジオニックDB"]
  - canonical: "webhook"
    type: noun
    severity: warn
    translations:
      ja: "Webhook"
    do_not_use:
      ja: ["ウェブフック"]
  - canonical: "サブスクリプション"
    type: noun
    severity: auto-fix
    translations:
      ja: "サブスクリプション"
    do_not_use:
      ja: ["サブスク"]
`
      );
    });

    it("should replace severity=auto-fix terms", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "サブスクを契約してください。\n");
      const result = fixGlossary(docPath, glossaryPath, "ja");
      expect(result.replacements).toBeGreaterThan(0);
      expect(result.changed).toBe(true);
      const content = readFileSync(docPath, "utf-8");
      // "サブスク" should be replaced by "サブスクリプション"
      // Note: "サブスクリプション" contains "サブスク" as prefix — check exact pattern
      expect(content).toContain("サブスクリプション");
      expect(content).not.toContain("サブスクを"); // original pattern gone
    });

    it("should NOT replace severity=block or severity=warn terms", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "ジオニックDBとウェブフックを使ってください。\n");
      const result = fixGlossary(docPath, glossaryPath, "ja");
      expect(result.changed).toBe(false);
      const content = readFileSync(docPath, "utf-8");
      expect(content).toContain("ジオニックDB");
      expect(content).toContain("ウェブフック");
    });

    it("should protect code blocks from replacement", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(
        docPath,
        "本文でサブスクを使ってください。\n\n```\nサブスクの例\n```\n"
      );
      const result = fixGlossary(docPath, glossaryPath, "ja");
      const content = readFileSync(docPath, "utf-8");
      expect(content).toContain("サブスクリプション"); // body replaced
      expect(content).toContain("サブスクの例"); // code block protected
    });

    it("should protect URLs from replacement", () => {
      const docPath = join(tempDir, "doc.md");
      // URL containing the forbidden word should NOT be replaced
      writeFileSync(docPath, "詳しくは https://example.com/サブスク を参照してください。\n");
      const result = fixGlossary(docPath, glossaryPath, "ja");
      const content = readFileSync(docPath, "utf-8");
      expect(content).toContain("https://example.com/サブスク");
    });

    it("should not modify file in --dry-run mode", () => {
      const docPath = join(tempDir, "doc.md");
      const original = "サブスクを契約してください。\n";
      writeFileSync(docPath, original);
      const result = fixGlossary(docPath, glossaryPath, "ja", true);
      expect(result.changed).toBe(true);
      const content = readFileSync(docPath, "utf-8");
      expect(content).toBe(original);
    });

    it("should return changed=false when no auto-fix replacements needed", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "サブスクリプションを契約してください。\n");
      const result = fixGlossary(docPath, glossaryPath, "ja");
      expect(result.changed).toBe(false);
      expect(result.replacements).toBe(0);
    });

    it("should throw when glossary file not found", () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "text\n");
      expect(() =>
        fixGlossary(docPath, join(tempDir, "nonexistent.yaml"), "ja")
      ).toThrow(/not found/i);
    });

    it("should throw when doc file not found", () => {
      expect(() =>
        fixGlossary(join(tempDir, "nonexistent.md"), glossaryPath, "ja")
      ).toThrow(/not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // CodeRabbit fix: buildGlossaryPrompt — XML escaping
  // ---------------------------------------------------------------------------
  describe("buildGlossaryPrompt — XML escaping", () => {
    it("should escape & in canonical term name", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["en"],
        terms: [
          {
            canonical: "A & B",
            type: "noun",
            severity: "warn",
            translations: { en: "A & B" },
            do_not_use: { en: ["A and B"] },
          },
        ],
      };
      const prompt = buildGlossaryPrompt(config, "en");
      expect(prompt).toContain("&amp;");
      expect(prompt).not.toContain(' canonical="A & B"');
    });

    it("should escape < and > in do_not_use values", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["en"],
        terms: [
          {
            canonical: "tag",
            type: "noun",
            severity: "warn",
            translations: { en: "tag" },
            do_not_use: { en: ["<tag>"] },
          },
        ],
      };
      const prompt = buildGlossaryPrompt(config, "en");
      expect(prompt).toContain("&lt;tag&gt;");
      expect(prompt).not.toContain("<do_not_use><tag></do_not_use>");
    });

    it("should produce valid XML structure with special characters in glossary", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["en"],
        terms: [
          {
            canonical: "R&D",
            type: "noun",
            severity: "block",
            translations: { en: "R&D" },
            do_not_use: { en: ["R & D", "R<D"] },
          },
        ],
      };
      const prompt = buildGlossaryPrompt(config, "en");
      expect(prompt).toContain("&amp;");
      expect(prompt).toContain("&lt;");
    });
  });

  // ---------------------------------------------------------------------------
  // CodeRabbit fix: buildGlossaryPrompt — few-shot example count
  // ---------------------------------------------------------------------------
  describe("buildGlossaryPrompt — few-shot examples", () => {
    it("should include up to 3 few-shot examples", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["ja"],
        terms: [
          {
            canonical: "Term1",
            type: "noun",
            severity: "warn",
            translations: { ja: "ターム1" },
            do_not_use: { ja: ["旧称1"] },
          },
          {
            canonical: "Term2",
            type: "noun",
            severity: "warn",
            translations: { ja: "ターム2" },
            do_not_use: { ja: ["旧称2"] },
          },
          {
            canonical: "Term3",
            type: "noun",
            severity: "warn",
            translations: { ja: "ターム3" },
            do_not_use: { ja: ["旧称3"] },
          },
          {
            canonical: "Term4",
            type: "noun",
            severity: "warn",
            translations: { ja: "ターム4" },
            do_not_use: { ja: ["旧称4"] },
          },
        ],
      };
      const prompt = buildGlossaryPrompt(config, "ja");
      const exampleCount = (prompt.match(/<example>/g) ?? []).length;
      expect(exampleCount).toBe(3);
    });

    it("should include examples only from terms with do_not_use entries", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["ja"],
        terms: [
          {
            canonical: "NoForbidden",
            type: "noun",
            severity: "warn",
            translations: { ja: "禁止語なし" },
          },
          {
            canonical: "HasForbidden",
            type: "noun",
            severity: "warn",
            translations: { ja: "禁止語あり" },
            do_not_use: { ja: ["旧称"] },
          },
        ],
      };
      const prompt = buildGlossaryPrompt(config, "ja");
      const exampleCount = (prompt.match(/<example>/g) ?? []).length;
      expect(exampleCount).toBe(1);
      expect(prompt).toContain("旧称");
    });

    it("should produce no examples when no terms have do_not_use", () => {
      const config: GlossaryConfig = {
        version: 1,
        languages: ["ja"],
        terms: [
          {
            canonical: "Term",
            type: "noun",
            severity: "warn",
            translations: { ja: "用語" },
          },
        ],
      };
      const prompt = buildGlossaryPrompt(config, "ja");
      expect(prompt).not.toContain("<example>");
    });
  });

  // ---------------------------------------------------------------------------
  // CodeRabbit fix: fixGlossary — UUID placeholder collision prevention
  // ---------------------------------------------------------------------------
  describe("fixGlossary — UUID placeholder collision", () => {
    let glossaryPath: string;

    beforeEach(() => {
      glossaryPath = join(tempDir, "glossary-uuid.yaml");
      writeFileSync(
        glossaryPath,
        `version: 1
languages: [ja]
terms:
  - canonical: "サブスクリプション"
    type: noun
    severity: auto-fix
    translations:
      ja: "サブスクリプション"
    do_not_use:
      ja: ["サブスク"]
`
      );
    });

    it("should correctly handle document containing legacy placeholder pattern __URL_0__", () => {
      const docPath = join(tempDir, "doc-placeholder.md");
      const original = "このドキュメントには __URL_0__ というテキストとサブスクへの言及があります。\n";
      writeFileSync(docPath, original);
      const result = fixGlossary(docPath, glossaryPath, "ja");
      const content = readFileSync(docPath, "utf-8");
      expect(content).toContain("__URL_0__");
      expect(content).toContain("サブスクリプション");
      expect(result.changed).toBe(true);
    });

    it("should not corrupt document when URL contains forbidden word", () => {
      const docPath = join(tempDir, "doc-url.md");
      writeFileSync(docPath, "参照: https://example.com/サブスク/overview\nサブスクを使ってください。\n");
      const result = fixGlossary(docPath, glossaryPath, "ja");
      const content = readFileSync(docPath, "utf-8");
      expect(content).toContain("https://example.com/サブスク/overview");
      expect(content).toContain("サブスクリプションを使ってください");
      expect(result.replacements).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 3: SARIF formatter
  // ---------------------------------------------------------------------------
  describe("formatSarif", () => {
    it("should produce valid SARIF 2.1.0 JSON", () => {
      const issues = [
        {
          forbidden: "ジオニックDB",
          canonical: "GeonicDB",
          line: 3,
          severity: "block" as const,
        },
      ];
      const sarif = JSON.parse(formatSarif(issues, "doc.md"));
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].results).toHaveLength(1);
      expect(sarif.runs[0].results[0].level).toBe("error");
      expect(sarif.runs[0].results[0].ruleId).toBe("yuuhitsu/glossary-violation");
    });

    it("should map severity to SARIF levels correctly", () => {
      const issues = [
        { forbidden: "a", canonical: "A", line: 1, severity: "block" as const },
        { forbidden: "b", canonical: "B", line: 2, severity: "warn" as const },
        { forbidden: "c", canonical: "C", line: 3, severity: "auto-fix" as const },
      ];
      const sarif = JSON.parse(formatSarif(issues, "doc.md"));
      const levels = sarif.runs[0].results.map((r: { level: string }) => r.level);
      expect(levels).toEqual(["error", "warning", "note"]);
    });

    it("should produce empty results for no issues", () => {
      const sarif = JSON.parse(formatSarif([], "doc.md"));
      expect(sarif.runs[0].results).toHaveLength(0);
    });
  });
});
