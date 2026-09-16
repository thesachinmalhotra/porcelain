# Pipeline Authoring Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Porcelain pipeline-authoring boundary that deterministically maps a user-oriented pipeline definition to native Redpanda Connect stream configuration and exercises the full real runtime lifecycle.

**Architecture:** Keep the authoring model close to Connect's input/buffer/processors/output structure. Map it to the existing `PipelineDefinition.desiredConfig`, then delegate all runtime mutation to the existing pipeline lifecycle service. Do not introduce a DSL, IR, compiler, resource layer, or reconciliation loop.

**Tech Stack:** TypeScript, Node 24, Vitest, TanStack Start, Redpanda Connect 26.2 Streams API.

**Spec:** `docs/superpowers/specs/2026-09-16-pipeline-authoring-design.md`

## Global Constraints

- `PipelineDefinition.desiredConfig` remains the persisted Connect-native configuration.
- Connect remains authoritative for component-specific configuration validation.
- Authoring does not call Connect directly; lifecycle remains the runtime boundary.
- The initial executable vocabulary is `generate` input, `bloblang` processor, and `drop` output.
- Do not add a compiler, IR, custom DSL, component catalogue, reconciliation loop, SQLite migration, resources layer, or schema-driven UI.
- Create/update/delete ordering from Slice #4 must remain unchanged.

---

### Task 1: Add the authoring model and deterministic Connect mapping

**Files:**
- Create: `src/pipeline/authoring.ts`
- Test: `tests/pipeline/authoring.test.ts`

**Interfaces:**
- Consumes: `PipelineAuthoring` values containing `id`, `name`, optional `metadata`, `input`, optional `buffer`, optional `processors`, and `output`.
- Produces: `PipelineAuthoring`, `authoringToConnectConfig(authoring)`, and `validatePipelineAuthoring(authoring)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest"
import { authoringToConnectConfig, validatePipelineAuthoring } from "../../src/pipeline/authoring"

describe("pipeline authoring", () => {
  it("maps input, buffer, processors, and output to Connect stream config", () => {
    expect(authoringToConnectConfig({
      id: "orders",
      name: "Orders",
      input: { generate: { interval: "1s" } },
      buffer: { none: {} },
      processors: [{ bloblang: "root = this" }],
      output: { drop: {} },
    })).toEqual({
      input: { generate: { interval: "1s" } },
      buffer: { none: {} },
      pipeline: { processors: [{ bloblang: "root = this" }] },
      output: { drop: {} },
    })
  })

  it("omits optional buffer and empty processor pipeline", () => {
    expect(authoringToConnectConfig({
      id: "orders",
      name: "Orders",
      input: { generate: { interval: "1s" } },
      output: { drop: {} },
    })).toEqual({
      input: { generate: { interval: "1s" } },
      output: { drop: {} },
    })
  })

  it("rejects missing required structure", () => {
    expect(() => validatePipelineAuthoring({
      id: "",
      name: "Orders",
      input: {},
      output: { drop: {} },
    })).toThrow("Pipeline id must be a non-empty string")
  })

  it("rejects non-object component values", () => {
    expect(() => validatePipelineAuthoring({
      id: "orders",
      name: "Orders",
      input: "generate",
      output: { drop: {} },
    })).toThrow("Pipeline input must be an object")
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `mise exec -- npm test -- tests/pipeline/authoring.test.ts`
Expected: FAIL because `src/pipeline/authoring.ts` does not exist.

- [ ] **Step 3: Implement the minimal authoring boundary**

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

export function validatePipelineAuthoring(authoring: PipelineAuthoring): void {
  if (typeof authoring.id !== "string" || authoring.id.trim() === "") {
    throw new Error("Pipeline id must be a non-empty string")
  }
  if (typeof authoring.name !== "string" || authoring.name.trim() === "") {
    throw new Error("Pipeline name must be a non-empty string")
  }
  if (!isObject(authoring.input)) throw new Error("Pipeline input must be an object")
  if (authoring.buffer !== undefined && !isObject(authoring.buffer)) {
    throw new Error("Pipeline buffer must be an object")
  }
  if (authoring.processors !== undefined && (!Array.isArray(authoring.processors) || authoring.processors.some((processor) => !isObject(processor)))) {
    throw new Error("Pipeline processors must contain only objects")
  }
  if (!isObject(authoring.output)) throw new Error("Pipeline output must be an object")
}

export function authoringToConnectConfig(authoring: PipelineAuthoring): Record<string, unknown> {
  validatePipelineAuthoring(authoring)
  return {
    input: authoring.input,
    ...(authoring.buffer ? { buffer: authoring.buffer } : {}),
    ...(authoring.processors?.length ? { pipeline: { processors: authoring.processors } } : {}),
    output: authoring.output,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `mise exec -- npm test -- tests/pipeline/authoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/authoring.ts tests/pipeline/authoring.test.ts
