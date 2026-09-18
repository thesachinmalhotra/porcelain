import { useState } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { createAuthoredPipelineServer, getPipelineWorkspace } from "../features/pipelines/server"

export const Route = createFileRoute("/pipelines")({
  loader: async () => {
    const workspace = await getPipelineWorkspace()
    if (workspace.pipelines[0]) throw redirect({ to: "/pipelines/$pipelineId", params: { pipelineId: workspace.pipelines[0].id } })
    return workspace
  },
  component: PipelinesIndex,
})

function PipelinesIndex() {
  const router = useRouter()
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    const pipelineId = id.trim()
    const pipelineName = name.trim()
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(pipelineId)) { setError("Pipeline ID must use lowercase letters, numbers, hyphens, or underscores"); return }
    if (!pipelineName) { setError("Pipeline name is required"); return }
    setSaving(true); setError(null)
    try {
      await createAuthoredPipelineServer({ data: { id: pipelineId, name: pipelineName, input: { stdin: {} }, output: { drop: {} } } })
      await router.navigate({ to: "/pipelines/$pipelineId", params: { pipelineId } })
    } catch (value) { setError(value instanceof Error ? value.message : "Create failed") }
    finally { setSaving(false) }
  }

  return <div className="workspace-page"><div className="empty-state page-empty"><div className="empty-icon">P</div><h3>Create your first pipeline</h3><p>Porcelain will create the Connect stream and persist the pipeline for you.</p><form className="empty-create-form" onSubmit={create}><label>Pipeline ID<input value={id} onChange={(event) => setId(event.target.value)} placeholder="temperature-normalizer" /></label><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Temperature normalizer" /></label>{error && <div className="error-banner" role="alert">{error}</div>}<button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create pipeline"}</button></form></div></div>
}
