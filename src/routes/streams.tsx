import { createFileRoute } from "@tanstack/react-router"
import { getOperationalWorkspace } from "../features/operations/server"
import { Icon } from "../components/app-shell"
export const Route = createFileRoute("/streams")({ loader: () => getOperationalWorkspace(), component: Streams })
function Streams() {
  const data = Route.useLoaderData()
  return <div className="workspace-page"><header className="page-header"><div><span className="eyebrow">Manage</span><h1>Connect streams</h1><p>The live Redpanda Connect streams associated with Porcelain pipelines.</p></div></header><section className="panel"><div className="panel-header"><div><h2>Streams</h2><p>{data.pipelines.length} managed streams</p></div></div><div className="pipeline-list">{data.pipelines.map((p) => <div className="pipeline-row" key={p.id}><span className="pipeline-icon"><Icon name="database" /></span><span className="pipeline-main"><strong>{p.connectStreamId ?? p.id}</strong><code>{p.name}</code></span><span className="row-runtime">{p.runtime.uptime}</span><span className={p.runtime.active ? "status status-running" : p.runtime.connected ? "status status-inactive" : "status status-disconnected"}><span className="status-dot" />{p.runtime.active ? "Running" : p.runtime.connected ? "Stopped" : "Unavailable"}</span></div>)}</div></section></div>
}
