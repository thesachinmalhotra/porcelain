# Porcelain MCP

Porcelain exposes an MCP Streamable HTTP endpoint at `/api/mcp`. It uses the official Model Context Protocol TypeScript SDK v2.4.0, serves the modern `2026-07-28` protocol and retains the SDK's stateless 2025-era compatibility path. It delegates component discovery, configuration generation, linting, canonicalisation, tests and runtime inspection to Redpanda Connect's native CLI and Streams API.

## Local development

Start Porcelain normally (`npm run dev`). Connect an MCP client to:

```text
http://localhost:3000/api/mcp
```

For local development, the endpoint accepts loopback-host requests without a token. Do not expose this mode to a network. Requests using a non-loopback host or any production deployment require `PORCELAIN_MCP_TOKEN`.

## Authenticated access

Set a high-entropy bearer token in the Porcelain server environment:

```bash
export PORCELAIN_MCP_TOKEN="$(openssl rand -hex 32)"
```

For a client that accepts a URL-based Streamable HTTP MCP server, the local configuration is:

```json
{
  "mcpServers": {
    "porcelain": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

For remote or production access, configure the same URL with the client's supported custom-header mechanism. It must send:

```http
Authorization: Bearer <same-token>
```

Keep the endpoint behind HTTPS and a trusted reverse proxy when accessed remotely. Do not put the token in source control or browser code.

## MCP prompts and resources

- `build_redpanda_connect_pipeline` ? a reusable agent workflow prompt with the required safe authoring sequence.
- `porcelain://guide/agent-workflow` ? persistent architecture, tool-use and safety instructions available as an MCP resource.

## Available tools

### Connect discovery

- `connect_list_components` ? installed component inventory from `rpk connect list`.
- `connect_get_component_schema` ? native JSON schema for a component.
- `connect_generate_component_config` ? starter config from `rpk connect create`.

### Pipeline inspection and authoring

- `pipeline_list` ? saved Porcelain pipelines.
- `pipeline_get` ? saved native configuration and revision.
- `pipeline_create_draft` ? start an isolated draft from an existing pipeline.
- `pipeline_get_draft` ? inspect the current draft.
- `pipeline_apply_config` ? replace the complete native draft config (rejects drafts based on stale saved revisions).
- `pipeline_discard_draft` ? remove an agent draft without affecting the saved pipeline or runtime.
- `pipeline_validate_draft` ? native `rpk connect lint`.
- `pipeline_normalise_draft` ? native `rpk connect echo`, saving the canonical result.
- `pipeline_test_draft` ? native `rpk connect test` with supplied test YAML.
- `pipeline_get_runtime` and `pipeline_get_stats` ? native Streams API inspection.

Agent drafts are persisted under `.porcelain/agent-drafts.json`, separate from saved pipeline revisions. The active pipeline workspace polls this draft and projects its native config into the canvas and source editor. If the user has local unsaved edits, the workspace does not overwrite them; it marks the newer agent draft as waiting.

## Publishing boundary

MCP tools intentionally cannot publish, update or delete a running stream in this first iteration. `pipeline_apply_config` only mutates the isolated draft. The user reviews and publishes through Porcelain's existing lifecycle, which performs native validation and records revisions. This is deliberate: Connect stream updates restart the stream.

## Runtime requirements

- Node.js 22.12 or later.
- `rpk` available on the Porcelain server PATH, or `PORCELAIN_RPK_PATH` set.
- Redpanda Connect Streams API reachable at `PORCELAIN_CONNECT_URL` (defaults to `http://127.0.0.1:4195`).
- A persistent writable `.porcelain` directory for pipeline and agent-draft state.

This initial implementation is intended for a single Porcelain server instance with a local persistent workspace. Multi-instance deployment requires shared durable storage and coordinated draft concurrency before enabling remote agents.
