# Durable Pipeline Domain + Runtime Association Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Porcelain a durable pipeline identity and desired configuration that can exist independently from the currently running Redpanda Connect stream, while associating live Connect runtime state when available.

**Architecture:** Porcelain owns a small file-backed durable pipeline store containing identity, metadata, desired Connect stream configuration, and the optional Connect stream association. The Connect client remains the only runtime integration; workspace reads durable pipelines and enriches them with live Connect state without reconciling or mutating Connect. Existing Connect lifecycle semantics remain owned by Connect.

**Tech Stack:** TypeScript, TanStack Start, Node.js `node:fs/promises`, Vitest, Redpanda Connect Streams Mode.

**Spec:** Approved Slice #3 — Durable Pipeline Domain + Runtime Association.

## Global Constraints

- Porcelain pipeline identity is independent from Connect stream identity.
- Initially a pipeline may map 1:1 to a Connect stream, but the domain must not require that forever.
- Pipeline data includes `id`, `name`/metadata, desired configuration, and runtime state.
- Runtime state includes `connected`, `active`, `uptime`, and `stats`.
- Connect remains responsible for execution, lifecycle, delivery semantics, component behavior, and runtime metrics.
- Do not add a reconciliation daemon.
- Do not add a compiler, IR, execution runtime, connector abstraction, or speculative repository/adapter framework.
- Preserve the existing Connect client boundary and current REST lifecycle behavior.
- Keep the implementation local-first and dependency-light; use a JSON file rather than introducing a database dependency for this slice.

---

### Task 1: Define the durable pipeline domain and store

**Files:**
- Create: `src/pipeline/store.ts`
- Create: `tests/pipeline/store.test.ts`
- Create: `.porcelain/pipelines.json` as runtime-created state only; do not commit initial state
- Modify: `.gitignore`

**Interfaces:**
- Produces `Pipeline`, `PipelineMetadata`, `PipelineRuntime`, and `PipelineRecord` domain types.
- Produces `createPipelineStore(path?)` with `list()`, `get(id)`, `create(input)`, and `update(id, input)` operations.
- The store persists desired state only; it never calls Connect.

- [ ] **Step 1: Write failing store tests**

Cover empty-store behavior, durable create/read, update preserving identity, and persistence across a newly-created store instance.

- [ ] **Step 2: Run the store tests and verify failure**

Run `mise exec -- npm test -- tests/pipeline/store.test.ts`.
Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement the minimal file-backed store**

Use `node:fs/promises` to create the parent directory, read JSON state, and write the complete state file. Keep the on-disk shape a simple `{ "pipelines": [...] }` document. Default the path to `.porcelain/pipelines.json` relative to `process.cwd()`.

- [ ] **Step 4: Ignore runtime state and run focused tests**

Add `.porcelain/` to `.gitignore`, then run `mise exec -- npm test -- tests/pipeline/store.test.ts`.
Expected: PASS.

---

### Task 2: Separate Porcelain identity from Connect runtime association

**Files:**
- Modify: `src/pipeline/pipeline.ts`
- Modify: `tests/pipeline/pipeline.test.ts`

**Interfaces:**
- `Pipeline` contains `id`, `name`, `metadata`, `desiredConfig`, `connectStreamId`, and `runtime`.
- `runtime` contains `connected`, `active`, `uptimeSeconds`, `uptime`, and `stats`.
- `pipelineFromConnectStream` becomes a runtime-enrichment helper and must not redefine the durable pipeline identity.

- [ ] **Step 1: Write failing domain mapping tests**

Add a test proving a pipeline id can differ from its Connect stream id while preserving desired configuration and exposing live runtime data. Add a test for a disconnected pipeline whose runtime has no Connect stats.

- [ ] **Step 2: Run focused tests and verify failure**

Run `mise exec -- npm test -- tests/pipeline/pipeline.test.ts`.
Expected: FAIL against the old pipeline shape.

- [ ] **Step 3: Implement the minimal domain mapping**

Keep Connect's `config` as the desired configuration when creating a pipeline from a known stream, but store the Connect stream id explicitly in `connectStreamId`. Runtime state is derived only from Connect responses.

