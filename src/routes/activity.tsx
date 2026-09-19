import { createFileRoute } from "@tanstack/react-router"
import { getOperationalWorkspace } from "../features/operations/server"
import { Icon } from "../components/app-shell"
export const Route = createFileRoute("/activity")({ loader: () => getOperationalWorkspace(), component: Activity })
function Activity() {
  const data = Route.useLoaderData()
  return <div className="workspace-page"><header className="page-header"><div><span className="eyebrow">Operate</span><h1>Activity</h1><p>A durable timeline of pipeline lifecycle and runtime changes.</p></div></header><section className="panel"><div className="panel-header"><div><h2>Event timeline</h2><p>{data.activity.length} recorded events</p></div></div><div className="activity-list activity-page-list">{data.activity.length ? data.activity.map((event) => <article className="activity-item" key={event.id}><span className="activity-icon"><Icon name={event.type.startsWith("runtime") ? "pulse" : "pipeline"} /></span><div><strong>{event.detail}</strong><small>{event.pipelineName ?? event.pipelineId ?? "Porcelain"} · {new Date(event.timestamp).toLocaleString()}</small></div><code>{event.type}</code></article>) : <div className="empty-state"><div className="empty-icon"><Icon name="activity" /></div><h3>No activity yet</h3><p>Create, publish, or run a pipeline and its lifecycle will appear here.</p></div>}</div></section></div>
}
