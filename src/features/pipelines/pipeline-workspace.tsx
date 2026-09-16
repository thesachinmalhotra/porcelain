import type { PipelineSummary } from "../../pipeline/pipeline"

type PipelineWorkspaceProps = {
  connectReady: boolean
  pipelines: PipelineSummary[]
}

export function PipelineWorkspace({ connectReady, pipelines }: PipelineWorkspaceProps) {
  return (
    <section aria-labelledby="pipelines-heading">
      <header>
        <h2 id="pipelines-heading">Pipelines</h2>
        <p>{connectReady ? "Connect ready" : "Connect unavailable"}</p>
      </header>
      {pipelines.length === 0 ? (
        <p>No pipelines</p>
      ) : (
        <ul>
          {pipelines.map((pipeline) => (
            <li key={pipeline.id}>
              <strong>{pipeline.name}</strong>
              <span>{pipeline.id}</span>
              <span>
                {pipeline.runtime.connected
                  ? pipeline.runtime.active
                    ? "Active"
                    : "Inactive"
                  : "Disconnected"}
              </span>
              {pipeline.runtime.connected && <span>{pipeline.runtime.uptime} uptime</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
