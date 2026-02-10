# Quickstart: ai-provider

## Installation

```bash
npm install -g ai-provider
```

## Setup

1. Create a config file:

```bash
ai-provider init
```

This generates `ai-provider.config.yaml`:

```yaml
provider: openrouter
model: anthropic/claude-sonnet-4-5-20250929
```

2. Set your API key:

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Get your key at: https://openrouter.ai/settings/keys

## Usage

### Translate a document

```bash
ai-provider translate --input README.md --lang ja
```

### Switch to a different model

Edit `ai-provider.config.yaml`:

```yaml
provider: openrouter
model: google/gemini-2.0-flash-001
```

### Use a local model (Ollama)

1. Start Ollama: `ollama serve`
2. Pull a model: `ollama pull llama3.2`
3. Edit config:

```yaml
provider: ollama
model: llama3.2
```

4. Run the same commands — they work identically with local models.

## Dry Run

Preview what would happen without making API calls:

```bash
ai-provider translate --input README.md --lang ja --dry-run
```
