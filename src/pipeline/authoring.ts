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

export type ConnectConfigPathSegment = string | number

export type PipelineAuthoringProjection = {
  input: JsonObject
  buffer?: JsonObject
  processors?: JsonObject[]
  output: JsonObject
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
  if (authoring.connectConfig) return cloneObject(authoring.connectConfig)

  // Legacy authoring records without a native snapshot are projected once into
  // the native Connect shape. New mutations always persist the native snapshot.
  const config: JsonObject = {}
  config.input = cloneObject(authoring.input)
  config.output = cloneObject(authoring.output)

  if (authoring.buffer !== undefined) config.buffer = cloneObject(authoring.buffer)
  else delete config.buffer

  if (authoring.processors !== undefined) {
    const pipeline = isObject(config.pipeline) ? cloneObject(config.pipeline) : {}
    if (authoring.processors.length === 0) delete pipeline.processors
    else pipeline.processors = authoring.processors.map(cloneObject)
    if (Object.keys(pipeline).length === 0) delete config.pipeline
    else config.pipeline = pipeline
  } else if (isObject(config.pipeline)) {
    const pipeline = cloneObject(config.pipeline)
    delete pipeline.processors
    if (Object.keys(pipeline).length === 0) delete config.pipeline
    else config.pipeline = pipeline
  }
  return config
}

export function replacePipelineAuthoringConfig(
  authoring: PipelineAuthoring,
  config: JsonObject,
): PipelineAuthoring {
  validatePipelineAuthoring(authoring)
  if (!isObject(config.input)) throw new Error("Connect configuration input must be an object")
  if (!isObject(config.output)) throw new Error("Connect configuration output must be an object")

  const pipeline = isObject(config.pipeline) ? config.pipeline : undefined
  const processors = pipeline && Array.isArray(pipeline.processors)
    ? pipeline.processors.map((processor) => {
        if (!isObject(processor)) throw new Error("Connect processor configuration must be an object")
        return cloneObject(processor)
      })
    : undefined

  const next: PipelineAuthoring = {
    ...cloneAuthoring(authoring),
    input: cloneObject(config.input),
    buffer: isObject(config.buffer) ? cloneObject(config.buffer) : undefined,
    processors,
    output: cloneObject(config.output),
  }
  next.connectConfig = cloneObject(config)
  return next
}

export function updatePipelineAuthoring(
  authoring: PipelineAuthoring,
  component: PipelineAuthoringComponent,
  config: JsonObject,
): PipelineAuthoring {
  const next = replacePipelineAuthoringConfig(authoring, updateNativeComponent(authoringToConnectConfig(authoring), component, config))
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
  const native = authoringToConnectConfig(authoring)
  if (config === undefined) delete native.buffer
  else native.buffer = cloneObject(config)
  return replacePipelineAuthoringConfig(authoring, native)
}

export function addPipelineProcessor(
  authoring: PipelineAuthoring,
  config: JsonObject,
  index = authoring.processors?.length ?? 0,
): PipelineAuthoring {
  const native = authoringToConnectConfig(authoring)
  const pipeline = isObject(native.pipeline) ? cloneObject(native.pipeline) : {}
  const processors = Array.isArray(pipeline.processors) ? pipeline.processors.map((item) => {
    if (!isObject(item)) throw new Error("Pipeline processors must contain only objects")
    return cloneObject(item)
  }) : []
  if (!Number.isInteger(index) || index < 0 || index > processors.length) {
    throw new Error("Processor index is out of range")
  }
  processors.splice(index, 0, cloneObject(config))
  pipeline.processors = processors
  native.pipeline = pipeline
  return replacePipelineAuthoringConfig(authoring, native)
}

export function removePipelineProcessor(
  authoring: PipelineAuthoring,
  index: number,
): PipelineAuthoring {
  const native = authoringToConnectConfig(authoring)
  const pipeline = isObject(native.pipeline) ? cloneObject(native.pipeline) : {}
  const processors = Array.isArray(pipeline.processors) ? pipeline.processors.map((item) => {
    if (!isObject(item)) throw new Error("Pipeline processors must contain only objects")
    return cloneObject(item)
  }) : []
  assertProcessorIndex({ ...authoring, processors }, index)
  processors.splice(index, 1)
  if (processors.length === 0) delete pipeline.processors
  else pipeline.processors = processors
  if (Object.keys(pipeline).length === 0) delete native.pipeline
  else native.pipeline = pipeline
  return replacePipelineAuthoringConfig(authoring, native)
}

