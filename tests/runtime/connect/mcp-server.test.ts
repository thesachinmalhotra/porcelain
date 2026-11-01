import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { afterEach, describe, expect, it } from "vitest"
import { createPorcelainMcpServer, handlePorcelainMcpRequest } from "../../../src/runtime/connect/mcp.server"

describe("Porcelain MCP server", () => {
  it("exposes a curated native Connect and pipeline tool surface over MCP", async () => {
    const server = createPorcelainMcpServer()
    const client = new Client({ name: "porcelain-mcp-test", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      const result = await client.listTools()
      const names = result.tools.map((tool) => tool.name)
      expect(names).toEqual(expect.arrayContaining([
        "connect_list_components", "connect_get_component_schema", "connect_generate_component_config",
        "pipeline_list", "pipeline_get", "pipeline_create_draft", "pipeline_get_draft",
        "pipeline_apply_config", "pipeline_discard_draft", "pipeline_validate_draft", "pipeline_normalise_draft",
        "pipeline_test_draft", "pipeline_get_runtime", "pipeline_get_stats",
      ]))
      expect(result.tools.find((tool) => tool.name === "pipeline_apply_config")?.annotations?.destructiveHint).toBe(false)
      expect(names).not.toContain("pipeline_publish")
      expect((await client.listPrompts()).prompts.map((prompt) => prompt.name)).toContain("build_redpanda_connect_pipeline")
      expect((await client.listResources()).resources.map((resource) => resource.uri)).toContain("porcelain://guide/agent-workflow")
    } finally {
      await client.close()
      await server.close()
    }
  })

  it("negotiates the modern 2026-07-28 protocol over Streamable HTTP", async () => {
    const client = new Client({ name: "porcelain-modern-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } })
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
      fetch: (url, init) => handlePorcelainMcpRequest(new Request(url, init)),
    })
    try {
      await client.connect(transport)
      expect(client.getProtocolEra()).toBe("modern")
      const tools = await client.listTools()
      expect(tools.tools.map((tool) => tool.name)).toContain("pipeline_apply_config")
      expect((await client.listPrompts()).prompts.map((prompt) => prompt.name)).toContain("build_redpanda_connect_pipeline")
      expect((await client.listResources()).resources.map((resource) => resource.uri)).toContain("porcelain://guide/agent-workflow")
    } finally {
      await client.close()
    }
  })

  it("retains the stateless 2025 protocol compatibility path", async () => {
    const client = new Client({ name: "porcelain-legacy-test", version: "1.0.0" })
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/api/mcp"), {
      fetch: (url, init) => handlePorcelainMcpRequest(new Request(url, init)),
    })
    try {
      await client.connect(transport)
      expect(client.getProtocolEra()).toBe("legacy")
      expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("pipeline_list")
    } finally {
      await client.close()
    }
  })

  it("rejects cross-origin requests even when a bearer token is configured", async () => {
    const previousToken = process.env.PORCELAIN_MCP_TOKEN
    try {
      process.env.PORCELAIN_MCP_TOKEN = "test-secret"
      const response = await handlePorcelainMcpRequest(new Request("https://porcelain.example/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer test-secret", origin: "https://attacker.example" },
        body: "{}",
      }))
      expect(response.status).toBe(403)
    } finally {
      if (previousToken === undefined) delete process.env.PORCELAIN_MCP_TOKEN
      else process.env.PORCELAIN_MCP_TOKEN = previousToken
    }
  })

  it("requires a bearer token for non-local or production access", async () => {
    const previousToken = process.env.PORCELAIN_MCP_TOKEN
    const previousNodeEnv = process.env.NODE_ENV
    try {
      delete process.env.PORCELAIN_MCP_TOKEN
      process.env.NODE_ENV = "production"
      const response = await handlePorcelainMcpRequest(new Request("https://porcelain.example/api/mcp", { method: "POST", body: "{}" }))
      expect(response.status).toBe(503)
    } finally {
      if (previousToken === undefined) delete process.env.PORCELAIN_MCP_TOKEN
      else process.env.PORCELAIN_MCP_TOKEN = previousToken
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  })
})
