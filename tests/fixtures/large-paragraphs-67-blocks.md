# Large Document with 70+ Paragraphs for ID Boundary Testing

This document contains more than 70 paragraphs to test that the translation engine
does not hallucinate IDs beyond the batch boundary.

## Introduction

The NGSI-LD API provides a standard interface for managing context information.
This document describes the core concepts and operations available in the API.

Context information is represented as entities with attributes that carry values
and metadata. Entities are uniquely identified by their URI-based IDs.

The API supports both synchronous and asynchronous operations depending on the
complexity of the requested action and the system load at the time of the request.

Subscriptions allow clients to receive notifications when context information
changes according to specified criteria and conditions.

Temporal queries enable retrieval of historical context data with time-based
filtering and aggregation capabilities.

## Entities and Attributes

An entity is the fundamental unit of context information in NGSI-LD.
Each entity has a type, an identifier, and a set of attributes.

Entity types define the semantic category of the context information.
Types are URIs that reference ontologies or domain-specific vocabularies.

Attributes represent properties of an entity and can be of three kinds:
Property, Relationship, or TemporalProperty.

Property attributes carry a value that can be a scalar, an array, or an object.
The value type is constrained by the attribute definition in the data model.

Relationship attributes point to other entities by their identifier.
They represent associations between entities in the context information graph.

TemporalProperty attributes carry time-series data with timestamp sequences.
They enable tracking of how values change over time.

Each attribute can have metadata attached to it through sub-attributes.
Sub-attributes follow the same structure as top-level attributes.

The observedAt sub-attribute records when the observation was made.
This is distinct from the modifiedAt timestamp which records system modifications.

The unitCode sub-attribute specifies the unit of measurement for numeric values.
It follows the UNECE recommendation 20 code list for units.

The datasetId sub-attribute distinguishes between multiple concurrent instances
of the same attribute from different sources or measurement systems.

## Context and JSON-LD

JSON-LD provides the basis for the semantic interoperability of NGSI-LD.
The @context element maps terms to their full URIs in the knowledge graph.

A core context is defined and maintained by ETSI for NGSI-LD standard terms.
Implementation-specific terms extend this core context with domain vocabularies.

Context can be provided inline in the request payload or referenced by URL.
URL-based contexts are retrieved and cached by the broker implementation.

The compacted representation uses short term names from the active context.
The expanded representation uses full URIs and is provider-agnostic.

Normalized representation includes full attribute metadata and sub-attributes.
Simplified representation omits metadata for lightweight consumption.

## Queries and Filters

The system supports NGSI-LD query language for filtering entities and attributes.
Query expressions can test attribute values, types, and relationship targets.

Geo-queries allow filtering based on geographic location and spatial relationships.
Supported geometries include Point, LineString, Polygon, and their multi-variants.

Temporal queries filter based on observation timestamps and system timestamps.
The supported time intervals include after, before, between, and at operators.

Language maps allow multilingual attribute values with language-specific retrieval.
The lang parameter selects which language to return in simplified representations.

## Operations and Endpoints

Entity creation follows the POST method on the entities endpoint.
The request body must be a valid JSON-LD entity representation.

Entity retrieval uses the GET method with the entity identifier in the path.
Optional query parameters control the representation format and attribute selection.

Entity update supports both full replacement and partial modifications.
Partial update uses PATCH method to merge new attribute values with existing ones.

Entity deletion uses the DELETE method and removes the entity permanently.
Cascade deletion of related temporal data follows the broker implementation policy.

Batch operations allow processing multiple entities in a single request.
The response includes per-entity status codes for success and failure tracking.

## Subscriptions

Subscriptions define the conditions under which notifications are sent.
The subscriber specifies a notification endpoint and the relevant entity criteria.

Notification endpoints can be HTTP or MQTT depending on the subscription type.
The endpoint configuration includes authentication and retry parameters.

Subscription matching evaluates each context update against active subscriptions.
Only subscriptions with matching entity type and attribute conditions are triggered.

The throttling parameter limits the minimum time between consecutive notifications.
This prevents notification storms during rapid context updates.

Subscription lifecycle includes active, paused, and expired states.
The status transitions are managed by the broker based on configuration parameters.

## Security and Access Control

Access control in NGSI-LD relies on the underlying platform security mechanisms.
The API itself does not define authentication or authorization protocols.

Common security patterns include OAuth 2.0 bearer tokens in request headers.
API keys are supported by some broker implementations as an alternative.

Multi-tenancy isolates context data between different organizational units.
The tenant identifier is provided through request headers or URL path segments.

