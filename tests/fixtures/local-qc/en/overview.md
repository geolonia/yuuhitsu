---
title: "AI Integration Overview"
description: "Overview of GeonicDB AI-native features"
outline: deep
---
# AI Integration

GeonicDB provides multiple AI-oriented interfaces so that AI agents (Claude, GPT-4, Gemini, etc.) can easily consume the API.

## Endpoint List

| Endpoint | Format | Description |
|---------------|------|------|
| `GET /llms.txt` | Markdown (llms.txt) | API documentation for LLMs |
| `GET /tools.json` | JSON | Claude Tool Use / OpenAI Function Calling compatible schema |
| `GET /.well-known/ai-plugin.json` | JSON | AI plugin manifest |
| `GET /openapi.json` | JSON | OpenAPI 3.0 specification |
| `GET /api.json` | JSON | API reference |

## Tool Use Schema (`/tools.json`)

Provides tool definitions compatible with Claude Tool Use and OpenAI Function Calling.

### Available Tools (5 tools)

Each tool selects its operation via the `action` and `resource` parameters.

| Tool Name | Resource | Action | Description |
|---------|---------|-----------|------|
| `entities` | entities (default), types, attributes | list, get, create, update, delete, replace, search_by_location, search_by_attribute, get_info, get_all, append, patch_all, patch | IoT entity, type, and attribute management |
| `batch` | - | create, upsert, update, merge, delete, query, purge | Bulk entity operations (up to 1,000 items) |
| `temporal` | - | get, query, create, delete, add_attributes, delete_attribute, merge, modify_instance, delete_instance, batch_create, batch_upsert, batch_delete, batch_query | Time-series data management |
| `config` | rules, jsonld_contexts, data_models, cadde_config | list, get, create, update, delete, activate, deactivate, list_domains, list_models, get_model, generate_template | ReactiveCore Rules, JSON-LD context, Smart Data Models, custom data model management, template generation, and CADDE configuration management |
| `admin` | users, tenants, policies | list, get, create, update, delete, activate, deactivate, change_password | User, tenant, and policy management (authentication required) |

### Automatic NGSI-LD Attribute Type Detection

MCP tools automatically infer the NGSI-LD type from attribute values:

| Value Pattern | Detected Type | Example |
|------------|-----------|-----|
| String starting with `urn:` | `Relationship` | `"urn:ngsi-ld:Building:001"` |
| GeoJSON object (Point, Polygon, LineString, MultiPoint, MultiPolygon, MultiLineString) | `GeoProperty` | `{"type": "Point", "coordinates": [139.7, 35.6]}` |
| Object containing a `languageMap` field | `LanguageProperty` | `{"languageMap": {"en": "Hello", "ja": "こんにちは"}}` |
| All other values | `Property` | `25.5`, `"text"`, `true`, `[1, 2, 3]` |

You can also specify the type explicitly:
- `{"type": "Property", "value": 25.5}`
- `{"type": "Relationship", "object": "urn:ngsi-ld:Building:001"}`
- `{"type": "GeoProperty", "value": {"type": "Point", "coordinates": [139.7, 35.6]}}`

## AI Plugin Manifest (`/.well-known/ai-plugin.json`)

Provides API discovery information for AI agents.

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

## Usage Examples

### Python + Claude API

```python
import anthropic
import requests

tools = requests.get("https://geonicdb.example.com/tools.json").json()["tools"]

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-6",
    tools=tools,
    messages=[{"role": "user", "content": "Get a list of temperature sensors"}]
)
```
