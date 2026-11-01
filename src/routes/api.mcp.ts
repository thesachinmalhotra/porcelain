import { createFileRoute } from "@tanstack/react-router"
import { handlePorcelainMcpRequest } from "../runtime/connect/mcp.server"

export const Route = createFileRoute("/api/mcp")({
  server: { handlers: { POST: async ({ request }) => handlePorcelainMcpRequest(request) } },
})
