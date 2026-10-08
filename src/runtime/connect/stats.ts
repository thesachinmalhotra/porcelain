import type { ConnectStreamStats } from "./client"

export type ConnectComponentRuntimeStats = {
  path: string
  received: number | null
  sent: number | null
  errors: number
  connectionFailures: number
  connectionLosses: number
  latencyP50Ms: number | null
}

function metricName(key: string): string {
  return key.split("{", 1)[0]
}

function metricPath(key: string): string | null {
  return key.match(/(?:^|,)path="([^"]*)"/)?.[1] ?? null
}

function numericMetric(stats: ConnectStreamStats, name: string, path: string): number | null {
  for (const [key, value] of Object.entries(stats)) {
    if (metricName(key) !== name || metricPath(key) !== path || typeof value !== "number") continue
    return value
  }
  return null
}

function readLatencyP50Ms(stats: ConnectStreamStats, name: string, path: string): number | null {
  for (const [key, value] of Object.entries(stats)) {
    if (metricName(key) !== name || metricPath(key) !== path || !isLatencySummary(value)) continue
    return value.p50 / 1_000_000
  }
  return null
}

function isLatencySummary(value: unknown): value is { p50: number } {
  return typeof value === "object" && value !== null && "p50" in value && typeof value.p50 === "number"
}

export function connectComponentRuntimeStats(
  stats: ConnectStreamStats | null,
  path: string,
  kind: "input" | "buffer" | "processor" | "output",
): ConnectComponentRuntimeStats | null {
  if (!stats) return null

  const prefix = kind === "input" ? "input" : kind === "buffer" ? "buffer" : kind === "processor" ? "processor" : "output"
  const received = numericMetric(stats, `${prefix}_received`, path)
  const sent = numericMetric(stats, `${prefix}_sent`, path)
  const errors = numericMetric(stats, `${prefix}_error`, path) ?? 0
  const connectionFailures = numericMetric(stats, `${prefix}_connection_failed`, path) ?? 0
  const connectionLosses = numericMetric(stats, `${prefix}_connection_lost`, path) ?? 0
  const latencyP50Ms = readLatencyP50Ms(stats, `${prefix}_latency_ns`, path)

  if (received === null && sent === null && errors === 0 && connectionFailures === 0 && connectionLosses === 0 && latencyP50Ms === null) return null
  return { path, received, sent, errors, connectionFailures, connectionLosses, latencyP50Ms }
}

export function connectPipelineRuntimeSummary(stats: ConnectStreamStats | null) {
  const input = connectComponentRuntimeStats(stats, "root.input", "input")
  const output = connectComponentRuntimeStats(stats, "root.output", "output")
  const processorPaths = stats
    ? [...new Set(Object.keys(stats).map(metricPath).filter((path): path is string => path !== null && path.startsWith("root.pipeline.processors.")))]
    : []
  const processors = processorPaths.sort((a, b) => Number(a.split(".").at(-1)) - Number(b.split(".").at(-1)))
    .map((path) => connectComponentRuntimeStats(stats, path, "processor"))

  return {
    received: input?.received ?? null,
    sent: output?.sent ?? null,
    errors: (input?.errors ?? 0) + processors.reduce((sum, item) => sum + (item?.errors ?? 0), 0) + (output?.errors ?? 0),
    input,
    processors,
    output,
  }
}
