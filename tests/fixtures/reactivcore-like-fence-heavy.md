# ReactiveCore Rules Reference

This document describes the reactive processing rules for the ReactiveCore engine.
Each rule specifies a trigger condition and the corresponding action to perform.

## Rule Format

All rules follow a YAML-based configuration format.
Rules are evaluated in priority order from highest to lowest.

```yaml
rule:
  id: EXAMPLE_RULE
  priority: 100
  trigger:
    type: event
    name: data_received
  action:
    type: transform
    config:
      format: json
```

## Basic Rules

### Rule R001: Data Validation

This rule validates incoming data against the schema definition.
Invalid data is rejected with an error response.

```yaml
rule:
  id: R001
  priority: 100
  trigger:
    type: event
    name: data_received
  action:
    type: validate
    schema: data-schema-v1
```

```json
{
  "rule": "R001",
  "status": "active",
  "errorAction": "reject"
}
```

### Rule R002: Data Transformation

This rule transforms the input data format into the internal representation.
The transformation is applied before any downstream processing.

```yaml
rule:
  id: R002
  priority: 90
  trigger:
    type: event
    name: validation_passed
  action:
    type: transform
    mapping: transform-map-v1
```

```bash
# Apply transformation rule
yuuhitsu transform --rule R002 --input data.json --output transformed.json
```

### Rule R003: Routing

This rule routes the transformed data to the appropriate processing pipeline.
The routing decision is based on the data type and source system.

```yaml
rule:
  id: R003
  priority: 80
  trigger:
    type: event
    name: transformation_complete
  action:
    type: route
    destinations:
      - pipeline: main-pipeline
        condition: "type == 'primary'"
      - pipeline: secondary-pipeline
        condition: "type == 'secondary'"
```

```json
{
  "routing": {
    "strategy": "content-based",
    "defaultPipeline": "main-pipeline"
  }
}
```

## Advanced Rules

### Rule R004: Aggregation

The aggregation rule combines multiple data points into a summary.
Aggregation windows are configurable in terms of time and count.

```yaml
rule:
  id: R004
  priority: 70
  trigger:
    type: window
    size: 60
    unit: seconds
  action:
    type: aggregate
    functions:
      - name: count
        field: events
      - name: sum
        field: value
      - name: avg
        field: value
```

```javascript
// Aggregation result structure
const aggregationResult = {
  windowStart: "2024-01-01T00:00:00Z",
  windowEnd: "2024-01-01T00:01:00Z",
  count: 150,
  sum: 7350,
  avg: 49.0
};
```

### Rule R005: Filtering

This rule filters out data that does not meet the quality threshold.
Filtered data is sent to the dead letter queue for manual review.

```yaml
rule:
  id: R005
  priority: 60
  trigger:
    type: event
    name: aggregation_complete
  action:
    type: filter
    conditions:
      - field: quality_score
        operator: gte
        value: 0.85
    rejectAction:
      type: queue
      name: dead-letter-queue
```

```python
# Quality score calculation
def calculate_quality_score(data):
    completeness = check_completeness(data)
    accuracy = check_accuracy(data)
    timeliness = check_timeliness(data)
    return (completeness + accuracy + timeliness) / 3
```

### Rule R006: Enrichment

The enrichment rule adds metadata from external reference data.
Reference data is cached in memory for performance optimization.

```yaml
rule:
  id: R006
  priority: 50
  trigger:
    type: event
    name: filter_passed
  action:
    type: enrich
    sources:
      - type: cache
        name: reference-data-cache
        key: "${data.entity_id}"
      - type: api
        endpoint: "https://api.example.com/metadata/${data.entity_id}"
        timeout: 5000
```

```typescript
interface EnrichmentConfig {
  sources: Array<{
    type: 'cache' | 'api' | 'database';
    name?: string;
    endpoint?: string;
    timeout?: number;
    key?: string;
  }>;
  mergeStrategy: 'merge' | 'replace' | 'ignore';
}
```

## Persistence Rules

### Rule R007: Storage

