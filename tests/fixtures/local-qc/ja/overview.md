---
title: "AI Integration Overview"
description: "Overview of GeonicDB AI-native features"
outline: deep
---
# AI 統合

GeonicDB は、AI エージェント（Claude、GPT-4、Gemini など）が API を簡単に利用できるように、複数の AI 向けインターフェースを提供しています。

## エンドポイント一覧

| エンドポイント | 形式 | 説明 |
|---------------|------|------|
| `GET /llms.txt` | Markdown (llms.txt) | LLM 向け API ドキュメント |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling 互換スキーマ |
| `GET /.well-known/ai-plugin.json` | JSON | AI プラグインマニフェスト |
| `GET /openapi.json` | JSON | OpenAPI 3.0 仕様 |
| `GET /api.json` | JSON | API リファレンス |

## Tool Use スキーマ（`/tools.json`）

Claude Tool Use と OpenAI Function Calling に互換性のあるツール定義を提供します。

### 利用可能なツール（5 ツール）

各ツールは `action` と `resource` パラメータで操作を選択します。

| ツール名 | リソース | アクション | 説明 |
|---------|---------|-----------|------|
| `entities` | entities（デフォルト）、types、attributes | list、get、create、update、delete、replace、search_by_location、search_by_attribute、get_info、get_all、append、patch_all、patch | IoT エンティティ、タイプ、属性の管理 |
| `batch` | - | create、upsert、update、merge、delete、query、purge | 一括エンティティ操作（最大 1,000 件） |
| `temporal` | - | get、query、create、delete、add_attributes、delete_attribute、merge、modify_instance、delete_instance、batch_create、batch_upsert、batch_delete、batch_query | 時系列データ管理 |
| `config` | rules、jsonld_contexts、data_models、cadde_config | list、get、create、update、delete、activate、deactivate、list_domains、list_models、get_model、generate_template | ReactiveCore ルール、JSON-LD コンテキスト、Smart Data Models、カスタムデータモデル管理、テンプレート生成、および CADDE 設定管理 |
| `admin` | users、tenants、policies | list、get、create、update、delete、activate、deactivate、change_password | ユーザー、テナント、ポリシー管理（認証が必要） |

### NGSI-LD 属性タイプの自動検出

MCP ツールは属性値から NGSI-LD タイプを自動的に推論します：

| 値のパターン | 検出されるタイプ | 例 |
|------------|-----------|-----|
| `urn:` で始まる文字列 | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON オブジェクト（Point、Polygon、LineString、MultiPoint、MultiPolygon、MultiLineString） | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| `languageMap` フィールドを含むオブジェクト | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| その他すべての値 | `Property` | `25.5`、`"text"`、`true`、`[1, 2, 3]` |

タイプを明示的に指定することもできます：
- `{"type": "Property", "value": 25.5}`
- `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`
- `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`

## AI プラグインマニフェスト（`/.well-known/ai-plugin.json`）

AI エージェント向けの API 検出情報を提供します。

```json
{
  "schema_version": "v1",
  "name_for_human": "GeonicDB",
  "name_for_model": "geonicdb",
  "description_for_human": "FIWARE Orion-compatible Context Broker for IoT data",
  "auth": { "type": "none" },
  "api": { "type": "openapi", "url": "/openapi.json" },
  "tools": { "url": "/tools.json" }
}
```

## 使用例

### Python + Claude API

```python
import anthropic
import requests

tools = requests.get("https://geonicdb.example.com/tools.json").json()["tools"]

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-6",
    tools=tools,
    messages=[{"role": "user", "content": "温度センサーの一覧を取得してください"}]
)
```