## Error Handling

The API returns standard HTTP status codes for success and error conditions.
Client errors use 4xx codes and server errors use 5xx codes.

Error responses include a machine-readable type URI and a human-readable detail.
The ProblemDetails format from RFC 7807 is recommended for error responses.

Rate limiting errors include Retry-After headers with the recommended wait time.
Clients should implement exponential backoff for transient error recovery.

Validation errors indicate that the request payload did not conform to the schema.
The error response includes information about which fields failed validation.

## Performance Considerations

Large result sets should use pagination through the count and offset parameters.
The Link header provides navigation to subsequent pages of results.

Projection allows clients to request only specific attributes from entities.
This reduces response size and improves performance for constrained clients.

The sysAttrs parameter controls inclusion of system-generated timestamps.
Excluding sysAttrs reduces payload size when creation times are not needed.

Connection pooling and keep-alive reduce overhead for high-frequency operations.
Clients should reuse connections rather than creating new ones for each request.

## Conclusion

The NGSI-LD API provides a comprehensive framework for context information management.
Implementation of the standard enables interoperability across different broker systems.

This document serves as a reference for understanding the core concepts and operations.
Detailed examples and use cases are available in the supplementary documentation.

## Implementation Details

The broker maintains an internal registry of all active entities and subscriptions.
The registry is updated atomically to prevent partial state during concurrent operations.

Conflict resolution follows a last-writer-wins strategy based on the modifiedAt timestamp.
Clients that need optimistic concurrency control can use ETags for conditional requests.

The API gateway performs initial authentication and rate limiting before forwarding requests.
Authenticated requests carry a signed JWT token that downstream services verify.

Load balancing across multiple broker instances uses consistent hashing on entity IDs.
This ensures that related entities are collocated on the same instance for locality.

The write-ahead log records all state changes before they are applied to main storage.
Recovery after a crash replays the log to restore the consistent state.

Read replicas serve read-only queries to reduce load on the primary broker instance.
Replication lag is monitored and alerts fire when lag exceeds the configured threshold.

In-memory indexes accelerate attribute-based query processing for common access patterns.
Index updates are applied synchronously with entity updates to maintain consistency.

The temporal database stores time-series data in columnar format for efficient range queries.
Compression is applied per column to reduce storage overhead for numeric time-series.

Geo-indexing uses a spatial data structure optimized for proximity and containment queries.
The index is updated incrementally as entities with location attributes are modified.

## Protocol Extensions

The NGSI-LD protocol supports extension points for implementation-specific capabilities.
Extensions must not conflict with the core protocol semantics or standard operation names.

Custom operation types can be registered through the extension registry mechanism.
Each extension must provide a JSON-LD context document describing its terms.

Vendor extensions are prefixed to avoid namespace collisions with future standard additions.
The prefix is registered in the extension catalog maintained by the operator community.

Protocol negotiation occurs during the initial connection setup using Accept headers.
The broker advertises its supported protocol versions in the response headers.

## Monitoring and Observability

Distributed tracing captures the full execution path of each request across services.
Trace data is exported to the configured tracing backend using OpenTelemetry.

Log correlation uses the trace ID to link log entries to the corresponding trace.
Structured logging in JSON format enables automatic parsing by log aggregation systems.

Service-level objectives define the target availability and latency for each operation.
Error budgets derived from SLOs guide decisions about maintenance and feature development.

Dashboards provide real-time visibility into entity counts, query rates, and error rates.
Alerts are configured with appropriate thresholds to detect degradation before users are impacted.

## Data Governance

Data lineage tracking records the provenance of each entity and attribute value.
The lineage graph enables auditing and debugging of complex data transformation pipelines.

Retention policies define how long different categories of data are kept in the system.
Expired data is purged automatically according to the configured retention schedule.

Data classification labels control which users and systems can access each entity.
The classification is enforced at the API level through access control policies.

Anonymization pipelines transform personally identifiable information before archival.
The anonymized archive can be used for analytics without exposing sensitive data.

## Edge Cases and Boundaries

Very large entities with hundreds of attributes are handled through streaming serialization.
The serializer avoids loading the entire entity into memory for size-bounded processing.

Deeply nested JSON values in attribute payloads have a configurable depth limit.
Payloads exceeding the depth limit are rejected with a descriptive validation error.

Circular relationships between entities are detected at subscription evaluation time.
A maximum traversal depth prevents infinite loops in relationship chain resolution.

Empty strings and null values are treated differently from absent attributes.
Explicit null values remove an attribute while absent attributes leave it unchanged.

