import { Command } from "commander";
import { existsSync } from "fs";
import chalk from "chalk";
import { loadConfig } from "../../config.js";
import { createProvider } from "../../provider/index.js";
import { translateFile } from "../../tasks/translate.js";
import { formatError, AppError } from "../../errors.js";

export const translateCommand = new Command("translate")
  .description("Translate a Markdown document to another language")
  .requiredOption("--input <file>", "Input Markdown file")
  .requiredOption("--lang <code>", "Target language code (e.g., ja, en, zh, ko)")
  .option("--output <file>", "Output file path (default: <input>.<lang>.md)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const configPath: string = globalOpts.config ?? "./ai-provider.config.yaml";
    const dryRun: boolean = globalOpts.dryRun ?? false;
    const verbose: boolean = globalOpts.verbose ?? false;

    try {
      // Validate input file exists
      if (!existsSync(opts.input)) {
        throw new AppError(
          `Input file not found: ${opts.input}`,
          "Check the file path and try again."
        );
      }

      // Load config
      const config = await loadConfig(configPath);

      if (verbose) {
        process.stderr.write(
          `${chalk.gray(`Provider: ${config.provider}, Model: ${config.model}`)}\n`
        );
      }

      // Dry-run mode
      if (dryRun) {
        const outputPath = opts.output || `${opts.input.replace(/\.md$/, "")}.${opts.lang}.md`;
        process.stdout.write(
          `${chalk.cyan("[dry-run]")} Would translate:\n` +
          `  Input:    ${opts.input}\n` +
          `  Output:   ${outputPath}\n` +
          `  Language: ${opts.lang}\n` +
          `  Provider: ${config.provider}\n` +
          `  Model:    ${config.model}\n`
        );
        return;
      }

      // Create provider
      const provider = createProvider(config.provider, config.model);

      // Execute translation
      const result = await translateFile({
        provider,
        inputPath: opts.input,
        outputPath: opts.output,
        targetLang: opts.lang,
      });

      process.stdout.write(
        `${chalk.green("✓")} Translated to ${result.outputPath}\n` +
        `  Tokens: ${result.usage.totalTokens} (${result.chunks} chunk${result.chunks > 1 ? "s" : ""})\n`
      );
    } catch (err) {
      process.stderr.write(formatError(err) + "\n");
      process.exit(1);
    }
  });
