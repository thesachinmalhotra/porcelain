import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { JsonObject } from "../../pipeline/authoring"

export type AgentPipelineDraft = {
  id: string
  pipelineId: string
  pipelineName: string
  config: JsonObject
  version: number
  basedOnRevision: string
  basedOnChecksum: string
  createdAt: string
  updatedAt: string
  updatedBy: "mcp-agent"
  validation?: { valid: boolean; output: string; checkedAt: string }
}
type State = { drafts: AgentPipelineDraft[] }
let mutationQueue = Promise.resolve()
function serialiseMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(() => undefined, () => undefined)
  return result
}
function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value) }

export function createAgentDraftStore(filePath = resolve(process.cwd(), ".porcelain", "agent-drafts.json")) {
  async function read(): Promise<State> {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<State>
      return { drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [] }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { drafts: [] }
      throw error
    }
  }
  async function write(state: State): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = filePath + "." + randomUUID() + ".tmp"
    await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", "utf8")
    await rename(temporary, filePath)
  }
  return {
    async list(): Promise<AgentPipelineDraft[]> { return (await read()).drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
    async get(pipelineId: string): Promise<AgentPipelineDraft | null> { return (await read()).drafts.find((draft) => draft.pipelineId === pipelineId) ?? null },
    async create(input: Omit<AgentPipelineDraft, "id" | "version" | "createdAt" | "updatedAt" | "updatedBy">): Promise<AgentPipelineDraft> {
      return serialiseMutation(async () => {
        const state = await read()
        const existing = state.drafts.find((draft) => draft.pipelineId === input.pipelineId)
        if (existing) return existing
        const now = new Date().toISOString()
        const draft: AgentPipelineDraft = { ...input, id: randomUUID(), version: 1, createdAt: now, updatedAt: now, updatedBy: "mcp-agent" }
        state.drafts.push(draft)
        await write(state)
        return draft
      })
    },
    async update(pipelineId: string, config: JsonObject): Promise<AgentPipelineDraft> {
      if (!isObject(config) || !isObject(config.input) || !isObject(config.output)) throw new Error("A native Connect stream config must contain input and output objects")
      return serialiseMutation(async () => {
        const state = await read()
        const index = state.drafts.findIndex((draft) => draft.pipelineId === pipelineId)
        if (index < 0) throw new Error("No agent draft exists for pipeline " + pipelineId + "; create one first")
        const updated: AgentPipelineDraft = { ...state.drafts[index], config: structuredClone(config), version: state.drafts[index].version + 1, updatedAt: new Date().toISOString(), validation: undefined }
        state.drafts[index] = updated
        await write(state)
        return updated
      })
    },
    async discard(pipelineId: string): Promise<void> {
      return serialiseMutation(async () => {
        const state = await read()
        state.drafts = state.drafts.filter((draft) => draft.pipelineId !== pipelineId)
        await write(state)
      })
    },
    async recordValidation(pipelineId: string, valid: boolean, output: string): Promise<AgentPipelineDraft> {
      return serialiseMutation(async () => {
        const state = await read()
        const index = state.drafts.findIndex((draft) => draft.pipelineId === pipelineId)
        if (index < 0) throw new Error("Agent draft not found for pipeline " + pipelineId)
        const updated = { ...state.drafts[index], validation: { valid, output, checkedAt: new Date().toISOString() } }
        state.drafts[index] = updated
        await write(state)
        return updated
      })
    },
  }
}
