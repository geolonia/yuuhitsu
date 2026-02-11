import { Command } from "commander";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";

const DEFAULT_CONFIG_TEMPLATE = `# Yuuhitsu Configuration File
# AI-powered document operations CLI
# See: https://github.com/geolonia/yuuhitsu

# AI Provider Selection
# Choose one: claude, gemini, or ollama
provider: claude

# Model Configuration
# Claude models: claude-sonnet-4-5-20250929, claude-opus-4-6-20250929, claude-haiku-4-5-20251001
# Gemini models: gemini-2.0-flash, gemini-1.5-pro
# Ollama models: llama3.2, mistral, etc. (requires local Ollama server)
model: claude-sonnet-4-5-20250929

# Example configurations for other providers:
#
# --- Claude (Anthropic) ---
# provider: claude
# model: claude-sonnet-4-5-20250929
# Requires: ANTHROPIC_API_KEY environment variable
#
# --- Gemini (Google) ---
# provider: gemini
# model: gemini-2.0-flash
# Requires: GOOGLE_API_KEY environment variable
#
# --- Ollama (Local) ---
# provider: ollama
# model: llama3.2
# Requires: Ollama server running locally (no API key needed)
# Install: https://ollama.ai

# Optional: Custom template directory
# templates: ./templates

# Optional: Default output directory
# outputDir: ./output

# Optional: Logging configuration
# log:
#   enabled: true
#   path: ./yuuhitsu.log
`;

export const initCommand = new Command("init")
  .description("Initialize a yuuhitsu config file")
  .option("--force", "Overwrite existing config file")
  .action(async (opts) => {
    const configPath = join(process.cwd(), "yuuhitsu.config.yaml");

    // Check if config already exists
    if (existsSync(configPath) && !opts.force) {
      process.stderr.write(
        chalk.red("Error:") + " Config file already exists: " + configPath + "\n" +
        chalk.yellow("Hint:") + " Use --force to overwrite the existing file\n"
      );
      process.exit(1);
    }

    // Write config file
    try {
      writeFileSync(configPath, DEFAULT_CONFIG_TEMPLATE, "utf-8");

      if (opts.force && existsSync(configPath)) {
        process.stdout.write(
          chalk.green("✓") + " Config file overwritten: " + configPath + "\n"
        );
      } else {
        process.stdout.write(
          chalk.green("✓") + " Config file created: " + configPath + "\n"
        );
      }

      process.stdout.write(
        "\n" +
        "Next steps:\n" +
        "1. Set your API key:\n" +
        "   - For Claude: export ANTHROPIC_API_KEY='your-key'\n" +
        "   - For Gemini: export GOOGLE_API_KEY='your-key'\n" +
        "   - For Ollama: Start Ollama server (ollama serve)\n" +
        "2. Run a command: yuuhitsu translate --input file.md --lang ja\n"
      );
    } catch (err: unknown) {
      process.stderr.write(
        chalk.red("Error:") + " Failed to create config file\n" +
        chalk.yellow("Hint:") + " " + (err instanceof Error ? err.message : String(err)) + "\n"
      );
      process.exit(1);
    }
  });
