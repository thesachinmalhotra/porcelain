import type { PipelineCreate, PipelineDefinition, PipelineUpdate } from "./store"
import { authoringToConnectConfig, validatePipelineAuthoring, type PipelineAuthoring } from "./authoring"

type CreateLifecycle = {
  createPipeline(definition: PipelineCreate): Promise<PipelineDefinition>
}

type UpdateLifecycle = {
  updatePipeline(id: string, update: PipelineUpdate): Promise<PipelineDefinition>
}

export async function createAuthoredPipeline({
  lifecycle,
  authoring,
}: {
  lifecycle: CreateLifecycle
  authoring: PipelineAuthoring
}): Promise<PipelineDefinition> {
  validatePipelineAuthoring(authoring)
  return lifecycle.createPipeline({
    id: authoring.id,
    name: authoring.name,
    metadata: authoring.metadata ?? {},
    desiredConfig: authoringToConnectConfig(authoring),
  })
}

export async function updateAuthoredPipeline({
  lifecycle,
  id,
  authoring,
}: {
  lifecycle: UpdateLifecycle
  id: string
  authoring: PipelineAuthoring
}): Promise<PipelineDefinition> {
  validatePipelineAuthoring(authoring)
  if (authoring.id !== id) throw new Error("Pipeline authoring id must match the pipeline id")
  return lifecycle.updatePipeline(id, {
    name: authoring.name,
    metadata: authoring.metadata ?? {},
    desiredConfig: authoringToConnectConfig(authoring),
  })
}
