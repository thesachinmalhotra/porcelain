import { createServerFn } from "@tanstack/react-start"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { stringify } from "yaml"
import type { JsonObject, PipelineAuthoring } from "../../pipeline/authoring"
import { authoringToConnectConfig, validatePipelineAuthoring } from "../../pipeline/authoring"
import { createPipelineStore } from "../../pipeline/store"

const execFileAsync = promisify(execFile)

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function executable() {
  return process.env.PORCELAIN_RPK_PATH ?? "rpk"
}

async function runRpk(args: string[], cwd: string) {
  try {
    const result = await execFileAsync(executable(), args, { cwd, maxBuffer: 16 * 1024 * 1024 })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string }
    return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", exitCode: typeof failure.code === "number" ? failure.code : 1 }
  }
}

export const runPipelineNativeTest = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!isObject(input) || !isObject(input.authoring) || typeof input.test !== "string") throw new Error("Pipeline authoring and a native Connect test definition are required")
    validatePipelineAuthoring(input.authoring as PipelineAuthoring)
    return { authoring: input.authoring as PipelineAuthoring, test: input.test }
  })
  .handler(async ({ data }) => {
    const directory = await mkdtemp(join(process.cwd(), ".porcelain-connect-test-"))
    try {
      await writeFile(join(directory, "pipeline.yaml"), stringify(authoringToConnectConfig(data.authoring), { lineWidth: 120 }), "utf8")
      await writeFile(join(directory, "pipeline_benthos_test.yaml"), data.test, "utf8")
      const result = await runRpk(["connect", "test", "pipeline_benthos_test.yaml"], directory)
      return { ok: result.exitCode === 0, output: (result.stdout.trim() || result.stderr.trim() || (result.exitCode === 0 ? "Test succeeded." : "Test failed.")).trim() }
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  })

export const getPipelineDiff = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!isObject(input) || typeof input.id !== "string" || !isObject(input.authoring)) throw new Error("Pipeline id and authoring are required")
    validatePipelineAuthoring(input.authoring as PipelineAuthoring)
    return { id: input.id, authoring: input.authoring as PipelineAuthoring }
  })
  .handler(async ({ data }) => {
    const revision = await createPipelineStore().getRevision(data.id)
    const after = authoringToConnectConfig(data.authoring)
    if (!revision) return { version: null, checksum: null, changed: true, before: null, after }
    return { version: revision.version, checksum: revision.checksum, changed: JSON.stringify(revision.spec) !== JSON.stringify(after), before: revision.spec, after }
  })
