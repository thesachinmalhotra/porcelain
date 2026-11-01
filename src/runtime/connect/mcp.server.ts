import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { stringify } from "yaml"
import { createPipelineStore } from "../../pipeline/store.server"
import type { JsonObject } from "../../pipeline/authoring"
import { createConnectClient } from "./client"
import { discoverConnectCapabilities } from "./capabilities.server"
import { createAgentDraftStore } from "./agent-draft-store.server"
import { componentSchemaFromDocument } from "./schema"
import { createConnectConfig, discoverConnectJsonSchema, echoConnectConfig, lintConnectConfig } from "./native-config.server"

const execFileAsync = promisify(execFile)
const objectSchema = z.record(z.string(), z.unknown())
const componentKind = z.enum(["input", "output", "processor", "buffer", "cache", "rate_limit", "metric", "tracer"])
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: isRecord(value) ? value : { result: value } }
}
function errorResult(error: unknown) { return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true } }

async function runNativeTest(config: JsonObject, test: string) {
  const directory = await mkdtemp(join(process.cwd(), ".porcelain-mcp-test-"))
  try {
    await writeFile(join(directory, "pipeline.yaml"), stringify(config, { lineWidth: 120 }), "utf8")
    await writeFile(join(directory, "pipeline_benthos_test.yaml"), test, "utf8")
    try {
      const result = await execFileAsync(process.env.PORCELAIN_RPK_PATH ?? "rpk", ["connect", "test", "pipeline_benthos_test.yaml"], { cwd: directory, maxBuffer: 16 * 1024 * 1024 })
      return { ok: true, output: result.stdout.trim() || result.stderr.trim() || "Redpanda Connect tests passed." }
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string }
      return { ok: false, output: failure.stderr?.trim() || failure.stdout?.trim() || "Redpanda Connect tests failed." }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
}

export function createPorcelainMcpServer() {
  const server = new McpServer({ name: "porcelain-redpanda-connect", version: "1.0.0" })
  const drafts = createAgentDraftStore()
  server.registerResource("agent-workflow-guide", "porcelain://guide/agent-workflow", {
    title: "Porcelain agent workflow",
    description: "Architecture and safe operating instructions for AI agents authoring native Redpanda Connect pipelines through Porcelain.",
    mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: `# Porcelain agent workflow

Porcelain is the authoring, review and operations workspace. Redpanda Connect remains the authority for component inventory, schemas, configuration generation, validation, canonicalisation, tests and execution.

## Required sequence
1. Use pipeline_list and pipeline_get to inspect the target pipeline and its current saved revision.
2. Use connect_list_components and connect_get_component_schema. Never invent component names or config fields.
3. Call pipeline_create_draft for the target pipeline.
4. Assemble a complete native Connect stream config and call pipeline_apply_config.
5. Call pipeline_validate_draft. Fix every native lint error before proceeding.
6. Use pipeline_normalise_draft when canonical output is useful, then revalidate.
7. Supply native test YAML to pipeline_test_draft when behavioural tests are appropriate.
8. The Porcelain workspace observes the persisted draft and projects it onto its canvas/source/inspector. Tell the user what changed and where validation stands.
9. Do not publish through MCP. Ask the user to review and publish from Porcelain.

## Safety and fidelity
- A draft is isolated from the saved revision and running stream.
- pipeline_apply_config replaces the complete native configuration, so always read the current draft first and preserve fields you are not changing.
- A draft based on an obsolete saved revision is rejected. Discard it and create a fresh draft.
- Do not use shell execution or invent an alternate runtime. Use the curated MCP tools and native Connect interfaces.
- Publishing an updated stream restarts it; production publication remains a user-approved Porcelain action.
` }] }))
  server.registerPrompt("build_redpanda_connect_pipeline", {
    title: "Build a Redpanda Connect pipeline",
    description: "Guide an agent through native component discovery, draft authoring, validation and testing in Porcelain without publishing.",
    argsSchema: z.object({
      goal: z.string().min(1).describe("What the pipeline should do, including inputs, transformations and destinations"),
      pipelineId: z.string().min(1).describe("Existing Porcelain pipeline ID to use as the draft base"),
    }),
  }, ({ goal, pipelineId }) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: `Build this Redpanda Connect pipeline in Porcelain. Target pipeline: ${pipelineId}. Goal: ${goal}. Read porcelain://guide/agent-workflow first. Discover real component schemas, create an isolated draft, apply a complete native Connect config, validate and test it. Do not publish; leave the result for review in the Porcelain workspace.` } }] }))
  server.registerTool("connect_list_components", { title: "List Redpanda Connect components", description: "Discover the installed component inventory from native rpk/Connect CLI. This is the authoritative component catalogue.", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => {
    try { return textResult(await discoverConnectCapabilities()) } catch (error) { return errorResult(error) }
  })
  server.registerTool("connect_get_component_schema", { title: "Get component schema", description: "Retrieve the native JSON schema for an installed Redpanda Connect component.", inputSchema: z.object({ kind: componentKind, name: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ kind, name }) => {
    try { return textResult(componentSchemaFromDocument(await discoverConnectJsonSchema(), kind, name)) } catch (error) { return errorResult(error) }
  })
  server.registerTool("connect_generate_component_config", { title: "Generate native component configuration", description: "Use Redpanda Connect's own rpk connect create command to generate an input, processor or output config.", inputSchema: z.object({ kind: z.enum(["input", "processor", "output"]), name: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ kind, name }) => {
    try { const expression = kind === "input" ? `${name}//drop` : kind === "output" ? `stdin//${name}` : `stdin/${name}/stdout`; return textResult(await createConnectConfig(expression)) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_list", { title: "List Porcelain pipelines", description: "List saved pipelines and desired revision metadata.", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => {
    try { return textResult(await createPipelineStore().list()) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_get", { title: "Get pipeline configuration", description: "Read the saved native Connect config and revision for a Porcelain pipeline.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try { const store = createPipelineStore(); const pipeline = await store.get(pipelineId); if (!pipeline) throw new Error("Pipeline not found: " + pipelineId); const revision = await store.getRevision(pipeline.desiredRevisionId); if (!revision) throw new Error("Desired revision not found: " + pipeline.desiredRevisionId); return textResult({ pipeline, revision }) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_create_draft", { title: "Create an agent pipeline draft", description: "Start an isolated agent draft from an existing pipeline's saved native config. Draft changes do not alter saved revisions or the running stream.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try {
      const store = createPipelineStore()
      const pipeline = await store.get(pipelineId)
      if (!pipeline) throw new Error("Pipeline not found: " + pipelineId)
      const revision = await store.getRevision(pipeline.desiredRevisionId)
      if (!revision) throw new Error("Desired revision not found: " + pipeline.desiredRevisionId)
      const draft = await drafts.create({ pipelineId, pipelineName: pipeline.name, config: revision.spec, basedOnRevision: revision.id, basedOnChecksum: revision.checksum })
      if (draft.basedOnRevision !== revision.id) throw new Error("An existing agent draft is based on an older pipeline revision. Discard it before creating a fresh draft.")
      return textResult(draft)
    } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_get_draft", { title: "Get agent pipeline draft", description: "Read the current agent draft, native config, version and last validation result.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try { const draft = await drafts.get(pipelineId); if (!draft) throw new Error("No agent draft exists for pipeline " + pipelineId); return textResult(draft) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_discard_draft", { title: "Discard agent pipeline draft", description: "Remove an isolated agent draft without changing the saved pipeline revision or running stream.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } }, async ({ pipelineId }) => {
    try { await drafts.discard(pipelineId); return textResult({ pipelineId, discarded: true }) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_apply_config", { title: "Apply native pipeline config to draft", description: "Replace the agent draft with a complete native Connect stream config. Requires input and output objects. Never publishes or restarts a running stream; rejects drafts based on a stale saved revision.", inputSchema: z.object({ pipelineId: z.string().min(1), config: objectSchema }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }, async ({ pipelineId, config }) => {
    try {
      const draft = await drafts.get(pipelineId)
      if (!draft) throw new Error("No agent draft exists for pipeline " + pipelineId + "; create one first")
      const pipeline = await createPipelineStore().get(pipelineId)
      if (!pipeline || pipeline.desiredRevisionId !== draft.basedOnRevision) throw new Error("This agent draft is based on an older saved pipeline revision. Discard it and create a fresh draft before applying changes.")
      return textResult(await drafts.update(pipelineId, config as JsonObject))
    } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_validate_draft", { title: "Validate agent draft", description: "Run native Redpanda Connect lint and persist its result on the agent draft.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try { const draft = await drafts.get(pipelineId); if (!draft) throw new Error("No agent draft exists for pipeline " + pipelineId); const result = await lintConnectConfig(draft.config); const output = result.stderr.trim() || result.stdout.trim() || (result.valid ? "Redpanda Connect accepted the configuration." : "Redpanda Connect rejected the configuration."); return textResult(await drafts.recordValidation(pipelineId, result.valid, output)) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_normalise_draft", { title: "Normalise agent draft", description: "Run native Redpanda Connect echo and save its canonical native configuration into the draft.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try { const draft = await drafts.get(pipelineId); if (!draft) throw new Error("No agent draft exists for pipeline " + pipelineId); return textResult(await drafts.update(pipelineId, await echoConnectConfig(draft.config) as JsonObject)) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_test_draft", { title: "Test agent draft", description: "Run native rpk connect test using a supplied Benthos/Connect test YAML definition. Does not publish the stream.", inputSchema: z.object({ pipelineId: z.string().min(1), test: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId, test }) => {
    try { const draft = await drafts.get(pipelineId); if (!draft) throw new Error("No agent draft exists for pipeline " + pipelineId); return textResult(await runNativeTest(draft.config, test)) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_get_runtime", { title: "Get Connect runtime status", description: "Read actual Redpanda Connect stream status and loaded config.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try { const pipeline = await createPipelineStore().get(pipelineId); if (!pipeline) throw new Error("Pipeline not found: " + pipelineId); if (!pipeline.connectStreamId) throw new Error("Pipeline has no associated Connect stream"); const client = createConnectClient({ baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195" }); return textResult(await client.getStream(pipeline.connectStreamId)) } catch (error) { return errorResult(error) }
  })
  server.registerTool("pipeline_get_stats", { title: "Get Connect pipeline statistics", description: "Read native Redpanda Connect stream statistics.", inputSchema: z.object({ pipelineId: z.string().min(1) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async ({ pipelineId }) => {
    try { const pipeline = await createPipelineStore().get(pipelineId); if (!pipeline?.connectStreamId) throw new Error("Pipeline or associated Connect stream not found: " + pipelineId); const client = createConnectClient({ baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195" }); return textResult(await client.getStreamStats(pipeline.connectStreamId)) } catch (error) { return errorResult(error) }
  })
  return server
}

const porcelainMcpHandler = createMcpHandler(() => createPorcelainMcpServer())

export async function handlePorcelainMcpRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      if (new URL(origin).host !== requestUrl.host) return new Response("Origin not allowed", { status: 403 })
    } catch { return new Response("Invalid Origin header", { status: 403 }) }
  }
  const token = process.env.PORCELAIN_MCP_TOKEN
  if (token) {
    if (request.headers.get("authorization") !== `Bearer ${token}`) return new Response("Unauthorized", { status: 401 })
  } else {
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"])
    if (process.env.NODE_ENV === "production" || !localHosts.has(requestUrl.hostname)) return new Response("Set PORCELAIN_MCP_TOKEN to enable authenticated MCP access.", { status: 503 })
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } })
  return porcelainMcpHandler.fetch(request)
}