export function movePipelineProcessor(
  authoring: PipelineAuthoring,
  fromIndex: number,
  toIndex: number,
): PipelineAuthoring {
  const native = authoringToConnectConfig(authoring)
  const pipeline = isObject(native.pipeline) ? cloneObject(native.pipeline) : {}
  const processors = Array.isArray(pipeline.processors) ? pipeline.processors.map((item) => {
    if (!isObject(item)) throw new Error("Pipeline processors must contain only objects")
    return cloneObject(item)
  }) : []
  assertProcessorIndex({ ...authoring, processors }, fromIndex)
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= processors.length) {
    throw new Error("Processor index is out of range")
  }
  if (fromIndex === toIndex) return cloneAuthoring(authoring)

  const [processor] = processors.splice(fromIndex, 1)
  processors.splice(toIndex, 0, processor)
  pipeline.processors = processors
  native.pipeline = pipeline
  return replacePipelineAuthoringConfig(authoring, native)
}

export type PipelineConnection = {
  source: PipelineAuthoringComponent
  target: PipelineAuthoringComponent
}

export type PipelineConnectionValidation = {
  valid: boolean
  reason?: string
}

export function validatePipelineConnection(
  authoring: PipelineAuthoring,
  connection: PipelineConnection,
): PipelineConnectionValidation {
  const { source, target } = connection
  if (target.kind === "input" || source.kind === "output") return { valid: false, reason: "Inputs only receive the stream from outside; outputs terminate it." }
  if (source.kind === "buffer" && target.kind === "buffer") return { valid: false, reason: "A Connect stream can contain only one buffer." }
  if (source.kind === "input" && target.kind === "buffer") return authoring.buffer === undefined ? { valid: false, reason: "Add a buffer before connecting the input to it." } : { valid: true }
  if (source.kind === "buffer" && target.kind === "processor") return isProcessorIndex(authoring, target.index) ? { valid: true } : { valid: false, reason: "That processor no longer exists in the authored pipeline." }
  if (source.kind === "input" && target.kind === "processor") {
    if (authoring.buffer !== undefined) return { valid: false, reason: "The configured buffer sits between the input and processor pipeline." }
    return isProcessorIndex(authoring, target.index) ? { valid: true } : { valid: false, reason: "That processor no longer exists in the authored pipeline." }
  }
  if (source.kind === "processor" && target.kind === "processor") {
    if (!isProcessorIndex(authoring, source.index) || !isProcessorIndex(authoring, target.index)) return { valid: false, reason: "One of the selected processors no longer exists in the authored pipeline." }
    return source.index === target.index ? { valid: false, reason: "A processor cannot connect to itself." } : { valid: true }
  }
  if (source.kind === "processor" && target.kind === "output") return isProcessorIndex(authoring, source.index) ? { valid: true } : { valid: false, reason: "That processor no longer exists in the authored pipeline." }
  if (source.kind === "buffer" && target.kind === "output") return (authoring.processors?.length ?? 0) > 0 ? { valid: false, reason: "Processors sit between the buffer and output." } : { valid: true }
  if (source.kind === "input" && target.kind === "output") return authoring.buffer !== undefined || (authoring.processors?.length ?? 0) > 0 ? { valid: false, reason: "Configured pipeline components must remain between input and output." } : { valid: true }
  return { valid: false, reason: "That connection is not valid for a Connect stream." }
}

export function connectPipelineAuthoring(
  authoring: PipelineAuthoring,
  connection: PipelineConnection,
): PipelineAuthoring {
  const validation = validatePipelineConnection(authoring, connection)
  if (!validation.valid) throw new Error(validation.reason)

  const { source, target } = connection

  if (source.kind === "input" && target.kind === "buffer") return cloneAuthoring(authoring)
  if (source.kind === "buffer" && target.kind === "processor") return movePipelineProcessor(authoring, target.index, 0)
  if (source.kind === "input" && target.kind === "processor") return movePipelineProcessor(authoring, target.index, 0)
  if (source.kind === "processor" && target.kind === "processor") {
    const toIndex = source.index < target.index ? target.index - 1 : target.index
    return movePipelineProcessor(authoring, source.index, toIndex)
  }
  if (source.kind === "processor" && target.kind === "output") return movePipelineProcessor(authoring, source.index, (authoring.processors?.length ?? 1) - 1)
  if (source.kind === "buffer" && target.kind === "output") return cloneAuthoring(authoring)
  if (source.kind === "input" && target.kind === "output") return cloneAuthoring(authoring)

  throw new Error("That connection is not valid for a Connect stream")
}

