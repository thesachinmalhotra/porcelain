export type PipelineAuthoring = {
  id: string
  name: string
  metadata?: Record<string, unknown>
  input: Record<string, unknown>
  buffer?: Record<string, unknown>
  processors?: Array<Record<string, unknown>>
  output: Record<string, unknown>
}

export function validatePipelineAuthoring(authoring: PipelineAuthoring): void {
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
}

export function authoringToConnectConfig(authoring: PipelineAuthoring): Record<string, unknown> {
  validatePipelineAuthoring(authoring)
  return {
    input: authoring.input,
    ...(authoring.buffer ? { buffer: authoring.buffer } : {}),
    ...(authoring.processors?.length ? { pipeline: { processors: authoring.processors } } : {}),
    output: authoring.output,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
