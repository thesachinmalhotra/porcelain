export type ConnectStream = {
  active: boolean
  uptime: number
  uptime_str: string
  config: Record<string, unknown>
}

export type ConnectStreamSummary = Omit<ConnectStream, "config">
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }
export type ConnectStreamStats = JsonObject
export type ConnectStreamConfig = Record<string, unknown>
export type ConnectResourceType = "cache" | "input" | "output" | "processor" | "rate_limit"

export class ConnectRequestError extends Error {
  readonly status: number

  constructor(method: string, path: string, status: number) {
    super("Connect request failed: " + method + " " + path + " (" + status + ")")
    this.name = "ConnectRequestError"
    this.status = status
  }
}

type FetchLike = typeof fetch

type ConnectClientOptions = {
  baseUrl: string
  fetch?: FetchLike
}

export function createConnectClient(options: ConnectClientOptions) {
  const request = options.fetch ?? fetch
  const baseUrl = options.baseUrl.replace(/\/$/, "")

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(baseUrl + path, init)
    if (!response.ok) {
      throw new ConnectRequestError(init?.method ?? "GET", path, response.status)
    }
    return (await response.json()) as T
  }

  async function requestNoContent(path: string, init: RequestInit): Promise<void> {
    const response = await request(baseUrl + path, init)
    if (!response.ok) {
      throw new ConnectRequestError(init.method ?? "GET", path, response.status)
    }
  }

  return {
    async probe(): Promise<{ reachable: boolean; ready: boolean }> {
      try {
        const response = await request(baseUrl + "/ready")
        return { reachable: true, ready: response.ok }
      } catch {
        return { reachable: false, ready: false }
      }
    },

    async ready(): Promise<boolean> {
      return (await this.probe()).ready
    },

    async listStreams(): Promise<Record<string, ConnectStreamSummary>> {
      return requestJson("/streams")
    },

    async getStream(id: string): Promise<ConnectStream> {
      return requestJson("/streams/" + encodeURIComponent(id))
    },

    async createStream(id: string, config: ConnectStreamConfig): Promise<void> {
      await requestNoContent("/streams/" + encodeURIComponent(id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      })
    },

    async updateStream(id: string, config: ConnectStreamConfig): Promise<void> {
      await requestNoContent("/streams/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      })
    },

    async patchStream(id: string, patch: ConnectStreamConfig): Promise<void> {
      await requestNoContent("/streams/" + encodeURIComponent(id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
    },

    async createResource(type: ConnectResourceType, id: string, config: ConnectStreamConfig): Promise<void> {
      await requestNoContent("/resources/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      })
    },

    async updateResource(type: ConnectResourceType, id: string, config: ConnectStreamConfig): Promise<void> {
      await requestNoContent("/resources/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      })
    },

    async deleteResource(type: ConnectResourceType, id: string): Promise<void> {
      await requestNoContent("/resources/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), {
        method: "DELETE",
      })
    },

    async deleteStream(id: string): Promise<void> {
      await requestNoContent("/streams/" + encodeURIComponent(id), { method: "DELETE" })
    },

    async getStreamStats(id: string): Promise<ConnectStreamStats> {
      return requestJson("/streams/" + encodeURIComponent(id) + "/stats")
    },
  }
}


