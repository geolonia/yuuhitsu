import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse } from "yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlossaryTerm {
  canonical: string;
  type: string;
  translations: Record<string, string>;
  do_not_use?: Record<string, string[]>;
}

export interface GlossaryConfig {
  version: number;
  languages: string[];
  terms: GlossaryTerm[];
}

export interface GlossaryIssue {
  forbidden: string;
  canonical: string;
  line: number;
}

export interface MissingTranslation {
  canonical: string;
  missingLanguages: string[];
}

export interface SyncResult {
  totalTerms: number;
  termsByLanguage: Record<string, GlossaryTerm[]>;
  missingTranslations: MissingTranslation[];
}

export interface ReviewReport {
  terms: GlossaryTerm[];
  summary: {
    totalTerms: number;
    languages: string[];
  };
  toMarkdown(): string;
}

// ---------------------------------------------------------------------------
// Skeleton template
// ---------------------------------------------------------------------------

const SKELETON_TEMPLATE = `version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ", "えーぴーあい"]
  # Add more terms below:
  # - canonical: "webhook"
  #   type: noun
  #   translations:
  #     ja: "Webhook"
  #     en: "webhook"
  #   do_not_use:
  #     ja: ["ウェブフック"]
  #     en: ["web hook"]
`;

// ---------------------------------------------------------------------------
// loadGlossary
// ---------------------------------------------------------------------------

export function loadGlossary(glossaryPath: string): GlossaryConfig | null {
  if (!existsSync(glossaryPath)) {
    return null;
  }

  const content = readFileSync(glossaryPath, "utf-8");
  const raw = parse(content);

  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid glossary file: ${glossaryPath}`);
  }

  return raw as GlossaryConfig;
}

// ---------------------------------------------------------------------------
// initGlossary
// ---------------------------------------------------------------------------

export function initGlossary(outputPath: string, force?: boolean): void {
  if (existsSync(outputPath) && !force) {
    throw new Error(
      `Glossary file already exists: ${outputPath}\nUse --force to overwrite.`
    );
  }

  writeFileSync(outputPath, SKELETON_TEMPLATE, "utf-8");
}

// ---------------------------------------------------------------------------
// checkGlossary
// ---------------------------------------------------------------------------

export function checkGlossary(
  docPath: string,
  glossaryPath: string,
  lang: string
): GlossaryIssue[] {
  // Load glossary (throws if not found)
  const glossary = loadGlossary(glossaryPath);
  if (!glossary) {
    throw new Error(`Glossary file not found: ${glossaryPath}`);
  }

  // Read document (throws if not found)
  let docContent: string;
  try {
    docContent = readFileSync(docPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as any).code === "ENOENT") {
      throw new Error(`Document not found: ${docPath}`);
    }
    throw err;
  }

  const lines = docContent.split("\n");
  const issues: GlossaryIssue[] = [];

  for (const term of glossary.terms) {
    const forbidden = term.do_not_use?.[lang] ?? [];
    for (const forbiddenWord of forbidden) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(forbiddenWord)) {
          issues.push({
            forbidden: forbiddenWord,
            canonical: term.canonical,
            line: i + 1,
          });
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// syncGlossary
// ---------------------------------------------------------------------------

export function syncGlossary(glossaryPath: string): SyncResult {
  const glossary = loadGlossary(glossaryPath);
  if (!glossary) {
    throw new Error(`Glossary file not found: ${glossaryPath}`);
  }

  const termsByLanguage: Record<string, GlossaryTerm[]> = {};
  for (const lang of glossary.languages) {
    termsByLanguage[lang] = [];
  }

  const missingTranslations: MissingTranslation[] = [];

  for (const term of glossary.terms) {
    const missingLangs: string[] = [];

    for (const lang of glossary.languages) {
      if (term.translations[lang]) {
        termsByLanguage[lang].push(term);
      } else {
        missingLangs.push(lang);
      }
    }

    if (missingLangs.length > 0) {
      missingTranslations.push({
        canonical: term.canonical,
        missingLanguages: missingLangs,
      });
    }
  }

  return {
    totalTerms: glossary.terms.length,
    termsByLanguage,
    missingTranslations,
  };
}

// ---------------------------------------------------------------------------
// reviewGlossary
// ---------------------------------------------------------------------------

export function reviewGlossary(glossaryPath: string): ReviewReport {
  const glossary = loadGlossary(glossaryPath);
  if (!glossary) {
    throw new Error(`Glossary file not found: ${glossaryPath}`);
  }

  const report: ReviewReport = {
    terms: glossary.terms,
    summary: {
      totalTerms: glossary.terms.length,
      languages: glossary.languages,
    },
    toMarkdown(): string {
      const lines: string[] = [
        "# Glossary Review Report",
        "",
        `**Total Terms:** ${glossary.terms.length}`,
        `**Languages:** ${glossary.languages.join(", ")}`,
        "",
        "## Terms",
        "",
      ];

      for (const term of glossary.terms) {
        lines.push(`### ${term.canonical}`);
        lines.push("");
        lines.push(`- **Type:** ${term.type}`);
        lines.push("- **Translations:**");
        for (const [lang, translation] of Object.entries(term.translations)) {
          lines.push(`  - \`${lang}\`: ${translation}`);
        }
        if (term.do_not_use && Object.keys(term.do_not_use).length > 0) {
          lines.push("- **Do not use:**");
          for (const [lang, words] of Object.entries(term.do_not_use)) {
            lines.push(`  - \`${lang}\`: ${words.join(", ")}`);
          }
        }
        lines.push("");
      }

      return lines.join("\n");
    },
  };

  return report;
}

// ---------------------------------------------------------------------------
// buildGlossaryPrompt — helper for translate integration
// ---------------------------------------------------------------------------

export function buildGlossaryPrompt(
  glossaryConfig: GlossaryConfig,
  targetLang: string
): string {
  const relevantTerms = glossaryConfig.terms.filter(
    (t) => t.translations[targetLang] || t.do_not_use?.[targetLang]
  );

  if (relevantTerms.length === 0) {
    return "";
  }

  const lines: string[] = [
    "",
    "Glossary — use these canonical translations and avoid forbidden terms:",
  ];

  for (const term of relevantTerms) {
    const canonical = term.translations[targetLang] ?? term.canonical;
    const forbidden = term.do_not_use?.[targetLang] ?? [];
    let line = `- "${term.canonical}" → "${canonical}"`;
    if (forbidden.length > 0) {
      line += ` (do NOT use: ${forbidden.map((f) => `"${f}"`).join(", ")})`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}
