import { createFileRoute } from "@tanstack/react-router"
import { PipelineWorkspace } from "../../features/pipelines/pipeline-workspace"
import { getPipelineWorkspace } from "../../features/pipelines/server"
import { getComponents } from "../../features/components/server"
import type { ConnectComponentCapability } from "../../runtime/connect/capabilities.server"

export const Route = createFileRoute("/pipelines/$pipelineId")({
  loader: async ({ params }) => {
    const workspace = await getPipelineWorkspace()
    let components: ConnectComponentCapability[]
    try {
      components = (await getComponents()).components
    } catch {
      components = []
    }
    return { ...workspace, components }
  },
  component: PipelinePage,
})

function PipelinePage() {
  const workspace = Route.useLoaderData()
  const { pipelineId } = Route.useParams()
  return <PipelineWorkspace {...workspace} pipelineId={pipelineId} />
}
