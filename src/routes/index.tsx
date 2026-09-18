import { createFileRoute, redirect } from "@tanstack/react-router"
import { PipelineWorkspace } from "../features/pipelines/pipeline-workspace"
import { getPipelineWorkspace } from "../features/pipelines/server"

export const Route = createFileRoute("/")({
  loader: async () => {
    const workspace = await getPipelineWorkspace()
    if (workspace.pipelines[0]) {
      throw redirect({ to: "/pipelines/$pipelineId", params: { pipelineId: workspace.pipelines[0].id } })
    }
    throw redirect({ to: "/pipelines" })
    return workspace
  },
  component: Home,
})

function Home() {
  const workspace = Route.useLoaderData()
  return <PipelineWorkspace {...workspace} />
}
