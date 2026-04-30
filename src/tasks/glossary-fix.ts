import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { loadGlossary } from "./glossary.js";
import { protectCodeBlocks, restoreCodeBlocks } from "./translate.js";

export interface GlossaryFixResult {
  replacements: number;
  changed: boolean;
}

/**
 * Apply machine replacement for severity=auto-fix terms in a document.
 * URL/URN and code blocks are protected from replacement.
 */
export function fixGlossary(
  docPath: string,
  glossaryPath: string,
  lang: string,
  dryRun = false
): GlossaryFixResult {
  const glossary = loadGlossary(glossaryPath);
  if (!glossary) {
    throw new Error(`Glossary file not found: ${glossaryPath}`);
  }

  if (!glossary.languages.includes(lang)) {
    throw new Error(
      `Language "${lang}" is not defined in glossary. Available: ${glossary.languages.join(", ")}`
    );
  }

  let docContent: string;
  try {
    docContent = readFileSync(docPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as any).code === "ENOENT") {
      throw new Error(`Document not found: ${docPath}`);
    }
    throw err;
  }

  // Protect code blocks, URLs, and URNs before replacement
  const { text: protectedContent, map: codeMap } = protectCodeBlocks(docContent);

  // Also protect URLs and URNs with placeholders (UUID suffix prevents collision with document content)
  const urlMap = new Map<string, string>();
  const urlUuid = randomUUID().replace(/-/g, "");
  let urlIndex = 0;
  const urlProtected = protectedContent.replace(/https?:\/\/\S+|urn:\S+/g, (match) => {
    const placeholder = `__YUUHITSU_URL_${urlUuid}_${urlIndex++}__`;
    urlMap.set(placeholder, match);
    return placeholder;
  });

  // Apply replacements for severity=auto-fix terms only
  const autoFixTerms = glossary.terms.filter((t) => t.severity === 'auto-fix');
  let result = urlProtected;
  let totalReplacements = 0;

  for (const term of autoFixTerms) {
    const canonicalTranslation = term.translations[lang];
    if (!canonicalTranslation) continue;

    const forbidden = term.do_not_use?.[lang] ?? [];
    for (const forbiddenWord of forbidden) {
      if (forbiddenWord.length === 0) continue;

      // Count occurrences for reporting
      let count = 0;
      const replaced = result.replace(
        new RegExp(escapeRegex(forbiddenWord), "g"),
        (match, offset) => {
          // Skip if already part of a larger ASCII identifier
          const before = offset > 0 ? result[offset - 1] : "";
          const after = result[offset + match.length];
          if (/[a-zA-Z0-9_]/.test(before) || /[a-zA-Z0-9_\-]/.test(after ?? "")) {
            return match;
          }
          // Skip if this occurrence is already part of the canonical form
          // (handles cases like forbidden="サブスク", canonical="サブスクリプション")
          const textAtPos = result.slice(offset, offset + canonicalTranslation.length);
          if (textAtPos === canonicalTranslation) {
            return match;
          }
          count++;
          return canonicalTranslation;
        }
      );
      result = replaced;
      totalReplacements += count;
    }
  }

  // Restore URL and code block placeholders
  for (const [placeholder, original] of urlMap.entries()) {
    result = result.split(placeholder).join(original);
  }
  result = restoreCodeBlocks(result, codeMap);

  const changed = result !== docContent;

  if (dryRun) {
    if (changed) {
      printDiff(docContent, result);
    }
  } else if (changed) {
    writeFileSync(docPath, result, "utf-8");
  }

  return { replacements: totalReplacements, changed };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printDiff(original: string, updated: string): void {
  const origLines = original.split("\n");
  const updLines = updated.split("\n");
  const maxLen = Math.max(origLines.length, updLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const u = updLines[i];
    if (o !== u) {
      if (o !== undefined) process.stdout.write(`- ${o}\n`);
      if (u !== undefined) process.stdout.write(`+ ${u}\n`);
    }
  }
}
