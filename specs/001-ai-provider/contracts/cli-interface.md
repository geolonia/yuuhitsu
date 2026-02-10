# CLI Interface Contract

## Commands

### Global Options

```
ai-provider [command] [options]

Global Options:
  --config <path>    Config file path (default: ./ai-provider.config.yaml)
  --dry-run          Show what would be done without making API calls
  --verbose          Enable verbose output
  --version          Show version
  --help             Show help
```

### translate

```
ai-provider translate --input <file> --lang <code> [--output <file>]

Options:
  --input   <file>   Input Markdown file (required)
  --lang    <code>   Target language code, e.g., ja, en, zh, ko (required)
  --output  <file>   Output file path (default: <input>.<lang>.md)
```

**Exit codes**: 0 = success, 1 = error

### generate-docs

```
ai-provider generate-docs --input <file> [--format <format>] [--output <file>]

Options:
  --input   <file>     Source file (required)
  --format  <format>   Output format: vitepress, markdown (default: markdown)
  --output  <file>     Output file path (default: stdout)
```

### sync-docs

```
ai-provider sync-docs --input <path> --output <path>

Options:
  --input   <path>   Input file or directory (required)
  --output  <path>   Output file or directory (required)
```

### research

```
ai-provider research --query <text> [--output <file>]

Options:
  --query   <text>   Research query (required)
  --output  <file>   Output file path (default: stdout)
```

### fix-links

```
ai-provider fix-links --input <path> [--check-external] [--fix]

Options:
  --input           <path>   Input file or directory (required)
  --check-external           Also verify external URLs via HTTP HEAD
  --fix                      Apply fixes (default: report only)
```

### generate-tests

```
ai-provider generate-tests --input <file> [--framework <name>] [--output <file>]

Options:
  --input      <file>   Source file (required)
  --framework  <name>   Test framework: vitest, jest (default: vitest)
  --output     <file>   Output test file path (default: <input>.test.<ext>)
```

### init

```
ai-provider init [--provider <name>]

Options:
  --provider  <name>   Default provider: openrouter, ollama (default: openrouter)
```

Generates `ai-provider.config.yaml` with commented examples.

## Error Output Format

All errors are written to stderr in the format:

```
Error: <human-readable message>

Hint: <actionable suggestion>
```

Example:
```
Error: OPENROUTER_API_KEY environment variable is not set.

Hint: Get your API key at https://openrouter.ai/settings/keys and run:
  export OPENROUTER_API_KEY=sk-or-v1-...
```
