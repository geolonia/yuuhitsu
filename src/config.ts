import { readFileSync } from "fs";
import { parse } from "yaml";
import { config as dotenvConfig } from "dotenv";
import { join } from "path";

const SUPPORTED_PROVIDERS = ["claude", "gemini", "ollama"] as const;
export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

export interface AppConfig {
  provider: ProviderName;
  model: string;
  templates?: string;
  outputDir?: string;
  glossary?: string;
  log?: {
    enabled?: boolean;
    path?: string;
  };
}

export async function loadConfig(
  configPath: string,
  envDir?: string
): Promise<AppConfig> {
  // Load .env - from envDir if provided, otherwise from cwd
  if (envDir) {
    dotenvConfig({ path: join(envDir, ".env") });
  } else {
    dotenvConfig(); // Loads from cwd by default
  }

  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw err;
  }

  const raw = parse(content);

  if (!raw || typeof raw !== "object") {
    throw new Error("Config file is empty or invalid YAML");
  }

  const provider = raw.provider;
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported provider: "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }

  const model = raw.model;
  if (!model || typeof model !== "string") {
    throw new Error("Config must specify a model");
  }

  const config: AppConfig = {
    provider,
    model,
  };

  if (raw.templates) config.templates = raw.templates;
  if (raw.outputDir) config.outputDir = raw.outputDir;
  if (raw.glossary !== undefined) {
    if (typeof raw.glossary !== "string") {
      throw new Error('Config field "glossary" must be a string path');
    }
    config.glossary = raw.glossary;
  }
  if (raw.log) {
    config.log = {
      enabled: raw.log.enabled ?? false,
      path: raw.log.path,
    };
  }

  return config;
}
