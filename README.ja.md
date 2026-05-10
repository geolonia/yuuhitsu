# yuuhitsu (右筆)

AI を活用したドキュメント操作 CLI

## 概要

**yuuhitsu**（右筆、封建時代の日本で「秘書」や「書記」を意味する）は、AI を使用してドキュメント操作を自動化するコマンドラインツールです。この名前は、封建領主に仕え、公式文書の執筆・管理を代行した書記に由来しています — このツールはエンジニアに対して同様の役割を果たし、翻訳、ドキュメント生成、ドキュメント同期を担います。

### 主な機能

* **Markdown 翻訳**：構造、コードブロック、フォーマットを保持しながらドキュメントを翻訳
* **用語集管理**：プロジェクトレベルの用語集により、すべての翻訳で一貫した用語を維持
* **マルチプロバイダー対応**：設定ファイルの 1 行を変更するだけで、Claude（Anthropic）、Gemini（Google）、Ollama（ローカル）を切り替え可能
* **ローカル品質管理**：構文チェック、意味チェック、LLM ジャッジチェックによる公開前の自動 QC
* **ドライランモード**：API 呼び出しを行わずに操作のプレビューが可能

## 機能

### 翻訳

yuuhitsu は AST（remark）パイプラインを使用して、段落レベルで Markdown ドキュメントを翻訳します：

1. **解析** — remark が Markdown を mdast AST に解析します
2. **抽出** — `extractBlockNodes()` が段落全体と見出しノードを Markdown 単位として収集し、各ブロック内のインライン要素（コードスパン、太字、斜体、リンク）を保持します
3. **バッチ処理** — ノードは推定トークン数に基づいて API バッチにグループ化されます（`--max-tokens-per-batch`、デフォルト：4000 文字 ÷ 4）
4. **翻訳** — Claude の構造化出力（tool\_use）は 1:1 の ID マッピングが保証された JSON レスポンスを返します；Gemini と Ollama はテキストモードの JSON を使用します
5. **適用** — 翻訳されたテキストは remark を通じて再解析され、AST に書き戻されます；その後、ドキュメント全体がシリアライズされます

**なぜ段落レベルのチャンクなのか？**

以前のリリース（0.1.x）ではテキストをインライン要素の境界で分割していました — たとえば、`"When \`AUTH\_ENABLED=true\`, a token is required."`を`"When "`と`", a token is required."`に分割するなどです。LLM は各フラグメントのコンテキストを持たず、英語と日本語の混在、フレーズの重複、意味の逆転などの問題が生じました。段落レベルのチャンク処理（0.3.0）により、このクラスのエラーが解消されます。

**保持されるもの（LLM に送信されないもの）：**

* フェンスコードブロック（` ``` `...` ``` `）：AST によってそのまま保持
* インラインコード（`` `...` ``）：各段落ブロック内で保持
* ドキュメント構造（見出し、リスト、テーブル、HR、リンク）：AST のラウンドトリップによって確定的に処理

### 用語集の管理

プロジェクトレベルの用語集を管理して、すべての翻訳にわたって一貫した用語を徹底します。

* **`glossary init`**：サンプル用語を含む `glossary.yaml` のスケルトンを生成します
* **`glossary check`**：ドキュメント内の禁止用語や不整合な用語を検出します — Markdown（`.md`）と JSON i18n ファイル（`.json`）をサポート；違反は行番号またはキーパスとともに報告されます
* **`glossary fix`**：ドキュメント内の `severity: auto-fix` 用語を自動置換します
* **`glossary sync`**：設定されたすべての言語における翻訳カバレッジをレポートし、欠落エントリのスタブを作成します
* **`glossary review`**：すべての用語集の用語とその翻訳の Markdown レポートを生成します

`yuuhitsu.config.yaml` に `glossary` のパスが設定されている場合、`translate` コマンドは自動的に用語集を AI プロンプトに注入し、正規の用語が使用され、禁止されたバリアントが回避されることを保証します。

**重大度レベル**（`glossary.yaml` で用語ごとに設定）：

| Level      | Behaviour                                  |
| ---------- | ------------------------------------------ |
| `block`    | Hard error — CI fails                      |
| `warn`     | Warning — CI passes, human review required |
| `auto-fix` | Automatically replaced by `glossary fix`   |

### ローカル品質管理

yuuhitsu には公開前 QC スクリプト（`scripts/local-qc.ts`）が同梱されており、`npm publish` のたびに実際の翻訳済みフィクスチャリポジトリに対して実行されます。これにより、ユニットテストでは検出できない構文のリグレッションとセマンティックな品質低下の両方を捕捉します。

**構文チェック：**

| Check           | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| bare-fence      | Fenced code blocks without a language tag                                            |
| five-axis       | EN/JA mix, duplicate phrase, heading integrity, anchor validity across fixture files |
| markdownlint    | Common Markdown lint rules                                                           |
| vitepress-build | VitePress build succeeds on the fixture repo                                         |