- [ ] **Step 4: Run focused tests**

Run `mise exec -- npm test -- tests/pipeline/pipeline.test.ts`.
Expected: PASS.

---

### Task 3: Enrich durable pipelines with live Connect state

**Files:**
- Modify: `src/features/pipelines/server.ts`
- Modify: `src/runtime/connect/client.ts` only if an existing client method is insufficient
- Create: `tests/features/pipelines/server.test.ts`

**Interfaces:**
- `getPipelineWorkspace` reads durable pipelines first, then queries Connect only for the associated stream ids.
- Connect-unavailable must leave durable pipelines present with `runtime.connected === false`; it must not erase desired state.
- Missing associated streams must produce `connected === false` rather than deleting or rewriting the pipeline.
- Existing `listStreams()` may be used as the runtime index; per-stream `getStreamStats()` is used for associated stats.

- [ ] **Step 1: Write failing server/workspace tests**

Test that a durable pipeline remains visible when Connect is unavailable, and that an associated stream enriches the pipeline with active/uptime/stats without changing its desired configuration.

- [ ] **Step 2: Run focused tests and verify failure**

Run `mise exec -- npm test -- tests/features/pipelines/server.test.ts`.
Expected: FAIL because the workspace currently derives pipelines directly from Connect.

- [ ] **Step 3: Implement the read path**

Load durable pipelines from the store. When Connect is ready, list streams and match by `connectStreamId`. For each matched stream, fetch stats and populate runtime. Do not create, update, delete, or reconcile streams during this read.

- [ ] **Step 4: Run focused tests**

Run `mise exec -- npm test -- tests/features/pipelines/server.test.ts`.
Expected: PASS.

---

### Task 4: Update workspace presentation to the durable domain

**Files:**
- Modify: `src/features/pipelines/pipeline-workspace.tsx`
- Modify: `tests/pipeline/pipeline-workspace.test.tsx`
- Modify: `README.md`

**Interfaces:**
- UI consumes durable `PipelineSummary` values rather than raw Connect stream summaries.
- UI distinguishes Porcelain identity from runtime association and can show disconnected state without hiding the pipeline.

- [ ] **Step 1: Write failing UI tests**

Add coverage for a durable pipeline that is disconnected and one that is connected/active.

- [ ] **Step 2: Run the focused UI test and verify failure**

Run `mise exec -- npm test -- tests/pipeline/pipeline-workspace.test.tsx`.
Expected: FAIL against the current Connect-only summary shape.

- [ ] **Step 3: Implement the minimal UI update**

Show the Porcelain pipeline name/id and runtime status. Keep presentation intentionally plain; this slice is about correct domain behavior, not visual polish.

- [ ] **Step 4: Update README**

Document that Porcelain now owns durable pipeline identity/desired state while Connect supplies runtime state, and explicitly note that no reconciliation daemon exists yet.

- [ ] **Step 5: Run focused UI tests**

Run `mise exec -- npm test -- tests/pipeline/pipeline-workspace.test.tsx`.
Expected: PASS.

---

### Task 5: Full verification and Git audit

**Files:**
- No new source files beyond the tasks above.

- [ ] **Step 1: Run typecheck**

Run `mise exec -- npm run typecheck`.
Expected: exit 0.

- [ ] **Step 2: Run the full test suite**

Run `mise exec -- npm test`.
Expected: all tests pass.

- [ ] **Step 3: Build production output**

Run `mise exec -- npm run build`.
Expected: exit 0.

- [ ] **Step 4: Check formatting and repository state**

Run `git -c safe.directory='*' diff --check` and `git -c safe.directory='*' status --short --branch` from the WSL repository through the UNC path.
Expected: no whitespace errors; only intended Slice #3 changes are present.

- [ ] **Step 5: Run a real Connect smoke check**

Start local Redpanda Connect Streams Mode on port 4195, create one stream, verify Porcelain can associate it by `connectStreamId` and surface runtime state/stats, then remove the stream. Do not leave the Connect process running.

- [ ] **Step 6: Commit the slice**

Commit the verified changes with a focused message such as `feat: add durable pipeline domain` only after all verification passes.
