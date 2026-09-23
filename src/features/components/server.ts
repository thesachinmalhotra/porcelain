import { createServerFn } from "@tanstack/react-start"
import type { JsonObject } from "../../pipeline/authoring"

export type ComponentsFilter =
  | "all"
  | "input"
  | "output"
  | "processor"
  | "buffer"
  | "cache"
  | "rate_limit"
  | "metric"
  | "tracer"

export const getComponents = createServerFn({ method: "GET" }).handler(async () => {
  const { discoverConnectCapabilities } = await import("../../runtime/connect/capabilities")
  return discoverConnectCapabilities()
})

export const createConnectComponentConfig = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!isRecord(input) || typeof input.kind !== "string" || typeof input.name !== "string") {
      throw new Error("Connect component kind and name are required")
    }
    return { kind: input.kind, name: input.name }
  })
  .handler(async ({ data }) => {
    const { createConnectConfig } = await import("../../runtime/connect/native-config")
    const expression = componentExpression(data.kind, data.name)
    const config = await createConnectConfig(expression)
    return extractComponentConfig(config, data.kind) as JsonObject
  })

export const validateConnectConfig = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!isRecord(input) || !isRecord(input.config)) throw new Error("Connect configuration is required")
    return { config: input.config as JsonObject }
  })
  .handler(async ({ data }) => {
    const { lintConnectConfig } = await import("../../runtime/connect/native-config")
    return lintConnectConfig(data.config)
  })

export const normalizeConnectConfig = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!isRecord(input) || !isRecord(input.config)) throw new Error("Connect configuration is required")
    return { config: input.config as JsonObject }
  })
  .handler(async ({ data }) => {
    const { echoConnectConfig } = await import("../../runtime/connect/native-config")
    return (await echoConnectConfig(data.config)) as JsonObject
  })

function componentExpression(kind: string, name: string): string {
  switch (kind) {
    case "input":
      return `${name}//drop`
    case "output":
      return `stdin//${name}`
    case "processor":
      return `stdin/${name}/stdout`
    default:
      throw new Error("Connect config generation is currently scoped to stream input, processor, and output components")
  }
}

function extractComponentConfig(config: Record<string, unknown>, kind: string): JsonObject {
  if (kind === "processor") {
    const pipeline = config.pipeline
    if (!isRecord(pipeline) || !Array.isArray(pipeline.processors) || !isRecord(pipeline.processors[0])) {
      throw new Error("Redpanda Connect generated no processor configuration")
    }
    return pipeline.processors[0] as JsonObject
  }

  const section = config[kind]
  if (!isRecord(section)) throw new Error("Redpanda Connect generated no " + kind + " configuration")
  return section as JsonObject
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
