import { Command } from "commander";
import { writeFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import {
  initGlossary,
  checkGlossary,
  syncGlossary,
  reviewGlossary,
  type GlossarySeverity,
  type GlossaryOutputFormat,
} from "../../tasks/glossary.js";
import { fixGlossary } from "../../tasks/glossary-fix.js";
import { formatSarif } from "../../lib/sarif-formatter.js";
import { formatError } from "../../errors.js";

// ---------------------------------------------------------------------------
// glossary init
// ---------------------------------------------------------------------------

const initCmd = new Command("init")
  .description("Generate a glossary.yaml skeleton")
  .option("--output <path>", "Output path for glossary file", "glossary.yaml")
  .option("--force", "Overwrite existing glossary file")
  .action(async (opts) => {
    const outputPath = resolve(process.cwd(), opts.output);
    try {
      initGlossary(outputPath, opts.force || undefined);
      process.stdout.write(
        `${chalk.green("✓")} Glossary file created: ${outputPath}\n`
      );
    } catch (err: unknown) {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// glossary check
// ---------------------------------------------------------------------------

const checkCmd = new Command("check")
  .description("Detect terminology inconsistencies in a document")
  .requiredOption("--input <file>", "Document file to check")
  .requiredOption("--glossary <path>", "Glossary file path")
  .requiredOption("--lang <code>", "Language code to check (e.g., ja, en)")
  .option(
    "--severity-filter <levels>",
    "Comma-separated severity levels to report (block,warn,auto-fix)"
  )
  .option("--format <format>", "Output format: text, json, sarif (default: text)", "text")
  .action(async (opts) => {
    try {
      // Validate --severity-filter values
      const validSeverityLevels: GlossarySeverity[] = ['block', 'warn', 'auto-fix'];
      if (opts.severityFilter) {
        const levels = opts.severityFilter.split(",").map((s: string) => s.trim());
        for (const level of levels) {
          if (!validSeverityLevels.includes(level as GlossarySeverity)) {
            process.stderr.write(
              `Invalid --severity-filter value '${level}'. Must be one of: block, warn, auto-fix\n`
            );
            process.exit(1);
          }
        }
      }

      // Validate --format value
      const validFormats: GlossaryOutputFormat[] = ['text', 'json', 'sarif'];
      if (!validFormats.includes(opts.format as GlossaryOutputFormat)) {
        process.stderr.write(
          `Invalid --format value '${opts.format}'. Must be one of: text, json, sarif\n`
        );
        process.exit(1);
      }

      const severityFilter = opts.severityFilter
        ? (opts.severityFilter.split(",").map((s: string) => s.trim()) as GlossarySeverity[])
        : undefined;
      const format = (opts.format || "text") as GlossaryOutputFormat;

      const issues = checkGlossary(opts.input, opts.glossary, opts.lang, {
        severityFilter,
        format,
      });

      if (format === "json") {
        process.stdout.write(JSON.stringify(issues, null, 2) + "\n");
        if (issues.length > 0) process.exit(1);
        return;
      }

      if (format === "sarif") {
        process.stdout.write(formatSarif(issues, opts.input) + "\n");
        if (issues.length > 0) process.exit(1);
        return;
      }

      // text format
      if (issues.length === 0) {
        process.stdout.write(
          `${chalk.green("✓")} No issues found in ${opts.input}\n`
        );
        return;
      }

      process.stdout.write(
        `${chalk.yellow("⚠")} Found ${issues.length} terminology issue(s) in ${opts.input}:\n\n`
      );

      for (const issue of issues) {
        const location = issue.keyPath ? issue.keyPath : `Line ${issue.line}`;
        const severityLabel = `[${issue.severity}]`;
        process.stdout.write(
          `  ${location} ${severityLabel}: "${chalk.red(issue.forbidden)}" → use "${chalk.green(issue.canonical)}"\n`
        );
      }
      process.exit(1);
    } catch (err: unknown) {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// glossary fix
// ---------------------------------------------------------------------------

const fixCmd = new Command("fix")
  .description("Auto-replace severity=auto-fix terms in a document")
  .requiredOption("--input <file>", "Document file to fix")
  .requiredOption("--glossary <path>", "Glossary file path")
  .requiredOption("--lang <code>", "Language code (e.g., ja, en)")
  .option("--dry-run", "Show diff without modifying the file")
  .action(async (opts) => {
    try {
      const result = fixGlossary(
        resolve(process.cwd(), opts.input),
        resolve(process.cwd(), opts.glossary),
        opts.lang,
        opts.dryRun ?? false
      );

      if (opts.dryRun) {
        if (!result.changed) {
          process.stdout.write(`${chalk.green("✓")} No auto-fix replacements needed.\n`);
        } else {
          process.stdout.write(
            `${chalk.yellow("⚠")} Dry-run: ${result.replacements} replacement(s) would be applied.\n`
          );
        }
      } else {
        if (!result.changed) {
          process.stdout.write(`${chalk.green("✓")} No auto-fix replacements needed.\n`);
        } else {
          process.stdout.write(
            `${chalk.green("✓")} Applied ${result.replacements} replacement(s) in ${opts.input}\n`
          );
        }
      }
    } catch (err: unknown) {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// glossary sync
// ---------------------------------------------------------------------------

const syncCmd = new Command("sync")
  .description("Sync glossary with translation files and report coverage")
  .requiredOption("--glossary <path>", "Glossary file path")
  .action(async (opts) => {
    try {
      const result = syncGlossary(opts.glossary);

      process.stdout.write(
        `${chalk.green("✓")} Glossary sync report\n\n` +
        `  Total terms: ${result.totalTerms}\n`
      );

      for (const [lang, terms] of Object.entries(result.termsByLanguage)) {
        process.stdout.write(
          `  ${lang}: ${terms.length} / ${result.totalTerms} terms translated\n`
        );
      }

      if (result.missingTranslations.length > 0) {
        process.stdout.write(
          `\n${chalk.yellow("⚠")} Missing translations:\n`
        );
        for (const missing of result.missingTranslations) {
          process.stdout.write(
            `  "${missing.canonical}" missing: ${missing.missingLanguages.join(", ")}\n`
          );
        }
      }
    } catch (err: unknown) {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// glossary review
// ---------------------------------------------------------------------------

const reviewCmd = new Command("review")
  .description("Generate a glossary review report")
  .requiredOption("--glossary <path>", "Glossary file path")
  .option("--output <path>", "Save report to file (Markdown)")
  .action(async (opts) => {
    try {
      const report = reviewGlossary(opts.glossary);
      const markdown = report.toMarkdown();

      if (opts.output) {
        writeFileSync(opts.output, markdown, "utf-8");
        process.stdout.write(
          `${chalk.green("✓")} Review report saved to ${opts.output}\n`
        );
      } else {
        process.stdout.write(markdown);
      }
    } catch (err: unknown) {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// glossary (parent command)
// ---------------------------------------------------------------------------

export const glossaryCommand = new Command("glossary")
  .description("Manage glossary for terminology consistency")
  .addCommand(initCmd)
  .addCommand(checkCmd)
  .addCommand(fixCmd)
  .addCommand(syncCmd)
  .addCommand(reviewCmd);
