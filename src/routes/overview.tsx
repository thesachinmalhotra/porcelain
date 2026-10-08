import { createFileRoute, Link } from "@tanstack/react-router"
import { getOperationalWorkspace } from "../features/operations/server"
import { connectPipelineRuntimeSummary } from "../runtime/connect/stats"
import { ViewHeader } from "../components/view-header"

type OperationalWorkspace = Awaited<ReturnType<typeof getOperationalWorkspace>>
type OperationalPipeline = OperationalWorkspace["pipelines"][number]
type ActivityEvent = OperationalWorkspace["activity"][number]

function componentName(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
  return Object.keys(value)[0] ?? fallback
}

function runtimeSummary(pipeline: OperationalPipeline) {
  return connectPipelineRuntimeSummary(pipeline.runtime.stats)
}

function receivedMessages(pipeline: OperationalPipeline): number | null {
  return runtimeSummary(pipeline).received
}

function sentMessages(pipeline: OperationalPipeline): number | null {
  return runtimeSummary(pipeline).sent
}

function formatCount(value: number | null): string {
  return value === null ? "-" : new Intl.NumberFormat().format(value)
}

function totalMetric(pipelines: OperationalPipeline[], metric: (pipeline: OperationalPipeline) => number | null): number | null {
  const values = pipelines.map(metric).filter((value): value is number => value !== null)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function relativeTime(timestamp: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return minutes + "m"
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours + "h"
  return Math.round(hours / 24) + "d"
}

function eventTone(type: ActivityEvent["type"]): "success" | "warning" | "danger" {
  if (type === "runtime.disconnected" || type === "pipeline.deleted") return "danger"
  if (type === "runtime.stopped" || type === "pipeline.updated") return "warning"
  return "success"
}

function pipelineStatus(pipeline: OperationalPipeline): "running" | "stopped" | "disconnected" {
  if (pipeline.runtime.active) return "running"
  if (pipeline.runtime.connected) return "stopped"
  return "disconnected"
}

export const Route = createFileRoute("/overview")({
  loader: () => getOperationalWorkspace(),
  component: Overview,
})

function Overview() {
  const data = Route.useLoaderData()
  const running = data.pipelines.filter((pipeline: OperationalPipeline) => pipeline.runtime.active).length
  const connected = data.pipelines.filter((pipeline: OperationalPipeline) => pipeline.runtime.connected).length
  const received = totalMetric(data.pipelines, receivedMessages)
  const sent = totalMetric(data.pipelines, sentMessages)
  const trafficPipelines = [...data.pipelines]
    .sort((a: OperationalPipeline, b: OperationalPipeline) => (receivedMessages(b) ?? 0) - (receivedMessages(a) ?? 0))
    .slice(0, 6)
  const maxReceived = Math.max(1, ...trafficPipelines.map((pipeline: OperationalPipeline) => receivedMessages(pipeline) ?? 0))

  return (
    <div className="workspace-page overview-page">
      <ViewHeader
        eyebrow="Operate"
        title="Overview"
        description="A clear view of what is happening across your Connect workspace."
        actions={<Link className="button button-primary" to="/pipelines">Open pipelines</Link>}
      />

      <section className="overview-hero" aria-label="Workspace overview">
        <div className="overview-activity-card">
          <header className="overview-card-header">
            <div>
              <span className="overview-kicker">Workspace activity</span>
              <h2>Message flow</h2>
              <p>Live totals from the Connect streams currently known to Porcelain.</p>
            </div>
            <span className={"overview-live-state " + (data.connectReady ? "ready" : "offline")}>
              <i />
              {data.connectReady ? "Live" : "Offline"}
            </span>
          </header>

          <div className="overview-hero-metric">
            <div>
              <strong>{formatCount(received)}</strong>
              <span>messages received</span>
            </div>
            <div className="overview-hero-secondary">
              <div>
                <strong>{formatCount(sent)}</strong>
                <span>sent</span>
              </div>
              <div>
                <strong>{running}</strong>
                <span>running</span>
              </div>
            </div>
          </div>

          <div className="overview-flow-visual">
            <div className="overview-flow-heading">
              <span>Traffic by pipeline</span>
              <span>{data.pipelines.length} total</span>
            </div>

            {trafficPipelines.length ? trafficPipelines.map((pipeline: OperationalPipeline) => {
              const count = receivedMessages(pipeline) ?? 0
              const input = componentName(pipeline.authoring.input, "input")
              const output = componentName(pipeline.authoring.output, "output")
              const status = pipelineStatus(pipeline)

              return (
                <Link
                  className="overview-flow-row"
                  key={pipeline.id}
                  to="/pipelines/$pipelineId"
                  params={{ pipelineId: pipeline.id }}
                >
                  <div className="overview-flow-identity">
                    <span className={"overview-flow-status " + status}><i /></span>
                    <div>
                      <strong>{pipeline.name}</strong>
                      <small>{input} <b>&rarr;</b> {output}</small>
                    </div>
                  </div>
                  <div className="overview-flow-track" aria-hidden="true">
                    <i style={{ width: (count / maxReceived) * 100 + "%" }} />
                  </div>
                  <strong className="overview-flow-count">{formatCount(receivedMessages(pipeline))}</strong>
                </Link>
              )
            }) : (
              <div className="overview-visual-empty">
                <span>No pipelines yet.</span>
                <Link to="/pipelines">Create your first pipeline</Link>
              </div>
            )}
          </div>

          <footer className="overview-card-footer">
            <span>{data.pipelines.length ? "Showing the busiest pipelines first." : "Connect a pipeline to start seeing live activity."}</span>
            <Link to="/activity">View activity <b>&rarr;</b></Link>
          </footer>
        </div>

        <aside className="overview-rail">
          <section className="overview-status-card">
            <header>
              <span className="overview-kicker">Connect</span>
              <span className={"overview-status-badge " + (data.connectReady ? "ready" : data.connectReachable ? "degraded" : "offline")}>
                <i />
                {data.connectReady ? "Ready" : data.connectReachable ? "Degraded" : "Unreachable"}
              </span>
            </header>
            <strong className="overview-status-title">
              {data.connectReady ? "Your workspace is connected." : "Connect needs attention."}
            </strong>
            <p>Porcelain reads runtime state directly from Redpanda Connect.</p>
            <div className="overview-status-meta">
              <span>Streams connected</span>
              <strong>{connected} / {data.pipelines.length}</strong>
            </div>
            <Link to="/runtime">Open runtime <b>&rarr;</b></Link>
          </section>

          <section className="overview-runtime-card">
            <header>
              <span className="overview-kicker">Runtime</span>
              <span>{connected} connected</span>
            </header>
            <div className="overview-runtime-grid">
              <div>
                <strong>{running}</strong>
                <span>running</span>
              </div>
              <div>
                <strong>{data.pipelines.length - running}</strong>
                <span>not running</span>
              </div>
            </div>
            <div className="overview-runtime-foot">
              <span>Runtime state is read from Connect.</span>
              <Link to="/runtime">Inspect</Link>
            </div>
          </section>
        </aside>
      </section>

      <section className="overview-lower">
        <div className="overview-pipelines-card">
          <header className="overview-section-header">
            <div>
              <span className="overview-kicker">Workspace</span>
              <h2>Pipelines</h2>
            </div>
            <Link to="/pipelines">View all <b>&rarr;</b></Link>
          </header>

          <div className="overview-pipeline-table-head">
            <span>PIPELINE</span>
            <span>FLOW</span>
            <span>STATE</span>
            <span>MESSAGES</span>
          </div>

          {data.pipelines.length ? data.pipelines.map((pipeline: OperationalPipeline) => {
            const input = componentName(pipeline.authoring.input, "input")
            const output = componentName(pipeline.authoring.output, "output")
            const processorCount = Array.isArray(pipeline.authoring.processors) ? pipeline.authoring.processors.length : 0
            const status = pipelineStatus(pipeline)

            return (
              <Link
                className="overview-pipeline-row"
                key={pipeline.id}
                to="/pipelines/$pipelineId"
                params={{ pipelineId: pipeline.id }}
              >
                <div className="overview-pipeline-name">
                  <span className={"overview-flow-status " + status}><i /></span>
                  <div>
                    <strong>{pipeline.name}</strong>
                    <code>{pipeline.id}</code>
                  </div>
                </div>
                <div className="overview-pipeline-flow">
                  <span>{input}</span>
                  {processorCount ? <><b>&rarr;</b><span>{processorCount} processor{processorCount === 1 ? "" : "s"}</span></> : null}
                  <b>&rarr;</b>
                  <span>{output}</span>
                </div>
                <span className={"overview-pipeline-state " + status}>{status}</span>
                <strong className="overview-pipeline-messages">{formatCount(receivedMessages(pipeline))}</strong>
              </Link>
            )
          }) : (
            <div className="overview-table-empty">
              <span>No pipelines yet.</span>
              <Link to="/pipelines">Create one</Link>
            </div>
          )}
        </div>

        <aside className="overview-activity-card-small">
          <header className="overview-section-header">
            <div>
              <span className="overview-kicker">Signal</span>
              <h2>Recent activity</h2>
            </div>
            <Link to="/activity">All <b>&rarr;</b></Link>
          </header>

          {data.activity.length ? (
            <div className="overview-activity-list">
              {data.activity.slice(0, 7).map((event: ActivityEvent) => (
                <div className="overview-event" key={event.id}>
                  <span className={"overview-event-marker " + eventTone(event.type)} />
                  <div>
                    <strong>{event.detail}</strong>
                    <small>{event.pipelineName ?? "Porcelain"}  /  {relativeTime(event.timestamp)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overview-visual-empty overview-activity-empty">
              <span>No recent events.</span>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