This rule persists the enriched data to the primary datastore.
Write operations use atomic transactions to ensure consistency.

```yaml
rule:
  id: R007
  priority: 40
  trigger:
    type: event
    name: enrichment_complete
  action:
    type: store
    target:
      type: database
      name: primary-db
      table: processed_events
    options:
      upsert: true
      conflict_key: entity_id
```

```sql
-- Upsert processed event
INSERT INTO processed_events (entity_id, data, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (entity_id)
DO UPDATE SET
  data = EXCLUDED.data,
  updated_at = EXCLUDED.updated_at;
```

### Rule R008: Caching

This rule updates the distributed cache with the latest processed data.
Cache entries have a configurable time-to-live for freshness management.

```yaml
rule:
  id: R008
  priority: 35
  trigger:
    type: event
    name: storage_complete
  action:
    type: cache
    target:
      type: redis
      cluster: main-cache
      key: "entity:${data.entity_id}"
      ttl: 3600
```

```bash
# Redis cache verification
redis-cli GET "entity:example-id-001"
redis-cli TTL "entity:example-id-001"
```

## Notification Rules

### Rule R009: Subscription Notifications

This rule sends notifications to active subscriptions matching the updated entity.
Notification delivery is guaranteed through a persistent message queue.

```yaml
rule:
  id: R009
  priority: 30
  trigger:
    type: event
    name: cache_updated
  action:
    type: notify
    subscriptionStore: subscription-db
    notificationEndpoint:
      type: http
      method: POST
      timeout: 10000
    retryPolicy:
      maxAttempts: 3
      backoffMs: 1000
```

```json
{
  "notification": {
    "id": "notif-001",
    "subscriptionId": "sub-xyz",
    "entityId": "entity-001",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {}
  }
}
```

### Rule R010: Audit Logging

The audit logging rule records all processing steps for compliance purposes.
Log entries are immutable and stored in append-only storage.

```yaml
rule:
  id: R010
  priority: 20
  trigger:
    type: all_events
  action:
    type: audit_log
    target:
      type: append_only_store
      name: audit-log
    fields:
      - timestamp
      - rule_id
      - entity_id
      - action_type
      - result
```

```python
# Audit log entry format
audit_entry = {
    "timestamp": datetime.utcnow().isoformat(),
    "rule_id": "R010",
    "entity_id": entity_id,
    "action_type": "audit",
    "result": "success",
    "checksum": compute_checksum(data)
}
```

## Error Handling Rules

### Rule R011: Retry on Transient Failure

This rule retries failed operations when a transient error is detected.
Exponential backoff is applied between retry attempts.

```yaml
rule:
  id: R011
  priority: 10
  trigger:
    type: error
    codes:
      - TRANSIENT_FAILURE
      - TIMEOUT
      - RATE_LIMIT
  action:
    type: retry
    maxAttempts: 5
    backoff:
      type: exponential
      initialMs: 500
      maxMs: 30000
```

```javascript
async function withRetry(operation, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransient(error) || attempt === maxAttempts) throw error;
      await sleep(Math.min(500 * Math.pow(2, attempt - 1), 30000));
    }
  }
}
```

### Rule R012: Dead Letter Queue

This rule sends permanently failed events to the dead letter queue.
Operations team reviews dead letter queue entries for manual processing.

```yaml
rule:
  id: R012
  priority: 5
  trigger:
    type: error
    codes:
      - PERMANENT_FAILURE
      - MAX_RETRIES_EXCEEDED
      - VALIDATION_ERROR
  action:
    type: dead_letter
    queue: dlq-main
    enrichments:
      - field: failure_reason
      - field: attempt_count
      - field: first_attempt_at
      - field: last_attempt_at
```

```bash
# Check dead letter queue depth
kubectl exec -n processing deployment/rule-engine -- \
  queue inspect dlq-main --format json | jq '.depth'
```

## Configuration Reference

The rule engine configuration is specified in the main configuration file.
All rules are hot-reloadable without service restart.

