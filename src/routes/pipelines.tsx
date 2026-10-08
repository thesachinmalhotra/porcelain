import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/pipelines")({
  component: PipelinesLayout,
})

function PipelinesLayout() {
  return <Outlet />
}
