import { createServerFn } from "@tanstack/react-start"
import { loadPipelineWorkspace } from "../pipelines/server"
import { createActivityStore } from "../../operational/activity"
import { createPipelineStore } from "../../pipeline/store"
import { createConnectClient } from "../../runtime/connect/client"

export const getOperationalWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const workspace = await loadPipelineWorkspace({ store: createPipelineStore(), client: createConnectClient({ baseUrl: process.env.PORCELAIN_CONNECT_URL ?? "http://127.0.0.1:4195" }) })
  const activity = createActivityStore()
  await activity.observeRuntime(workspace.pipelines.map((pipeline) => ({ id: pipeline.id, name: pipeline.name, connected: pipeline.runtime.connected, active: pipeline.runtime.active })))
  return { ...workspace, activity: await activity.list(40) }
})
