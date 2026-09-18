export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export type PipelineAuthoring = {
  id: string
  name: string
  metadata?: JsonObject
  input: JsonObject
  buffer?: JsonObject
  processors?: JsonObject[]
  output: JsonObject
  /** Existing Connect fields are preserved so authoring edits do not erase settings Porcelain does not model yet. */
  connectConfig?: JsonObject
}

export function validatePipelineAuthoring(input: unknown): asserts input is PipelineAuthoring {
  if (!isObject(input)) throw new Error("Pipeline authoring must be an object")
  const authoring = input as Partial<PipelineAuthoring>
  if (typeof authoring.id !== "string" || authoring.id.trim() === "") {
    throw new Error("Pipeline id must be a non-empty string")
  }
  if (typeof authoring.name !== "string" || authoring.name.trim() === "") {
    throw new Error("Pipeline name must be a non-empty string")
  }
  if (!isObject(authoring.input)) throw new Error("Pipeline input must be an object")
  if (authoring.buffer !== undefined && !isObject(authoring.buffer)) {
    throw new Error("Pipeline buffer must be an object")
  }
  if (authoring.processors !== undefined && (!Array.isArray(authoring.processors) || authoring.processors.some((processor) => !isObject(processor)))) {
    throw new Error("Pipeline processors must contain only objects")
  }
  if (!isObject(authoring.output)) throw new Error("Pipeline output must be an object")
  if (authoring.metadata !== undefined && !isObject(authoring.metadata)) throw new Error("Pipeline metadata must be an object")
  if (authoring.connectConfig !== undefined && !isObject(authoring.connectConfig)) throw new Error("Pipeline connectConfig must be an object")
}

export function authoringToConnectConfig(authoring: PipelineAuthoring): JsonObject {
  validatePipelineAuthoring(authoring)
  const config = { ...(authoring.connectConfig ?? {}) }
  config.input = authoring.input
  config.output = authoring.output

  if (authoring.buffer !== undefined) config.buffer = authoring.buffer
  else delete config.buffer

  const existingPipeline = isObject(config.pipeline) ? { ...config.pipeline } : undefined
  if (authoring.processors !== undefined) {
    config.pipeline = { ...(existingPipeline ?? {}), processors: authoring.processors }
  } else if (existingPipeline && Object.keys(existingPipeline).length > 0) {
    config.pipeline = existingPipeline
  } else {
    delete config.pipeline
  }

  return config
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
