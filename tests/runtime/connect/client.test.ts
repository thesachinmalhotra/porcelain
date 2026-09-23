import { describe, expect, it } from "vitest"
import { createConnectClient } from "../../../src/runtime/connect/client"

describe("ConnectClient", () => {
  it("reads stream lifecycle state from the Streams API", async () => {
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input) => {
        expect(input).toBe("http://connect.test/streams/orders")
        return new Response(
          JSON.stringify({
            active: true,
            uptime: 12.5,
            uptime_str: "12.5s",
            config: { input: { stdin: {} }, output: { drop: {} } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    })

    await expect(client.getStream("orders")).resolves.toEqual({
      active: true,
      uptime: 12.5,
      uptime_str: "12.5s",
      config: { input: { stdin: {} }, output: { drop: {} } },
    })
  })
})


describe("ConnectClient lifecycle operations", () => {
  it("lists streams from the Streams API", async () => {
    const client = createConnectClient({
      baseUrl: "http://connect.test/",
      fetch: async (input) => {
        expect(input).toBe("http://connect.test/streams")
        return new Response(JSON.stringify({ orders: { active: true, uptime: 3, uptime_str: "3s" }}), { status: 200 })
      },
    })

    await expect(client.listStreams()).resolves.toEqual({
      orders: { active: true, uptime: 3, uptime_str: "3s" },
    })
  })

  it("distinguishes reachability from readiness", async () => {
    const readyClient = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input) => {
        expect(input).toBe("http://connect.test/ready")
        return new Response("OK", { status: 200 })
      },
    })
    await expect(readyClient.probe()).resolves.toEqual({ reachable: true, ready: true })

    const degradedClient = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async () => new Response("faulty stream", { status: 503 }),
    })
    await expect(degradedClient.probe()).resolves.toEqual({ reachable: true, ready: false })
  })

  it("creates a stream with the exact Connect stream config", async () => {
    const config = { input: { stdin: {} }, buffer: { none: {} }, pipeline: { processors: [] }, output: { drop: {} } }
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input, init) => {
        expect(input).toBe("http://connect.test/streams/orders")
        expect(init?.method).toBe("POST")
        expect(init?.headers).toEqual({ "content-type": "application/json" })
        expect(init?.body).toBe(JSON.stringify(config))
        return new Response("", { status: 200 })
      },
    })

    await expect(client.createStream("orders", config)).resolves.toBeUndefined()
  })

  it("replaces a stream with PUT", async () => {
    const config = { input: { stdin: {} }, output: { drop: {} } }
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input, init) => {
        expect(input).toBe("http://connect.test/streams/orders")
        expect(init?.method).toBe("PUT")
        expect(init?.body).toBe(JSON.stringify(config))
        return new Response("", { status: 200 })
      },
    })

    await expect(client.updateStream("orders", config)).resolves.toBeUndefined()
  })

  it("patches a stream with PATCH", async () => {
    const patch = { output: { drop: {} } }
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input, init) => {
        expect(input).toBe("http://connect.test/streams/orders")
        expect(init?.method).toBe("PATCH")
        expect(init?.body).toBe(JSON.stringify(patch))
        return new Response("", { status: 200 })
      },
    })

    await expect(client.patchStream("orders", patch)).resolves.toBeUndefined()
  })

  it("deletes a stream", async () => {
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input, init) => {
        expect(input).toBe("http://connect.test/streams/orders")
        expect(init?.method).toBe("DELETE")
        return new Response(null, { status: 204 })
      },
    })

    await expect(client.deleteStream("orders")).resolves.toBeUndefined()
  })

  it("reads stream stats", async () => {
    const stats = { input: { records: 10 }, output: { records: 9 } }
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input) => {
        expect(input).toBe("http://connect.test/streams/orders/stats")
        return new Response(JSON.stringify(stats), { status: 200 })
      },
    })

    await expect(client.getStreamStats("orders")).resolves.toEqual(stats)
  })

  it("manages Connect resources through the native resources API", async () => {
    const calls: Array<{ path: string; method: string }> = []
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async (input, init) => {
        calls.push({ path: String(input), method: init?.method ?? "GET" })
        return new Response("", { status: 200 })
      },
    })

    await client.createResource("cache", "orders-cache", { memory: {} })
    await client.updateResource("cache", "orders-cache", { memory: { ttl: "1m" } })
    await client.deleteResource("cache", "orders-cache")

    expect(calls).toEqual([
      { path: "http://connect.test/resources/cache/orders-cache", method: "POST" },
      { path: "http://connect.test/resources/cache/orders-cache", method: "PUT" },
      { path: "http://connect.test/resources/cache/orders-cache", method: "DELETE" },
    ])
  })
})

describe("ConnectClient availability", () => {
  it("reports false readiness when Connect cannot be reached", async () => {
    const client = createConnectClient({
      baseUrl: "http://connect.test",
      fetch: async () => {
        throw new Error("connection refused")
      },
    })

    await expect(client.probe()).resolves.toEqual({ reachable: false, ready: false })
  })
})