```yaml
engine:
  version: "2.0"
  rules_dir: /etc/rules/
  reload_interval: 30
  metrics:
    enabled: true
    port: 9090
  tracing:
    enabled: true
    endpoint: jaeger:14268
```

```json
{
  "engine": {
    "maxConcurrentRules": 100,
    "defaultTimeout": 30000,
    "circuitBreaker": {
      "enabled": true,
      "threshold": 0.5,
      "windowMs": 60000
    }
  }
}
```

## Deployment Guide

The rule engine can be deployed as a standalone service or embedded component.
Container-based deployment is recommended for production environments.

```bash
# Build and deploy rule engine
docker build -t rule-engine:2.0 .
docker push registry.example.com/rule-engine:2.0
kubectl apply -f deployment/rule-engine.yaml
```

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rule-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rule-engine
  template:
    spec:
      containers:
        - name: rule-engine
          image: registry.example.com/rule-engine:2.0
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
```

The rule engine supports horizontal scaling through the replica count configuration.
All instances share the same rule definitions through the distributed configuration store.

Health checks are configured through liveness and readiness probes.
The rule engine exposes a metrics endpoint compatible with Prometheus scraping.

## Summary

The ReactiveCore rule engine provides a flexible framework for event-driven processing.
Rules can be composed into complex processing pipelines through trigger chaining.

Configuration changes take effect within the reload interval without service interruption.
The audit logging and dead letter queue ensure full observability of the processing flow.

## Extended Rule Set

### Rule R013: Data Compression

Large payloads above the threshold size are compressed before storage.
Compression reduces storage costs and network transfer time.

```yaml
rule:
  id: R013
  priority: 45
  trigger:
    type: event
    name: storage_prepare
  action:
    type: compress
    algorithm: gzip
    threshold_bytes: 10240
```

```json
{
  "compression": {
    "algorithm": "gzip",
    "level": 6,
    "minSavings": 0.1
  }
}
```

### Rule R014: Schema Evolution

This rule handles backward-compatible schema evolution for incoming data.
Old schema versions are automatically migrated to the current version.

```yaml
rule:
  id: R014
  priority: 95
  trigger:
    type: event
    name: data_received
    condition: "schema_version < current_version"
  action:
    type: migrate
    migrations:
      - from: v1
        to: v2
        transform: migration-v1-to-v2
      - from: v2
        to: v3
        transform: migration-v2-to-v3
```

```typescript
async function migrateSchema(data: Record<string, unknown>, targetVersion: string) {
  const chain = buildMigrationChain(data.schemaVersion as string, targetVersion);
  return chain.reduce(async (acc, migration) => migration.apply(await acc), Promise.resolve(data));
}
```

### Rule R015: Rate Limiting

The rate limiting rule enforces per-source request quotas.
Requests exceeding the limit are queued or rejected based on configuration.

```yaml
rule:
  id: R015
  priority: 99
  trigger:
    type: event
    name: request_received
  action:
    type: rate_limit
    window: 60
    max_requests: 1000
    key: "${source.id}"
    overflow: queue
```

```bash
# Check rate limit status
curl -s http://rule-engine:8080/api/rate-limits/source-001 | jq '.remaining'
```

```json
{
  "source": "source-001",
  "limit": 1000,
  "remaining": 847,
  "resetAt": "2024-01-01T12:01:00Z"
}
```

### Rule R016: Circuit Breaker

This rule implements the circuit breaker pattern for downstream calls.
Open circuit prevents cascading failures when downstream services are unhealthy.

```yaml
rule:
  id: R016
  priority: 15
  trigger:
    type: error
    codes:
      - DOWNSTREAM_TIMEOUT
      - DOWNSTREAM_ERROR
  action:
    type: circuit_breaker
    states:
      closed:
        threshold: 5
        window: 60
      open:
        duration: 30
      half_open:
        probe_interval: 10
```

```python
class CircuitBreaker:
    def __init__(self, threshold: int, window: int, open_duration: int):
        self.threshold = threshold
        self.window = window
        self.open_duration = open_duration
        self.failures: list[float] = []
        self.state = "closed"
        self.opened_at: float | None = None
