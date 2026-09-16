import { createFileRoute } from "@tanstack/react-router"
import { PipelineWorkspace } from "../features/pipelines/pipeline-workspace"
import { getPipelineWorkspace } from "../features/pipelines/server"

export const Route = createFileRoute("/")({
  loader: () => getPipelineWorkspace(),
  component: Home,
})

function Home() {
  const workspace = Route.useLoaderData()

  return <PipelineWorkspace {...workspace} />
}
