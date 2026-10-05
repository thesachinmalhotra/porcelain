import { useState } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { createAuthoredPipelineServer, getPipelineWorkspace } from "../../features/pipelines/server"

export const Route = createFileRoute("/pipelines/")({
  loader: async () => {
    const workspace = await getPipelineWorkspace()
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

  return (
    <div className="pipeline-index-page">
      <header className="pipeline-index-header">
        <div>
          <div className="breadcrumbs"><span>Operate</span><b>/</b><strong>Pipelines</strong></div>
          <h1>Pipelines</h1>
        </div>
        <div className="pipeline-index-runtime"><span className="status-dot online" /><span>Connect</span><code>local</code></div>
      </header>

      <main className="pipeline-empty-workspace">
        <section className="pipeline-empty-copy" aria-labelledby="create-pipeline-title">
          <span className="eyebrow">No pipelines</span>
          <h2 id="create-pipeline-title">Create a native Connect stream.</h2>
          <p>
            Porcelain owns the pipeline identity and authoring state. Redpanda Connect owns
            execution, validation, and runtime behaviour.
          </p>
          <dl className="pipeline-empty-facts">
            <div><dt>Execution</dt><dd>Redpanda Connect</dd></div>
            <div><dt>Initial input</dt><dd><code>stdin</code></dd></div>
            <div><dt>Initial output</dt><dd><code>drop</code></dd></div>
          </dl>
        </section>

        <section className="pipeline-create-panel" aria-label="Create pipeline">
          <div className="pipeline-create-header">
            <div>
              <span className="eyebrow">New pipeline</span>
              <h2>Pipeline identity</h2>
            </div>
            <span className="pipeline-create-index">01</span>
          </div>
          <form className="pipeline-create-form" onSubmit={create}>
            <label>
              <span>Pipeline ID <code>required</code></span>
              <input value={id} onChange={(event) => setId(event.target.value)} placeholder="temperature-normalizer" autoFocus />
              <small>Lowercase letters, numbers, hyphens, or underscores.</small>
            </label>
            <label>
              <span>Name <code>required</code></span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Temperature normalizer" />
            </label>
            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="pipeline-create-actions">
              <span>Creates the stream in Connect</span>
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create pipeline"} <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