```

### Rule R017: Idempotency Check

Duplicate events are detected and rejected to ensure idempotent processing.
The deduplication window is configurable per event type.

```yaml
rule:
  id: R017
  priority: 98
  trigger:
    type: event
    name: data_received
  action:
    type: dedup
    store:
      type: redis
      key: "dedup:${event.id}"
      ttl: 86400
    onDuplicate: ignore
```

```sql
-- Idempotency tracking table
CREATE TABLE processed_event_ids (
    event_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_id VARCHAR(255) NOT NULL
);
CREATE INDEX ON processed_event_ids (processed_at);
```

### Rule R018: Metric Collection

All rule execution metrics are collected for observability and alerting.
Metrics are exported to the configured time-series database.

```yaml
rule:
  id: R018
  priority: 1
  trigger:
    type: all_events
  action:
    type: collect_metrics
    metrics:
      - name: rule_execution_duration_ms
        type: histogram
      - name: rule_execution_total
        type: counter
        labels:
          - rule_id
          - status
```

```bash
# Query rule execution metrics
curl -s "http://prometheus:9090/api/v1/query" \
  --data-urlencode 'query=rate(rule_execution_total{status="success"}[5m])' | \
  jq '.data.result'
```

### Rule R019: Data Masking

Sensitive fields are masked before data leaves the trusted processing zone.
Masking is applied based on field classification and destination policy.

```yaml
rule:
  id: R019
  priority: 25
  trigger:
    type: event
    name: pre_export
  action:
    type: mask
    fields:
      - path: "$.personal.email"
        method: hash
        algorithm: sha256
      - path: "$.payment.card_number"
        method: truncate
        keepLast: 4
```

```typescript
type MaskingMethod = 'hash' | 'truncate' | 'redact' | 'tokenize';

interface FieldMasking {
  path: string;
  method: MaskingMethod;
  algorithm?: string;
  keepFirst?: number;
  keepLast?: number;
}
```

### Rule R020: Batch Export

Processed data is exported in configurable batch sizes to downstream systems.
The export scheduler respects downstream system capacity limits.

```yaml
rule:
  id: R020
  priority: 8
  trigger:
    type: schedule
    cron: "0 * * * *"
  action:
    type: batch_export
    destination:
      type: s3
      bucket: data-exports
      prefix: "processed/"
      format: parquet
    batch_size: 10000
```

```python
# Batch export implementation
async def export_batch(records: list[dict], destination: S3Config) -> ExportResult:
    buffer = BytesIO()
    write_parquet(buffer, records, schema=export_schema)
    key = f"{destination.prefix}{datetime.utcnow():%Y/%m/%d/%H%M%S}.parquet"
    await s3_client.put_object(Bucket=destination.bucket, Key=key, Body=buffer.getvalue())
    return ExportResult(count=len(records), key=key)
```


### Rule R021: Health Monitor

This rule monitors the health status of all registered downstream services.
Unhealthy services trigger circuit breaker activation and alert notifications.

```yaml
rule:
  id: R021
  priority: 2
  trigger:
    type: schedule
    interval: 30
    unit: seconds
  action:
    type: health_check
    targets:
      - name: primary-db
        endpoint: "jdbc:postgresql://db:5432/events"
        timeout: 3000
      - name: cache
        endpoint: "redis://cache:6379"
        timeout: 1000
```

```bash
# Health check endpoint
curl -s http://rule-engine:8080/health | jq '.'
```

### Rule R022: Configuration Reload

This rule detects configuration file changes and reloads the rule set.
Validation ensures only syntactically correct rules are activated.

```yaml
rule:
  id: R022
  priority: 3
  trigger:
    type: file_watch
    path: /etc/rules/
    events:
      - create
      - modify
      - delete
  action:
    type: reload_config
    validation:
      enabled: true
      dry_run: true
```

```json
{
  "reload": {
    "success": true,
    "rulesLoaded": 22,
    "rulesRemoved": 0,
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