**セマンティックチェック：**

| Check             | Description                                           |
| ----------------- | ----------------------------------------------------- |
| en-ja-mix         | Paragraphs that mix English and Japanese unexpectedly |
| duplicate-phrase  | Same phrase repeated twice within one paragraph       |
| heading-integrity | Headings match between EN and JA versions             |
| anchor-validity   | Internal anchor links resolve correctly               |

**LLM ジャッジ：**

* モデル：`claude-sonnet-4-6`
* 閾値：フィクスチャごとの平均スコア ≥ 4.0、フィクスチャごとの最低スコア ≥ 3.5（スケール 1〜5）
* `LOCAL_QC_FIXTURE_REPO` 内のデフォルトフィクスチャファイル全 7 件をカバー

**設定：**

```bash
# Point to your translated fixture repository
export LOCAL_QC_FIXTURE_REPO=/home/user/workspace/my-docs  # default: /home/hal/workspace/geonicdb-docs

# Run QC manually
npm run local-qc

# QC runs automatically before publish
npm publish  # triggers prepublishOnly → local-qc.ts
```

QC スクリプトはすべてのプルリクエストに対して `.github/workflows/local-qc.yml` 経由で GitHub Actions CI でも実行されます。

## クイックスタート

### インストール

```bash
npm install -g @geolonia/yuuhitsu
```

### 基本的な使い方

```bash
# Translate a document to Japanese
yuuhitsu translate --input README.md --lang ja

# Translate to English
yuuhitsu translate --input docs.md --lang en --output docs.en.md

# Preview without API calls
yuuhitsu translate --input README.md --lang ja --dry-run

# Use a specific config file
yuuhitsu translate --input README.md --lang ja --config ./custom.config.yaml
```

## 設定

プロジェクトのルートに `yuuhitsu.config.yaml` ファイルを作成します：

```yaml
# AI Provider Selection
provider: claude  # Options: claude, gemini, ollama
model: claude-sonnet-4-6

# Optional Settings
outputDir: ./translated
templates: ./templates
glossary: ./glossary.yaml  # Path to glossary file (enables auto-injection during translation)
log:
  enabled: true
  path: ./yuuhitsu.log
```

### 環境変数

API 認証用の `.env` ファイルを作成するか、環境変数を設定します：

```bash
# For Claude (Anthropic) — recommended
ANTHROPIC_API_KEY=your_api_key_here

# For Gemini (Google)
GOOGLE_API_KEY=your_api_key_here

# Ollama requires no API key (runs locally)

# For Local QC
LOCAL_QC_FIXTURE_REPO=/path/to/your/translated-docs-repo
```

### サポートされているプロバイダー

| Provider | SDK                   | Environment Variable | Use Case                                    |
| -------- | --------------------- | -------------------- | ------------------------------------------- |
| Claude   | `@anthropic-ai/sdk`   | `ANTHROPIC_API_KEY`  | High-quality translation, structured output |
| Gemini   | `@google/genai`       | `GOOGLE_API_KEY`     | Fast processing, cost-effective             |
| Ollama   | `openai` (compatible) | *(none)*             | Local execution, privacy, offline use       |

## コマンド

### `translate`

Markdown ドキュメントを言語間で翻訳します。

**グローバルオプション**（サブコマンドの前）：

* `--config <path>`：設定ファイルのパス（デフォルト：`./yuuhitsu.config.yaml`）
* `--dry-run`：API 呼び出しを行わずに実行内容を表示します
* `--verbose`：詳細な出力を有効にします

**オプション：**

* `--input <path>`（必須）：入力 Markdown ファイルのパスまたは glob パターン（例：`docs/en/**/*.md`）
* `--output <path>`：出力ファイルのパス（デフォルト：`<input>.<lang>.md`）
* `--output-dir <dir>`：バッチ翻訳の出力ディレクトリ（ディレクトリ構造を保持します）
* `--lang <code>`（必須）：ターゲット言語コード（例：`en`、`ja`、`zh`、`es`）
* `--max-tokens-per-batch <N>`：API バッチ呼び出しごとの推定最大トークン数（デフォルト：`4000`）。見出しが少ない大きなドキュメントの場合は増やし、API のコンテキスト制限に達した場合は減らしてください。
* `--max-chunk-lines <N>`：翻訳チャンクごとの最大行数（レガシーフォールバック；デフォルト：`150`）。AST パスがバイパスされた場合にのみ使用されます。

**単一ファイルの例：**

```bash
yuuhitsu translate \
  --input ./docs/guide.md \
  --output ./docs/guide.ja.md \
  --lang ja \
  --max-tokens-per-batch 4000
```

**バッチ翻訳の例：**

```bash
yuuhitsu translate \
  --input "docs/en/**/*.md" \
  --output-dir docs/ja \
  --lang ja
```

### `glossary`

