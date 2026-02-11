#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { formatError } from "../errors.js";
import { translateCommand } from "./commands/translate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "../../package.json"), "utf-8")
    );
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("ai-provider")
  .description(
    "AI Provider Abstraction Layer - unified CLI for AI-powered document operations"
  )
  .version(getVersion())
  .option("--config <path>", "Config file path", "./ai-provider.config.yaml")
  .option("--dry-run", "Show what would be done without making API calls")
  .option("--verbose", "Enable verbose output");

// Register commands
program.addCommand(translateCommand);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(formatError(err) + "\n");
  process.exit(1);
});

export { program };
