import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse, stringify } from "yaml";
import { separateFrontmatter, protectCodeBlocks } from "./translate.js";

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
  /** JSON mode only: dot-notation key path (e.g. "dashboard.title", "items[0]") */
  keyPath?: string;
}

export interface MissingTranslation {
  canonical: string;
  missingLanguages: string[];
}

export interface SyncResult {
  totalTerms: number;
  termsByLanguage: Record<string, GlossaryTerm[]>;
  missingTranslations: MissingTranslation[];
  stubsCreated: number;
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

  const schema = raw as Record<string, unknown>;
  if (!Array.isArray(schema.terms)) {
    throw new Error(`Glossary file must have a "terms" array: ${glossaryPath}`);
  }
  if (!Array.isArray(schema.languages)) {
    throw new Error(`Glossary file must have a "languages" array: ${glossaryPath}`);
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

  // Validate lang parameter
  if (!glossary.languages.includes(lang)) {
    throw new Error(
      `Language "${lang}" is not defined in glossary. Available: ${glossary.languages.join(", ")}`
    );
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

  // JSON mode: parse and check all string values
  if (docPath.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(docContent);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse JSON file: ${docPath}${err instanceof Error ? ` — ${err.message}` : ""}`
      );
    }

    const stringValues = extractJsonStringValues(parsed);
    const issues: GlossaryIssue[] = [];

    for (const term of glossary.terms) {
      const forbidden = term.do_not_use?.[lang] ?? [];
      const canonicalTranslation = term.translations[lang];
      for (const forbiddenWord of forbidden) {
        if (forbiddenWord.length === 0) continue;
        for (const { keyPath, value } of stringValues) {
          // Remove URL content before checking to avoid false positives inside URLs
          const valueWithoutUrls = value
            .replace(/https?:\/\/\S+/g, "")
            .replace(/\]\([^)]+\)/g, "");
          if (hasUncoveredOccurrence(valueWithoutUrls, forbiddenWord, canonicalTranslation)) {
            issues.push({
              forbidden: forbiddenWord,
              canonical: term.canonical,
              line: 0,
              keyPath,
            });
          }
        }
      }
    }

    return issues;
  }

  // Markdown mode: separate frontmatter, protect code blocks, check line by line
  const { frontmatter, body } = separateFrontmatter(docContent);
  const frontmatterLineCount = frontmatter ? frontmatter.split("\n").length - 1 : 0;

  // Protect code blocks and inline code with placeholders to avoid false positives
  const { text: protectedBody } = protectCodeBlocks(body);

  const lines = protectedBody.split("\n");
  const issues: GlossaryIssue[] = [];

  for (const term of glossary.terms) {
    const forbidden = term.do_not_use?.[lang] ?? [];
    const canonicalTranslation = term.translations[lang];
    for (const forbiddenWord of forbidden) {
      if (forbiddenWord.length === 0) continue;
      for (let i = 0; i < lines.length; i++) {
        // Remove URL content before checking to avoid false positives inside URLs
        const lineWithoutUrls = lines[i]
          .replace(/https?:\/\/\S+/g, "")
          .replace(/\]\([^)]+\)/g, "");
        if (hasUncoveredOccurrence(lineWithoutUrls, forbiddenWord, canonicalTranslation)) {
          issues.push({
            forbidden: forbiddenWord,
            canonical: term.canonical,
            line: i + 1 + frontmatterLineCount,
          });
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// JSON i18n helpers
// ---------------------------------------------------------------------------

/**
 * Recursively extracts all string values from a JSON object.
 * Returns an array of { keyPath, value } pairs.
 * Arrays use bracket notation: "items[0]".
 */
export function extractJsonStringValues(
  obj: unknown,
  prefix: string = ""
): Array<{ keyPath: string; value: string }> {
  if (typeof obj === "string") {
    return prefix ? [{ keyPath: prefix, value: obj }] : [];
  }

  if (Array.isArray(obj)) {
    const results: Array<{ keyPath: string; value: string }> = [];
    for (let i = 0; i < obj.length; i++) {
      const childPath = prefix ? `${prefix}[${i}]` : `[${i}]`;
      results.push(...extractJsonStringValues(obj[i], childPath));
    }
    return results;
  }

  if (obj !== null && typeof obj === "object") {
    const results: Array<{ keyPath: string; value: string }> = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      results.push(...extractJsonStringValues(value, childPath));
    }
    return results;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Substring-match helpers for checkGlossary
// ---------------------------------------------------------------------------

/**
 * Returns true if `canonicalTranslation` appears in `line` at a position
 * that "covers" the occurrence of `forbiddenWord` starting at `forbiddenIdx`.
 *
 * Example: canonicalTranslation = "サブスクリプション", forbiddenWord = "サブスク"
 * If "サブスクリプション" appears at position 0 in the line, the "サブスク" occurrence
 * at position 0 is covered and should not be reported as a violation.
 */
function isOccurrenceCoveredByCanonical(
  line: string,
  forbiddenIdx: number,
  forbiddenWord: string,
  canonicalTranslation: string | undefined
): boolean {
  if (!canonicalTranslation) return false;

  // For each position of forbiddenWord within canonicalTranslation, check
  // whether canonicalTranslation appears at the corresponding position in line.
  let posInCanonical = canonicalTranslation.indexOf(forbiddenWord);
  while (posInCanonical !== -1) {
    const canonicalStart = forbiddenIdx - posInCanonical;
    if (
      canonicalStart >= 0 &&
      line.slice(canonicalStart, canonicalStart + canonicalTranslation.length) === canonicalTranslation
    ) {
      return true;
    }
    posInCanonical = canonicalTranslation.indexOf(forbiddenWord, posInCanonical + 1);
  }
  return false;
}

/**
 * Returns true if `line` contains at least one occurrence of `forbiddenWord`
 * that is NOT covered by `canonicalTranslation` appearing at the same position.
 */
function hasUncoveredOccurrence(
  line: string,
  forbiddenWord: string,
  canonicalTranslation: string | undefined
): boolean {
  if (forbiddenWord.length === 0) return false;
  let searchPos = 0;
  while (true) {
    const idx = line.indexOf(forbiddenWord, searchPos);
    if (idx === -1) break;
    if (!isOccurrenceCoveredByCanonical(line, idx, forbiddenWord, canonicalTranslation)) {
      return true;
    }
    searchPos = idx + 1;
  }
  return false;
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

  // Write stub placeholders for missing translations
  let stubsCreated = 0;
  if (missingTranslations.length > 0) {
    for (const term of glossary.terms) {
      for (const lang of glossary.languages) {
        if (!term.translations[lang]) {
          term.translations[lang] = "";
          stubsCreated++;
        }
      }
    }
    writeFileSync(glossaryPath, stringify(glossary), "utf-8");
  }

  return {
    totalTerms: glossary.terms.length,
    termsByLanguage,
    missingTranslations,
    stubsCreated,
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
