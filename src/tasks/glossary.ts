import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse, stringify } from "yaml";
import { separateFrontmatter } from "./translate.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlossarySeverity = 'block' | 'warn' | 'auto-fix';

export type DoNotUseEntry = string | { term: string; except_after?: string[] };

export interface GlossaryTerm {
  canonical: string;
  type: string;
  translations: Record<string, string>;
  do_not_use?: Record<string, DoNotUseEntry[]>;
  /** Severity level for violations. Defaults to 'warn' if omitted. */
  severity?: GlossarySeverity;
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
  severity: GlossarySeverity;
  /** JSON mode only: dot-notation key path (e.g. "dashboard.title", "items[0]") */
  keyPath?: string;
}

export type GlossaryOutputFormat = 'text' | 'json' | 'sarif';

export interface CheckGlossaryOptions {
  /** Only report issues with these severity levels (default: all) */
  severityFilter?: GlossarySeverity[];
  /** Output format (default: 'text') */
  format?: GlossaryOutputFormat;
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

  const config = raw as GlossaryConfig;

  // Validate severity fields
  const validSeverities: GlossarySeverity[] = ['block', 'warn', 'auto-fix'];
  for (const term of config.terms) {
    if (term.severity !== undefined && !validSeverities.includes(term.severity)) {
      throw new Error(
        `Invalid severity "${term.severity}" for term "${term.canonical}". Must be one of: ${validSeverities.join(', ')}`
      );
    }
    if (term.severity === undefined) {
      term.severity = 'warn';
    }
  }

  return config;
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
  lang: string,
  options?: CheckGlossaryOptions
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
      for (const entry of forbidden) {
        const forbiddenWord = typeof entry === 'string' ? entry : entry.term;
        const exceptAfter = typeof entry === 'string' ? undefined : entry.except_after;
        if (forbiddenWord.length === 0) continue;
        for (const { keyPath, value } of stringValues) {
          // Remove URL/URN content before checking to avoid false positives
          const valueWithoutUrls = value
            .replace(/https?:\/\/\S+/g, "")
            .replace(/\]\([^)]+\)/g, "")
            .replace(/urn:\S+/g, "");
          if (hasUncoveredOccurrence(valueWithoutUrls, forbiddenWord, canonicalTranslation, exceptAfter)) {
            issues.push({
              forbidden: forbiddenWord,
              canonical: term.canonical,
              line: 0,
              severity: term.severity ?? 'warn',
              keyPath,
            });
          }
        }
      }
    }

    return applyFilter(issues, options);
  }

  // Markdown mode: separate frontmatter, then scan original body lines directly.
  // This preserves original line numbers even though protectCodeBlocks no longer
  // adds newline padding (padding removal was needed to fix chunk boundary splits).
  const { frontmatter, body } = separateFrontmatter(docContent);
  const frontmatterLineCount = frontmatter ? frontmatter.split("\n").length - 1 : 0;

  const bodyLines = body.split("\n");
  const issues: GlossaryIssue[] = [];
  let inFencedBlock = false;
  let fenceMarker: string | null = null;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const fenceMatch = line.match(/^(`{3,})/);

    if (!inFencedBlock) {
      if (fenceMatch) {
        inFencedBlock = true;
        fenceMarker = fenceMatch[1];
        continue;
      }
      // Strip inline code and URL/URN content before checking to avoid false positives
      const lineClean = line
        .replace(/`[^`\n]+`/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\]\([^)]+\)/g, "")
        .replace(/urn:\S+/g, "");

      for (const term of glossary.terms) {
        const forbidden = term.do_not_use?.[lang] ?? [];
        const canonicalTranslation = term.translations[lang];
        for (const entry of forbidden) {
          const forbiddenWord = typeof entry === 'string' ? entry : entry.term;
          const exceptAfter = typeof entry === 'string' ? undefined : entry.except_after;
          if (forbiddenWord.length === 0) continue;
          if (hasUncoveredOccurrence(lineClean, forbiddenWord, canonicalTranslation, exceptAfter)) {
            issues.push({
              forbidden: forbiddenWord,
              canonical: term.canonical,
              line: i + 1 + frontmatterLineCount,
              severity: term.severity ?? 'warn',
            });
          }
        }
      }
    } else {
      // Inside a fenced code block — look for closing fence
      if (
        fenceMatch &&
        fenceMatch[1].length >= fenceMarker!.length &&
        line.trim() === fenceMatch[1]
      ) {
        inFencedBlock = false;
        fenceMarker = null;
      }
    }
  }

  return applyFilter(issues, options);
}

