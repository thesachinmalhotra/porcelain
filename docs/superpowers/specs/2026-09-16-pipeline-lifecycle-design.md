# Pipeline Lifecycle Design

## Goal

Give Porcelain explicit create, update, and delete operations that coordinate its durable pipeline definition with the corresponding Redpanda Connect Streams Mode stream.

## Architecture

Porcelain owns pipeline identity, metadata, desired configuration, and the explicit connectStreamId association. A small pipeline lifecycle service coordinates the existing file-backed store and Connect client; routes do not call either dependency directly. Connect remains the source of truth for runtime execution and lifecycle state.

The operation is intentionally not transactional across Porcelain and Connect. Failures are surfaced rather than hidden behind a speculative reconciliation or distributed-transaction abstraction. Runtime state continues to be observed from Connect and is not persisted.

## Lifecycle Semantics

### Create

Validate the Porcelain pipeline identity and desired configuration at the existing domain boundary, create the associated Connect stream, then persist the durable pipeline definition. A failed Connect create prevents durable creation. If Connect creation succeeds but durable persistence fails, the operation reports failure; an orphaned runtime stream is possible and is not silently represented as successful Porcelain state.

### Update

Update the associated Connect stream using the existing Connect PUT operation, because Connect defines PUT as full stream replacement with restart semantics. Only after the runtime update succeeds does Porcelain persist the new desired configuration and metadata. The connectStreamId remains stable unless explicitly changed by the lifecycle operation.

### Delete

If a pipeline has an associated Connect stream, delete that stream first. A Connect 404 for an already-missing associated stream is treated as an absent runtime, allowing durable deletion to proceed. Once the runtime deletion has succeeded or was already absent, remove the durable Porcelain pipeline.
### Publish existing authoring drafts

The authoring publish path uses the same lifecycle boundary rather than mutating Connect or the durable store itself. Before mutation, Porcelain may ask rpk connect lint for editor/preflight feedback; the Streams API remains the final runtime gate because Connect validates configurations on create/update.

Publishing an existing durable pipeline resolves its lifecycle-owned connectStreamId, updates the associated stream when present, and recreates it with POST when the runtime stream is missing. A stream that disappears between lookup and PUT is treated as a missing runtime and recreated. Only after the Connect mutation succeeds is the new durable revision persisted.

Runtime projection after publish is best-effort: failure to read the stream or its stats does not change the success of an already-completed Connect mutation.

## Boundaries

- No reconciliation daemon.
- No transaction manager.
- No command bus or generic orchestration framework.
- No runtime-state persistence.
- No new compiler, IR, adapter framework, or custom execution engine.
- Existing Connect client methods are reused; only missing capability is added if required by tests.

## Testing

Unit tests cover successful create/update/delete and Connect failure behavior through injected store/client dependencies. Existing workspace/runtime tests remain green. A real Connect Streams Mode smoke test creates, updates, reads, and deletes a stream through the lifecycle path, verifying that durable state and live runtime state remain distinct.
