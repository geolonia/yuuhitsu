import { Command } from "commander";
import { writeFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import {
  initGlossary,
  checkGlossary,
  syncGlossary,
  reviewGlossary,
} from "../../tasks/glossary.js";
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
  .action(async (opts) => {
    try {
      const issues = checkGlossary(opts.input, opts.glossary, opts.lang);

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
        process.stdout.write(
          `  Line ${issue.line}: "${chalk.red(issue.forbidden)}" → use "${chalk.green(issue.canonical)}"\n`
        );
      }
      process.exit(1);
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
  .addCommand(syncCmd)
  .addCommand(reviewCmd);
