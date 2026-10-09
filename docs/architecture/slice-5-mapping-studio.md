# Slice 5 — Mapping Studio

## Purpose

Slice 5 makes a native Redpanda Connect mapping processor directly authorable and executable inside the Porcelain pipeline workspace.

The user flow is:

```
select mapping processor
        |
        v
Mapping Studio
        |
        v
Input fixture -> native mapping -> Connect result / diagnostic
```

This slice is deliberately an authoring experience, not a second transformation runtime.

## Native boundary

Porcelain delegates mapping execution to the installed Redpanda Connect CLI:

```
rpk connect blobl -i <input.jsonl> -f <mapping.blobl> --pretty
```

The adapter lives at `src/runtime/connect/bloblang.ts`.

Porcelain does **not** parse, interpret, validate, or evaluate Bloblang itself. Native Connect remains the source of truth for both successful execution and mapping diagnostics.

The server function in `src/features/pipelines/mapping-server.ts` is intentionally thin: validate the request, invoke the native adapter, and return the result or native error.

## Workspace model

Mapping Studio has three panels:

1. **Input** - a JSON event fixture used only for the current authoring session.
2. **Mapping** - the actual `mapping` or legacy `bloblang` processor configuration stored in the pipeline draft.
3. **Output** - an ephemeral result or native Connect diagnostic.

Only the mapping belongs to pipeline configuration.

The input fixture and output are not persisted as a parallel pipeline representation.

## Supported processor names

Slice 5 recognises both:

- `mapping` - current native Connect mapping processor.
- `bloblang` - compatibility path for existing configurations.

This keeps Porcelain aligned with Connect's processor evolution without forcing a migration as part of the authoring experience.

## Interaction contract

- `Ctrl/Cmd + Enter` runs the mapping.
- `Escape` returns to the topology.
- Input can be formatted or reset.
- Output can be copied.
- Native errors are displayed directly in the output panel.
- Opening Mapping Studio does not replace or mutate the persisted pipeline model beyond edits made to the mapping field.

## Event fixture semantics

Connect's `blobl` CLI consumes newline-delimited documents. The UI may therefore display readable multi-line JSON, while the native adapter parses and serialises the fixture as a single JSON document before invoking Connect.

This prevents formatting whitespace from accidentally becoming multiple input events.

## Why this architecture

### Reuse Connect instead of recreating it

Do not add:

- a Bloblang parser
- a Bloblang evaluator
- a custom AST
- a second mapping/config representation
- a fake execution engine
- a Porcelain-specific mapping test database

Those systems would drift from Connect and create a second source of truth.

### Streams Mode remains the runtime

Mapping Studio's execution path is intentionally separate from persisted pipeline runtime execution.

```
Authoring preview:
Porcelain -> rpk connect blobl -> result

Persisted runtime:
Porcelain native config -> Streams Mode -> runtime
```

Slice 5 must not turn the preview path into a substitute for Streams Mode.

## Test coverage

`tests/connect/bloblang.test.ts` exercises the installed Connect binary for:

- successful mapping execution
- native diagnostics for an invalid Bloblang method

The normal project verification suite also covers the existing authoring, runtime, publish, schema, and UI surfaces.

## Future boundaries

Durable mapping tests belong to the native Connect `test` substrate and are intentionally outside Slice 5.

Likewise, metadata-aware event testing should use Connect's native message/test model rather than introducing a Porcelain metadata protocol.

Editor intelligence should derive from the installed Connect capabilities where needed rather than maintaining a stale hand-written Bloblang catalogue.

## Verification

Slice 5 was verified against the installed managed Connect binary and project toolchain.

Expected verification:

```
mise exec -- npm run verify
git diff --check
```

The native mapping tests should execute against the configured `PORCELAIN_RPK_PATH` or the standard local `rpk` installation.
