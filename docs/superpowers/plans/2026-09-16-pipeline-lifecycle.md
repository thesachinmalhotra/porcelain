# Pipeline Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add explicit create, update, and delete operations that coordinate a durable Porcelain pipeline with its Redpanda Connect stream.

**Architecture:** Add a small pipeline lifecycle service that receives the existing store and Connect client as dependencies. It owns sequencing and error semantics but does not create a transaction layer or reconciliation daemon. Connect remains authoritative for runtime execution and lifecycle state; the store remains authoritative for durable Porcelain identity and desired configuration.

**Tech Stack:** TypeScript, TanStack Start server functions, Vitest, Redpanda Connect Streams Mode 26.2, existing file-backed JSON store.

**Spec:** docs/superpowers/specs/2026-09-16-pipeline-lifecycle-design.md

## Global Constraints
- No reconciliation daemon or transaction manager.
- No command bus, generic orchestration framework, compiler, IR, adapter framework, or custom execution engine.
- Runtime state is not persisted.
- Reuse the existing Connect client boundary; add only capability required by lifecycle tests.
- Full updates use Connect PUT and therefore inherit Connect replacement/restart semantics.
- Delete treats an already-missing associated Connect stream as absent runtime.
- Failed Connect create/update prevents the corresponding durable write.

### Task 1: Lifecycle service and durable deletion

**Files:** Create `src/pipeline/lifecycle.ts` and `tests/pipeline/lifecycle.test.ts`; modify `src/pipeline/store.ts` and `tests/pipeline/store.test.ts`.

- [ ] Write failing tests for successful create/update/delete and explicit call ordering using injected fake store and Connect client.
- [ ] Run `npm test -- tests/pipeline/lifecycle.test.ts` and verify failure because the service does not exist.
- [ ] Implement `createPipelineLifecycle({ store, client })` with `createPipeline`, `updatePipeline`, and `deletePipeline` methods. Create calls Connect create first, then durable create. Update loads the definition, calls Connect PUT when associated, then durable update. Delete loads the definition, deletes an associated Connect stream, then removes durable state.
- [ ] Write the durable store delete test before implementation. Implement `delete(id)` to remove exactly the matching definition or throw `Pipeline not found: <id>`.
- [ ] Run `npm test -- tests/pipeline/lifecycle.test.ts tests/pipeline/store.test.ts` and verify all pass.
- [ ] Commit with `git commit -m "feat: add pipeline lifecycle service"`.

### Task 2: Failure semantics

**Files:** Modify `tests/pipeline/lifecycle.test.ts`; modify `src/pipeline/lifecycle.ts` and `src/runtime/connect/client.ts` only if required.

- [ ] Add failing tests proving Connect create failure prevents durable create, Connect update failure prevents durable update, and the original error propagates.
- [ ] Run `npm test -- tests/pipeline/lifecycle.test.ts` and verify the new tests fail before the fix.
- [ ] Keep Connect calls before durable writes and propagate errors without rollback or transaction abstractions.
- [ ] Add a test where Connect delete reports 404 and assert durable deletion still succeeds; non-404 failures must prevent durable deletion. If the current client error does not expose status, add the smallest typed status field needed.
- [ ] Run the lifecycle suite and verify all pass.
- [ ] Commit with `git commit -m "test: define pipeline lifecycle failures"`.

### Task 3: Server boundary

**Files:** Modify `src/features/pipelines/server.ts`; create `tests/features/pipelines/lifecycle-server.test.ts`.

- [ ] Write failing tests for dependency-injected create/update/delete server helpers. Assert they delegate to the lifecycle service rather than duplicating sequencing.
- [ ] Run `npm test -- tests/features/pipelines/lifecycle-server.test.ts` and verify failure because helpers are absent.
- [ ] Add thin server helpers plus TanStack server functions for create/update/delete. They resolve the existing store/client, construct the lifecycle service, and delegate.
- [ ] Run `npm test -- tests/features/pipelines/lifecycle-server.test.ts tests/pipeline/lifecycle.test.ts` and then `npm test`.
- [ ] Commit with `git commit -m "feat: expose pipeline lifecycle commands"`.

### Task 4: Real Connect verification

**Files:** No production changes expected.

- [ ] Run `npm run typecheck`, `npm test`, and `npm run build` before smoke testing.
- [ ] Start `/home/sachin/.local/bin/.rpk.managed-connect streams` on port 4195 and verify `/ready`.
- [ ] Through the lifecycle service, create a valid stream such as `orders-lifecycle`; verify Connect `/streams/<id>` and durable `connectStreamId` agree.
- [ ] Update a harmless desired configuration field through the lifecycle service; verify Connect has the replacement configuration and durable desired state matches while stream id remains stable.
- [ ] Delete through the lifecycle service; verify Connect returns 404 and durable state is gone.
- [ ] Create a durable pipeline, delete its Connect stream directly, then lifecycle-delete it; verify durable deletion succeeds for the already-missing runtime.
- [ ] Stop runtime processes and clean only generated `.porcelain` smoke state.

### Task 5: Final verification and push

- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Audit `git status --short --branch`, recent log, and diff; confirm no generated artifacts remain and design/implementation history is separated.
- [ ] Push with `git push origin main` only after the tree is clean and all verification is green.