function applyFilter(issues: GlossaryIssue[], options?: CheckGlossaryOptions): GlossaryIssue[] {
  if (!options?.severityFilter || options.severityFilter.length === 0) {
    return issues;
  }
  return issues.filter((issue) => options.severityFilter!.includes(issue.severity));
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
 * Returns true if the match at `matchIdx` is part of a larger technical
 * identifier (e.g., "NGSILD" in "NGSILD-Warning" or "API_NGSILD.md").
 *
 * Uses ASCII identifier characters to detect compound words:
 * - Before: [a-zA-Z0-9_] (alphanumeric + underscore)
 * - After:  [a-zA-Z0-9_\-] (alphanumeric + underscore + hyphen for compound words)
 */
function isPartOfLargerIdentifier(
  line: string,
  matchIdx: number,
  matchLen: number
): boolean {
  if (matchIdx > 0) {
    const charBefore = line[matchIdx - 1];
    if (/[a-zA-Z0-9_]/.test(charBefore)) return true;
  }
  const afterIdx = matchIdx + matchLen;
  if (afterIdx < line.length) {
    const charAfter = line[afterIdx];
    if (/[a-zA-Z0-9_\-]/.test(charAfter)) return true;
  }
  return false;
}

/**
 * Returns true if `line` contains at least one occurrence of `forbiddenWord`
 * that is NOT covered by `canonicalTranslation` appearing at the same position,
 * is NOT part of a larger technical identifier, and is NOT preceded within
 * 16 chars by any of the `exceptAfter` strings.
 */
function hasUncoveredOccurrence(
  line: string,
  forbiddenWord: string,
  canonicalTranslation: string | undefined,
  exceptAfter?: string[]
): boolean {
  if (forbiddenWord.length === 0) return false;
  let searchPos = 0;
  while (true) {
    const idx = line.indexOf(forbiddenWord, searchPos);
    if (idx === -1) break;
    if (exceptAfter && exceptAfter.length > 0) {
      const lookback = line.slice(Math.max(0, idx - 16), idx);
      if (exceptAfter.some((ea) => lookback.includes(ea))) {
        searchPos = idx + 1;
        continue;
      }
    }
    if (
      !isOccurrenceCoveredByCanonical(line, idx, forbiddenWord, canonicalTranslation) &&
      !isPartOfLargerIdentifier(line, idx, forbiddenWord.length)
    ) {
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  // Unified helper: treat empty-string stubs (from syncGlossary) as missing
  const renderedTermCanonical = (term: GlossaryTerm): string => {
    const raw = term.translations[targetLang];
    return (typeof raw === "string" && raw.trim().length > 0) ? raw.trim() : term.canonical;
  };

  // canonical-first: sort by canonical name so reference order is predictable
  const blockTerms = relevantTerms.filter((t) => t.severity === 'block');
  const otherTerms = relevantTerms.filter((t) => t.severity !== 'block');

  const parts: string[] = [];

  // Severity=block terms are re-stated at the top for emphasis (plain text, no XML escaping)
  if (blockTerms.length > 0) {
    parts.push("STRICT BRAND TERMS — these must be used exactly as specified:");
    for (const term of blockTerms) {
      const canonical = renderedTermCanonical(term);
      parts.push(`  - "${term.canonical}" MUST be rendered as "${canonical}" (no exceptions)`);
    }
    parts.push("");
  }

  // XML-wrapped glossary body
  const termXml: string[] = [];
  for (const term of [...blockTerms, ...otherTerms]) {
    const canonical = renderedTermCanonical(term);
    const forbidden = term.do_not_use?.[targetLang] ?? [];
    const severity = term.severity ?? 'warn';
    const forbiddenXml = forbidden.length > 0
      ? forbidden.map((f) => {
          if (typeof f === 'string') {
            return `    <do_not_use>${escapeXml(f)}</do_not_use>`;
          }
          const exceptAttr = f.except_after && f.except_after.length > 0
            ? ` except_after="${escapeXml(f.except_after.join(', '))}"`
            : '';
          return `    <do_not_use${exceptAttr}>${escapeXml(f.term)}</do_not_use>`;
        }).join("\n")
      : "";
    const termEntry = [
      `  <term canonical="${escapeXml(canonical)}" severity="${severity}">`,
      `    <source>${escapeXml(term.canonical)}</source>`,
      ...(forbiddenXml ? [forbiddenXml] : []),
      `  </term>`,
    ].join("\n");
    termXml.push(termEntry);
  }

  parts.push(
    "<glossary>",
    termXml.join("\n"),
    "</glossary>",
    "",
    "Glossary usage rules:",
    "- Use the canonical translation for each term",
    "- Never use any do_not_use alternatives",
    "- Treat the glossary's do_not_use entries as forbidden, regardless of severity (block / warn / auto-fix)",
    "- severity=block: strict brand requirement, zero exceptions",
    "- severity=warn: actively avoid all do_not_use forms; use the canonical translation except when quoting source material verbatim. Treat warn terms as near-mandatory.",
    "- severity=auto-fix: preferred form, machine-replaceable",
    "- If a do_not_use entry has except_after, the term is allowed when preceded (within ~16 chars) by one of those words (e.g., 'MQTT broker' allows 'ブローカー' after 'MQTT'). Otherwise it is forbidden.",
  );

  // Few-shot examples: take up to 3 terms that have do_not_use entries and a non-empty translation
  const exampleTerms = relevantTerms
    .filter(
      (t) => {
        const raw = t.translations[targetLang];
        return (
          (t.do_not_use?.[targetLang] ?? []).length > 0 &&
          typeof raw === "string" && raw.trim().length > 0
        );
      }
    )
    .slice(0, 3);
  if (exampleTerms.length > 0) {
    parts.push("", "Examples:");
    for (const term of exampleTerms) {
      const canonical = renderedTermCanonical(term);
      const forbidden = term.do_not_use?.[targetLang] ?? [];
      const firstEntry = forbidden.find((f) => {
        const word = typeof f === 'string' ? f : f.term;
        return word.trim().length > 0;
      });
      if (!firstEntry) continue;
      const firstForbiddenWord = typeof firstEntry === 'string' ? firstEntry : firstEntry.term;
      parts.push(
        `<example>`,
        `  <input>...${escapeXml(firstForbiddenWord)}...</input>`,
        `  <output>...${escapeXml(canonical)}...</output>`,
        `</example>`,
      );
    }
  }

  return "\n" + parts.join("\n");
}
