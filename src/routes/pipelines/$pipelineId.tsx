import { createFileRoute, notFound } from "@tanstack/react-router"
import { PipelineWorkspace } from "../../features/pipelines/pipeline-workspace"
import { getPipelineWorkspace } from "../../features/pipelines/server"

export const Route = createFileRoute("/pipelines/$pipelineId")({
  loader: async ({ params }) => {
    const workspace = await getPipelineWorkspace()
    if (!workspace.pipelines.some((pipeline) => pipeline.id === params.pipelineId)) throw notFound()
    return workspace
  },
  component: PipelinePage,
})

function PipelinePage() {
  const workspace = Route.useLoaderData()
  const { pipelineId } = Route.useParams()
  return <PipelineWorkspace {...workspace} pipelineId={pipelineId} />
}