git commit -m "feat: add pipeline authoring boundary"
```

### Task 2: Integrate authoring with the existing lifecycle service

**Files:**
- Create: `src/pipeline/authoring-lifecycle.ts`
- Test: `tests/pipeline/authoring-lifecycle.test.ts`

**Interfaces:**
- Consumes: `PipelineAuthoring`, `PipelineDefinition`, and the existing lifecycle service.
- Produces: `createAuthoredPipeline()` and `updateAuthoredPipeline()`.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates a durable definition through lifecycle with mapped Connect config", async () => {
  const calls: unknown[] = []
  const lifecycle = {
    createPipeline: async (definition: PipelineDefinition) => {
      calls.push(definition)
      return definition
    },
  }
  const result = await createAuthoredPipeline({
    lifecycle,
    authoring: {
      id: "orders",
      name: "Orders",
      metadata: { owner: "platform" },
      input: { generate: { interval: "1s" } },
      processors: [{ bloblang: "root = this" }],
      output: { drop: {} },
    },
  })
  expect(result.desiredConfig).toEqual({
    input: { generate: { interval: "1s" } },
    pipeline: { processors: [{ bloblang: "root = this" }] },
    output: { drop: {} },
  })
  expect(calls).toHaveLength(1)
})

it("updates through lifecycle and replaces only the desired config", async () => {
  let received: unknown
  const lifecycle = {
    updatePipeline: async (id: string, update: Omit<PipelineDefinition, "id">) => {
      received = { id, update }
      return { id, ...update }
    },
  }
  await updateAuthoredPipeline({
    lifecycle,
    id: "orders",
    existing: {
      id: "orders",
      name: "Orders",
      metadata: { owner: "platform" },
      desiredConfig: { input: { generate: { interval: "1s" } }, output: { drop: {} } },
      connectStreamId: "orders",
    },
    authoring: {
      id: "orders",
      name: "Orders v2",
      input: { generate: { interval: "2s" } },
      output: { drop: {} },
    },
  })
  expect(received).toEqual({
    id: "orders",
    update: {
      name: "Orders v2",
      metadata: {},
      desiredConfig: { input: { generate: { interval: "2s" } }, output: { drop: {} } },
      connectStreamId: "orders",
    },
  })
})
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `mise exec -- npm test -- tests/pipeline/authoring-lifecycle.test.ts`
Expected: FAIL because the authoring lifecycle module does not exist.

- [ ] **Step 3: Implement lifecycle integration**

`createAuthoredPipeline` validates and maps the authoring value, then calls `lifecycle.createPipeline` with the resulting `PipelineDefinition` and `connectStreamId: null`. `updateAuthoredPipeline` validates and maps the new authoring value, then calls `lifecycle.updatePipeline` while preserving the existing `connectStreamId` and supplying the authoring name/metadata.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `mise exec -- npm test -- tests/pipeline/authoring-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/authoring-lifecycle.ts tests/pipeline/authoring-lifecycle.test.ts
git commit -m "feat: connect authoring to pipeline lifecycle"
```

### Task 3: Add real Connect authoring smoke coverage

**Files:**
- Create: `tests/pipeline/authoring-connect.smoke.test.ts`
- Modify: `package.json` only if a dedicated smoke script is needed.

**Interfaces:**
- Consumes: `createPipelineStore`, `createPipelineLifecycle`, `createAuthoredPipeline`, `updateAuthoredPipeline`, and `createConnectClient`.
- Produces: executable evidence that authored config reaches a real Connect 26.2 Streams instance and can be updated/deleted through Porcelain.

- [ ] **Step 1: Add a smoke test using the existing real Connect test convention**

The test must:

1. Create a temporary file-backed pipeline store.
2. Construct the real Connect client using `PORCELAIN_CONNECT_URL ?? http://127.0.0.1:4195`.
3. Assert `/ready` is true.
4. Author `generate -> bloblang -> drop` with `interval: "1s"`.
5. Create it through `createAuthoredPipeline`.
6. Read the stream using `getStream` and assert its config contains `input.generate`, `pipeline.processors[0].bloblang`, and `output.drop`.
7. Author an update with `interval: "2s"` and update it through `updateAuthoredPipeline`.
8. Read the stream again and assert the interval is `2s`.
9. Delete through the existing lifecycle service and assert `getStream` rejects with status 404.
10. Clean up the temporary store file and any runtime stream even if assertions fail.

- [ ] **Step 2: Run the smoke test against a managed Connect 26.2 instance**

Run the existing project Connect startup procedure, then:

`mise exec -- npm test -- tests/pipeline/authoring-connect.smoke.test.ts`

Expected: PASS against real Connect. If Connect is not available, stop and report the missing runtime instead of weakening the test.

- [ ] **Step 3: Commit**

```bash
git add tests/pipeline/authoring-connect.smoke.test.ts
git commit -m "test: verify authored pipelines against connect"
```

### Task 4: Full verification and final cleanup

**Files:**
- Modify: none unless verification exposes a real defect.

- [ ] **Step 1: Run the full test suite**

Run: `mise exec -- npm test`
Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `mise exec -- npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run production build**

Run: `mise exec -- npm run build`
Expected: exit 0.

- [ ] **Step 4: Check the diff**

Run: `git diff --check HEAD~3..HEAD` and `git status --short --branch`
Expected: no whitespace errors; only intentional Slice #5 commits are present and no generated runtime state is tracked.

- [ ] **Step 5: Commit any verification-only documentation correction if required**

Do not create a commit if no correction is needed.

- [ ] **Step 6: Record final evidence**

Capture the final commit IDs, test count, typecheck/build results, and real Connect smoke output for the completion report.
