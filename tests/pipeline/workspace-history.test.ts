import { describe, expect, it } from "vitest"
import type { PipelineAuthoring } from "../../src/pipeline/authoring"
import { createHistory, pushHistory, redoHistory, undoHistory } from "../../src/features/pipelines/workspace-history"

const initial: PipelineAuthoring = {
  id: "history-test",
  name: "History test",
  input: { stdin: {} },
  processors: [{ mapping: "root = this" }],
  output: { stdout: {} },
}

describe("pipeline workspace history", () => {
  it("undoes and redoes authoring states without sharing references", () => {
    const changed: PipelineAuthoring = { ...initial, processors: [{ mapping: "root = this.uppercase()" }] }
    const history = pushHistory(createHistory(initial), changed)
    const undone = undoHistory(history)
    expect(undone.present).toEqual(initial)
    const redone = redoHistory(undone)
    expect(redone.present).toEqual(changed)
    expect(redone.present).not.toBe(changed)
  })

  it("clears redo history after a new edit", () => {
    const first: PipelineAuthoring = { ...initial, processors: [{ mapping: "root = this.a" }] }
    const second: PipelineAuthoring = { ...initial, processors: [{ mapping: "root = this.b" }] }
    const branch = pushHistory(undoHistory(pushHistory(createHistory(initial), first)), second)
    expect(branch.future).toHaveLength(0)
    expect(branch.present).toEqual(second)
  })
})
