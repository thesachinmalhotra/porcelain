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
  /**
   * Existing Connect fields are preserved so authoring edits do not erase settings Porcelain does not model yet.
   */
  connectConfig?: JsonObject
}

export type PipelineAuthoringComponent =
  | { kind: "input"; index?: never }
  | { kind: "buffer"; index?: never }
  | { kind: "processor"; index: number }
  | { kind: "output"; index?: never }

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
  if (
    authoring.processors !== undefined &&
    (!Array.isArray(authoring.processors) || authoring.processors.some((processor) => !isObject(processor)))
  ) {
    throw new Error("Pipeline processors must contain only objects")
  }
  if (!isObject(authoring.output)) throw new Error("Pipeline output must be an object")
  if (authoring.metadata !== undefined && !isObject(authoring.metadata)) {
    throw new Error("Pipeline metadata must be an object")
  }
  if (authoring.connectConfig !== undefined && !isObject(authoring.connectConfig)) {
    throw new Error("Pipeline connectConfig must be an object")
  }
}

export function authoringToConnectConfig(authoring: PipelineAuthoring): JsonObject {
  validatePipelineAuthoring(authoring)
  const config = cloneObject(authoring.connectConfig ?? {})
  config.input = cloneObject(authoring.input)
  config.output = cloneObject(authoring.output)

  if (authoring.buffer !== undefined) config.buffer = cloneObject(authoring.buffer)
  else delete config.buffer

  const existingPipeline = isObject(config.pipeline) ? cloneObject(config.pipeline) : undefined
  if (authoring.processors !== undefined) {
    config.pipeline = { ...(existingPipeline ?? {}), processors: authoring.processors.map(cloneObject) }
  } else if (existingPipeline && Object.keys(existingPipeline).length > 0) {
    config.pipeline = existingPipeline
  } else {
    delete config.pipeline
  }

  return config
}

export function updatePipelineAuthoring(
  authoring: PipelineAuthoring,
  component: PipelineAuthoringComponent,
  config: JsonObject,
): PipelineAuthoring {
  const next = cloneAuthoring(authoring)

  switch (component.kind) {
    case "input":
      next.input = cloneObject(config)
      break
    case "buffer":
      next.buffer = cloneObject(config)
      break
    case "processor":
      assertProcessorIndex(next, component.index)
      next.processors![component.index] = cloneObject(config)
      break
    case "output":
      next.output = cloneObject(config)
      break
  }

  return next
}

export function setPipelineAuthoringName(authoring: PipelineAuthoring, name: string): PipelineAuthoring {
  if (name.trim() === "") throw new Error("Pipeline name must be a non-empty string")
  return { ...cloneAuthoring(authoring), name }
}

export function setPipelineAuthoringBuffer(
  authoring: PipelineAuthoring,
  config: JsonObject | undefined,
): PipelineAuthoring {
  const next = cloneAuthoring(authoring)
  next.buffer = config === undefined ? undefined : cloneObject(config)
  return next
}

export function addPipelineProcessor(
  authoring: PipelineAuthoring,
  config: JsonObject,
  index = authoring.processors?.length ?? 0,
): PipelineAuthoring {
  const processors = [...(authoring.processors ?? [])]
  if (!Number.isInteger(index) || index < 0 || index > processors.length) {
    throw new Error("Processor index is out of range")
  }
  processors.splice(index, 0, cloneObject(config))
  return { ...cloneAuthoring(authoring), processors }
}

export function removePipelineProcessor(
  authoring: PipelineAuthoring,
  index: number,
): PipelineAuthoring {
  const processors = [...(authoring.processors ?? [])]
  assertProcessorIndex({ ...authoring, processors }, index)
  processors.splice(index, 1)
  return { ...cloneAuthoring(authoring), processors }
}

export function movePipelineProcessor(
  authoring: PipelineAuthoring,
  fromIndex: number,
  toIndex: number,
): PipelineAuthoring {
  const processors = [...(authoring.processors ?? [])]
  assertProcessorIndex({ ...authoring, processors }, fromIndex)
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= processors.length) {
    throw new Error("Processor index is out of range")
  }
  if (fromIndex === toIndex) return cloneAuthoring(authoring)

  const [processor] = processors.splice(fromIndex, 1)
  processors.splice(toIndex, 0, processor)
  return { ...cloneAuthoring(authoring), processors }
}

function assertProcessorIndex(authoring: PipelineAuthoring, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= (authoring.processors?.length ?? 0)) {
    throw new Error("Processor index is out of range")
  }
}

function cloneAuthoring(authoring: PipelineAuthoring): PipelineAuthoring {
  validatePipelineAuthoring(authoring)
  return {
    ...authoring,
    metadata: authoring.metadata ? cloneObject(authoring.metadata) : undefined,
    input: cloneObject(authoring.input),
    buffer: authoring.buffer ? cloneObject(authoring.buffer) : undefined,
    processors: authoring.processors?.map(cloneObject),
    output: cloneObject(authoring.output),
    connectConfig: authoring.connectConfig ? cloneObject(authoring.connectConfig) : undefined,
  }
}

function cloneObject(value: JsonObject): JsonObject {
  return structuredClone(value)
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
