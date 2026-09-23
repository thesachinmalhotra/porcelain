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

export type ConnectRequestErrorDetails = {
  lintingErrors?: string[]
  message?: string
  raw?: unknown
}

export class ConnectRequestError extends Error {
  readonly status: number
  readonly details?: ConnectRequestErrorDetails

  constructor(method: string, path: string, status: number, details?: ConnectRequestErrorDetails) {
    const message = details?.lintingErrors?.length ? details.lintingErrors.join("\n") : details?.message
    super(message ? "Connect request failed: " + message : "Connect request failed: " + method + " " + path + " (" + status + ")")
    this.name = "ConnectRequestError"
    this.status = status
    this.details = details
  }
}

type FetchLike = typeof fetch

type ConnectClientOptions = {
  baseUrl: string
  fetch?: FetchLike
}

async function createRequestError(method: string, path: string, response: Response): Promise<ConnectRequestError> {
  const text = await response.text()
  if (!text.trim()) return new ConnectRequestError(method, path, response.status)
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const lintingErrors = Array.isArray(record.linting_errors) ? record.linting_errors.filter((value): value is string => typeof value === "string") : undefined
      const message = typeof record.message === "string" ? record.message : undefined
      return new ConnectRequestError(method, path, response.status, { lintingErrors, message, raw: parsed })
    }
  } catch {}
  return new ConnectRequestError(method, path, response.status, { message: text.trim(), raw: text })
}

export function createConnectClient(options: ConnectClientOptions) {
  const request = options.fetch ?? fetch
  const baseUrl = options.baseUrl.replace(/\/$/, "")

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(baseUrl + path, init)
    if (!response.ok) {
      throw await createRequestError(init?.method ?? "GET", path, response)
    }
    return (await response.json()) as T
  }

  async function requestNoContent(path: string, init: RequestInit): Promise<void> {
    const response = await request(baseUrl + path, init)
    if (!response.ok) {
      throw await createRequestError(init.method ?? "GET", path, response)
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


