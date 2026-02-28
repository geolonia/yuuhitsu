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
} from "../../../src/tasks/glossary.js";

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
        const docPath = join(tempDir, "doc-link-abs.md");
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
        const issues = checkGlossary(docPath, linkGlossaryPath, "en");
        expect(issues).toHaveLength(1);
        expect(issues[0].forbidden).toBe("geonicdb");
      });

      it("should still flag forbidden word in plain text (not in a link)", () => {
        const docPath = join(tempDir, "doc-plain.md");
        writeFileSync(
          docPath,
          "このドキュメントは geonicdb を説明します。\n"
        );
        const issues = checkGlossary(docPath, linkGlossaryPath, "en");
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
});