用語の一貫性を保つためにプロジェクトの用語集を管理します。

#### `glossary init`

現在のディレクトリに `glossary.yaml` のスケルトンを生成します。

**オプション：**

* `--output <path>`：用語集ファイルの出力パス（デフォルト：`glossary.yaml`）
* `--force`：既存の用語集ファイルを上書きする

```bash
yuuhitsu glossary init
yuuhitsu glossary init --output ./docs/glossary.yaml
```

#### `glossary check`

ドキュメント内の禁止用語や不統一な用語を検出します。

Markdown（`.md`）と JSON i18n ファイル（`.json`）の両方をサポートします。`.json` ファイルを指定した場合、違反はキーパス（例：`dashboard.title`）として報告されます。

**スキップされる箇所（チェック対象外）：**

* フェンスコードブロック（` ``` `...` ``` `）
* インラインコード（`` `...` ``）
* URL（`http://` / `https://`）
* フロントマター（`---`...`---`）
* Markdown リンクの URL パス部分

**オプション：**

* `--input <file>`（必須）：チェック対象のドキュメントファイル（Markdown または JSON i18n ファイル）
* `--glossary <path>`（必須）：用語集ファイルのパス
* `--lang <code>`（必須）：チェックする言語コード（例：`ja`、`en`）
* `--severity-filter <levels>`：報告する重要度レベルをカンマ区切りで指定（例：`block,warn`）。デフォルト：全レベル。
* `--format <format>`：出力形式：`text`、`json`、`sarif`（デフォルト：`text`）

```bash
# Check a Markdown document
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja

# Check only block-level violations
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja --severity-filter block

# Output SARIF for GitHub Code Scanning
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja --format sarif

# Check a JSON i18n file
yuuhitsu glossary check --input locales/ja/common.json --glossary glossary.yaml --lang ja
```

#### `glossary fix`

ドキュメント内の `severity: auto-fix` 用語を自動置換します。

**オプション：**

* `--input <file>`（必須）：修正対象のドキュメントファイル
* `--glossary <path>`（必須）：用語集ファイルのパス
* `--lang <code>`（必須）：言語コード
* `--dry-run`：ファイルを変更せずに置換内容をプレビュー表示する

```bash
yuuhitsu glossary fix --input README.md --glossary glossary.yaml --lang ja
yuuhitsu glossary fix --input README.md --glossary glossary.yaml --lang ja --dry-run
```

#### `glossary sync`

翻訳カバレッジを報告し、不足しているエントリのスタブを作成します。

```bash
yuuhitsu glossary sync --glossary glossary.yaml
```

#### `glossary review`

すべての用語集の用語とその翻訳を Markdown レポートとして生成します。

```bash
yuuhitsu glossary review --glossary glossary.yaml
yuuhitsu glossary review --glossary glossary.yaml --output glossary-report.md
```

### 用語集ファイルのフォーマット

```yaml
version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ", "えーぴーあい"]
  - canonical: "webhook"
    type: noun
    severity: warn          # block | warn | auto-fix (default: block)
    translations:
      ja: "Webhook"
      en: "webhook"
    do_not_use:
      ja: ["ウェブフック"]
      en: ["web hook"]
```

| Field                  | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `version`              | Schema version (currently `1`)                    |
| `languages`            | List of language codes managed by this glossary   |
| `terms[].canonical`    | The authoritative (source-language) term          |
| `terms[].type`         | Term type (e.g., `noun`, `verb`)                  |
| `terms[].severity`     | `block` (default), `warn`, or `auto-fix`          |
| `terms[].translations` | Map of language code → translated term            |
| `terms[].do_not_use`   | Map of language code → list of forbidden variants |

## 開発

```bash
# Clone the repository
git clone https://github.com/geolonia/yuuhitsu.git
cd yuuhitsu

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Run locally (development)
npm run dev -- translate --input test.md --lang ja
```

### テストの実行

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Integration tests (requires ANTHROPIC_API_KEY)
npm run test:integration

# Type checking
npm run lint

# Local QC (requires LOCAL_QC_FIXTURE_REPO)
npm run local-qc
```

## 変更履歴

完全なバージョン履歴については [CHANGELOG.md](./CHANGELOG.md) を参照してください。

**0.3.0 のハイライト：**

* 段落レベルのチャンク再設計（`extractBlockNodes`） — インライン要素の分割による EN/JA の混在、重複フレーズ、意味の逆転を排除
* トークン数ベースのバッチ処理（`--max-tokens-per-batch`、デフォルト： 4000） — 行数ベースの `--max-nodes-per-batch` を置き換え
* ローカル QC（`scripts/local-qc.ts`） — prepublishOnly フック + LLM ジャッジ（`claude-sonnet-4-6`、平均 ≥ 4.0）を使用した GitHub Actions CI

## ライセンス

MIT — [LICENSE](./LICENSE) を参照

Copyright (c) 2026 Geolonia Inc.
