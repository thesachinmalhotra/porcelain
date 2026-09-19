import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

export type ActivityEvent = {
  id: string
  timestamp: string
  type: "pipeline.created" | "pipeline.updated" | "pipeline.deleted" | "runtime.connected" | "runtime.started" | "runtime.stopped" | "runtime.disconnected"
  pipelineId?: string
  pipelineName?: string
  detail: string
}
type ActivityState = { events: ActivityEvent[]; runtime: Record<string, { connected: boolean; active: boolean }> }

export function createActivityStore(filePath = resolve(process.cwd(), ".porcelain", "activity.json")) {
  async function readState(): Promise<ActivityState> {
    try { return JSON.parse(await readFile(filePath, "utf8")) as ActivityState }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { events: [], runtime: {} }; throw error }
  }
  async function writeState(state: ActivityState) { await mkdir(dirname(filePath), { recursive: true }); await writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8") }
  return {
    async list(limit = 100) { return (await readState()).events.slice(0, limit) },
    async append(event: Omit<ActivityEvent, "id" | "timestamp">) {
      const state = await readState()
      state.events.unshift({ ...event, id: crypto.randomUUID(), timestamp: new Date().toISOString() })
      state.events = state.events.slice(0, 500)
      await writeState(state)
    },
    async observeRuntime(observations: Array<{ id: string; name: string; connected: boolean; active: boolean }>) {
      const state = await readState(); let changed = false
      const currentIds = new Set(observations.map((item) => item.id))
      for (const item of observations) {
        const previous = state.runtime[item.id]
        if (!previous) {
          state.runtime[item.id] = { connected: item.connected, active: item.active }
          if (item.connected) state.events.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: "runtime.connected", pipelineId: item.id, pipelineName: item.name, detail: "Pipeline connected to Redpanda Connect" })
          if (item.active) state.events.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: "runtime.started", pipelineId: item.id, pipelineName: item.name, detail: "Pipeline is running" })
          changed = true
          continue
        }
        if (previous.connected !== item.connected) {
          state.events.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: item.connected ? "runtime.connected" : "runtime.disconnected", pipelineId: item.id, pipelineName: item.name, detail: item.connected ? "Pipeline connected to Redpanda Connect" : "Pipeline disconnected from Redpanda Connect" }); changed = true
        }
        if (previous.active !== item.active) {
          state.events.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: item.active ? "runtime.started" : "runtime.stopped", pipelineId: item.id, pipelineName: item.name, detail: item.active ? "Pipeline started running" : "Pipeline stopped" }); changed = true
        }
        state.runtime[item.id] = { connected: item.connected, active: item.active }
      }
      for (const id of Object.keys(state.runtime)) if (!currentIds.has(id)) { delete state.runtime[id]; changed = true }
      if (changed) { state.events = state.events.slice(0, 500); await writeState(state) }
    },
  }
}
