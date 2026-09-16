# Pipeline Authoring Boundary Design

**Date:** 2026-09-16

## Goal

Give Porcelain a small, explicit authoring model for an executable pipeline and a deterministic boundary that produces the native Redpanda Connect stream configuration consumed by the existing lifecycle service.

## Scope

This slice proves the complete authoring path with three representative native Connect components:

- input: `generate`
- processor: `bloblang`
- output: `drop`

The authoring model is intentionally small. It is not a new pipeline language, compiler, IR, connector framework, or execution engine.

## Architecture

The flow is:

```text
Porcelain authoring definition
  input
  buffer?
  processors[]
  output
        |
        v
Connect config mapping boundary
        |
        v
Pipeline lifecycle service
        |
        v
Redpanda Connect Streams API
```

`PipelineDefinition.desiredConfig` remains the Connect-native configuration stored by the existing durable domain. The new authoring boundary constructs that value rather than introducing a second persistent representation.

The lifecycle service remains the only boundary used to create, update, and delete runtime streams. Authoring does not call Connect directly.

## Data Model

Add an authoring type with the following shape:

```ts
export type PipelineAuthoring = {
  id: string
  name: string
  metadata?: Record<string, unknown>
  input: Record<string, unknown>
  buffer?: Record<string, unknown>
  processors?: Array<Record<string, unknown>>
  output: Record<string, unknown>
}
```

The authoring shape is intentionally close to Connect's stream structure. Component objects are opaque Connect-native component configurations; Porcelain does not reinterpret their internals.

The mapping is deterministic:

```ts
{
  input: authoring.input,
  ...(authoring.buffer ? { buffer: authoring.buffer } : {}),
  ...(authoring.processors?.length ? { pipeline: { processors: authoring.processors } } : {}),
  output: authoring.output,
}
```

`id`, `name`, and `metadata` are Porcelain domain fields and do not enter the Connect stream config.

## Validation

Perform only structural authoring validation that Porcelain can state without duplicating Connect's component validator:

- `id` and `name` are non-empty strings.
- `input` and `output` are present objects.
- `buffer`, when present, is an object.
- every processor is an object.

Connect remains authoritative for component-specific configuration. Invalid native configuration is surfaced through the existing Connect request error path, including its HTTP status. No local catalogue of all Connect components is introduced.

## Lifecycle Integration

Expose a small authoring operation that builds a `PipelineDefinition` and delegates to the existing lifecycle service. It must preserve the existing ordering guarantees:

- create: Connect create first, then durable store create
- update: Connect update first, then durable store update
- delete: Connect delete first, then durable store delete; an already-missing Connect stream is treated as gone

Authoring must not bypass those guarantees.

## Tests

1. Deterministic mapping from authoring definition to Connect config.
2. Structural validation failures.
3. Authoring operation delegates the mapped config to lifecycle and persists the resulting durable definition.
4. Real Connect integration: create an authored `generate -> mapping -> drop` pipeline, read it back from Connect, update its config, observe the changed config, then delete it.
5. Existing test suite, typecheck, production build, and diff checks remain green.

## Explicit Non-Goals

- visual node editor
- schema-driven forms
- component discovery/catalogue
- every Connect component
- resource authoring
- secrets management
- reconciliation/controller loop
- SQLite migration
- custom DSL, IR, compiler, or runtime
- Connect config interpolation semantics

## Exit Criterion

A Porcelain caller (including a server/UI caller) can express a minimal pipeline without hand-building the Connect `pipeline` wrapper, create it through the existing lifecycle boundary, observe the real stream, update it, and delete it. At that point backend architecture stops and UI/UX work can begin.
