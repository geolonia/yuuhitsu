import fg from "fast-glob";
import { dirname, join, relative, parse } from "path";
import { mkdirSync } from "fs";
import chalk from "chalk";
import type { AIProvider } from "../provider/index.js";
import { translateFile } from "./translate.js";

export interface BatchProgress {
  total: number;
  current: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface BatchTranslateOptions {
  pattern: string;
  targetLang: string;
  provider: AIProvider;
  outputDir?: string;
  inputBase?: string;
  onProgress?: (progress: BatchProgress) => void;
  dryRun: boolean;
  verbose?: boolean;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Check if a string contains glob pattern characters
 */
export function isGlobPattern(input: string): boolean {
  return /[*?[\]{}]/.test(input);
}

/**
 * Generate output path for a translated file
 */
export function generateOutputPath(opts: {
  inputPath: string;
  targetLang: string;
  outputDir?: string;
  inputBase?: string;
  explicitOutput?: string;
}): string {
  const { inputPath, targetLang, outputDir, inputBase, explicitOutput } = opts;

  // If explicit output is provided, use it
  if (explicitOutput) {
    return explicitOutput;
  }

  // If outputDir is provided, preserve directory structure
  if (outputDir && inputBase) {
    const relativePath = relative(inputBase, inputPath);
    return join(outputDir, relativePath);
  }

  // Default: add language code before extension
  const parsed = parse(inputPath);
  const ext = parsed.ext || "";
  const base = parsed.name;
  const dir = parsed.dir;

  return join(dir, `${base}.${targetLang}${ext}`);
}

/**
 * Determine the base path for --input-dir calculation
 */
function determineInputBase(pattern: string, matchedFiles: string[]): string | undefined {
  // Extract the static prefix from the glob pattern
  // e.g., "docs/en/**/*.md" -> "docs/en"
  const staticPrefix = pattern.split(/[*?[\]{}]/)[0];

  // If there's a static directory prefix, use it
  if (staticPrefix && staticPrefix.includes("/")) {
    // Remove trailing slash and return as-is (it's already a directory path)
    return staticPrefix.replace(/\/$/, "");
  }

  // If no static prefix, find common base from matched files
  if (matchedFiles.length === 0) {
    return undefined;
  }

  // Find the common directory prefix of all matched files
  const dirs = matchedFiles.map(f => dirname(f));
  const commonDir = dirs.reduce((acc, dir) => {
    if (!acc) return dir;

    const accParts = acc.split("/");
    const dirParts = dir.split("/");
    const common: string[] = [];

    for (let i = 0; i < Math.min(accParts.length, dirParts.length); i++) {
      if (accParts[i] === dirParts[i]) {
        common.push(accParts[i]);
      } else {
        break;
      }
    }

    return common.join("/") || ".";
  });

  return commonDir === "." ? undefined : commonDir;
}

/**
 * Execute batch translation
 */
export async function batchTranslate(
  opts: BatchTranslateOptions
): Promise<BatchResult> {
  const { pattern, targetLang, provider, outputDir, onProgress, dryRun, verbose } = opts;

  // Match files using fast-glob
  const matchedFiles = await fg(pattern, {
    onlyFiles: true,
    absolute: false,
  });

  if (matchedFiles.length === 0) {
    throw new Error(`No files matched pattern: ${pattern}`);
  }

  // Determine input base for directory structure preservation
  const inputBase = outputDir ? determineInputBase(pattern, matchedFiles) : undefined;

  // Initialize progress
  const progress: BatchProgress = {
    total: matchedFiles.length,
    current: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  const errors: Array<{ file: string; error: string }> = [];

  // Process each file
  for (let i = 0; i < matchedFiles.length; i++) {
    const inputPath = matchedFiles[i];
    progress.current = i + 1;

    const outputPath = generateOutputPath({
      inputPath,
      targetLang,
      outputDir,
      inputBase,
    });

    // Show progress
    const progressPrefix = chalk.cyan(`[${progress.current}/${progress.total}]`);

    if (dryRun) {
      process.stdout.write(
        `${progressPrefix} Would translate:\n` +
        `  Input:  ${inputPath}\n` +
        `  Output: ${outputPath}\n`
      );
      progress.succeeded++;
    } else {
      try {
        process.stdout.write(
          `${progressPrefix} Translating ${inputPath}...\n`
        );

        // Ensure output directory exists
        const outputDirPath = dirname(outputPath);
        mkdirSync(outputDirPath, { recursive: true });

        // Translate the file
        const result = await translateFile({
          provider,
          inputPath,
          outputPath,
          targetLang,
        });

        process.stdout.write(
          `${chalk.green("✓")} Translated to ${result.outputPath}\n` +
          (verbose ? `  Tokens: ${result.usage.totalTokens} (${result.chunks} chunk${result.chunks > 1 ? "s" : ""})\n` : "")
        );

        progress.succeeded++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `${chalk.red("✗")} Failed to translate ${inputPath}: ${errorMsg}\n`
        );

        errors.push({ file: inputPath, error: errorMsg });
        progress.failed++;
      }
    }

    // Call progress callback
    if (onProgress) {
      onProgress(progress);
    }
  }

  // Print summary
  const summaryColor = progress.failed > 0 ? chalk.yellow : chalk.green;
  process.stdout.write(
    `\n` +
    summaryColor("Summary:\n") +
    `  Total:     ${progress.total}\n` +
    `  Succeeded: ${progress.succeeded}\n` +
    `  Failed:    ${progress.failed}\n`
  );

  if (errors.length > 0) {
    process.stderr.write(
      `\n${chalk.red("Errors:")}\n` +
      errors.map(e => `  ${e.file}: ${e.error}`).join("\n") + "\n"
    );
  }

  return {
    total: progress.total,
    succeeded: progress.succeeded,
    failed: progress.failed,
    errors,
  };
}