export function disconnectPipelineAuthoring(_authoring: PipelineAuthoring, _connection: PipelineConnection): never {
  throw new Error("Connect streams do not persist disconnected edges; remove or reorder the component instead.")
}

export function updatePipelineAuthoringAtPath(
  authoring: PipelineAuthoring,
  path: ConnectConfigPathSegment[],
  value: JsonValue,
): PipelineAuthoring {
  if (path.length === 0) {
    if (!isObject(value)) throw new Error("Native Connect configuration must be an object")
    return replacePipelineAuthoringConfig(authoring, value)
  }

  const native = authoringToConnectConfig(authoring)
  setJsonPath(native, path, value)
  return replacePipelineAuthoringConfig(authoring, native)
}

export function projectPipelineAuthoring(authoring: PipelineAuthoring): PipelineAuthoringProjection {
  return projectConnectConfig(authoringToConnectConfig(authoring))
}

export function projectConnectConfig(config: JsonObject): PipelineAuthoringProjection {
  if (!isObject(config.input)) throw new Error("Connect configuration input must be an object")
  if (!isObject(config.output)) throw new Error("Connect configuration output must be an object")

  const pipeline = isObject(config.pipeline) ? config.pipeline : undefined
  const processors = pipeline && Array.isArray(pipeline.processors)
    ? pipeline.processors.map((processor) => {
        if (!isObject(processor)) throw new Error("Connect processor configuration must be an object")
        return cloneObject(processor)
      })
    : undefined

  return {
    input: cloneObject(config.input),
    buffer: isObject(config.buffer) ? cloneObject(config.buffer) : undefined,
    processors,
    output: cloneObject(config.output),
  }
}

function updateNativeComponent(
  config: JsonObject,
  component: PipelineAuthoringComponent,
  value: JsonObject,
): JsonObject {
  const next = cloneObject(config)
  switch (component.kind) {
    case "input":
      next.input = cloneObject(value)
      break
    case "buffer":
      next.buffer = cloneObject(value)
      break
    case "output":
      next.output = cloneObject(value)
      break
    case "processor": {
      const pipeline = isObject(next.pipeline) ? cloneObject(next.pipeline) : {}
      const processors = Array.isArray(pipeline.processors) ? pipeline.processors.map((item) => {
        if (!isObject(item)) throw new Error("Pipeline processors must contain only objects")
        return cloneObject(item)
      }) : []
      if (component.index < 0 || component.index >= processors.length) throw new Error("Processor index is out of range")
      processors[component.index] = cloneObject(value)
      pipeline.processors = processors
      next.pipeline = pipeline
      break
    }
  }
  return next
}

function assertProcessorIndex(authoring: PipelineAuthoring, index: number): void {
  if (!isProcessorIndex(authoring, index)) {
    throw new Error("Processor index is out of range")
  }
}

function isProcessorIndex(authoring: PipelineAuthoring, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < (authoring.processors?.length ?? 0)
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

function setJsonPath(root: JsonObject, path: ConnectConfigPathSegment[], value: JsonValue): void {
  let cursor: JsonObject | JsonValue[] = root
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const next = path[index + 1]
    if (Array.isArray(cursor)) {
      if (typeof segment !== "number") throw new Error("Array path segments must be numbers")
      if (!cursor[segment] || typeof cursor[segment] !== "object") cursor[segment] = typeof next === "number" ? [] : {}
      cursor = cursor[segment] as JsonObject | JsonValue[]
    } else {
      const key = String(segment)
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = typeof next === "number" ? [] : {}
      cursor = cursor[key] as JsonObject | JsonValue[]
    }
  }

  const leaf = path[path.length - 1]
  if (Array.isArray(cursor)) {
    if (typeof leaf !== "number") throw new Error("Array path segments must be numbers")
    cursor[leaf] = structuredClone(value)
  } else {
    cursor[String(leaf)] = structuredClone(value)
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
