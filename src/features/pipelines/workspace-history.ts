import type { PipelineAuthoring } from "../../pipeline/authoring"

export type HistoryState = {
  past: PipelineAuthoring[]
  present: PipelineAuthoring
  future: PipelineAuthoring[]
}

export function createHistory(initial: PipelineAuthoring): HistoryState {
  return { past: [], present: structuredClone(initial), future: [] }
}

export function pushHistory(history: HistoryState, next: PipelineAuthoring): HistoryState {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history
  return {
    past: [...history.past, structuredClone(history.present)].slice(-100),
    present: structuredClone(next),
    future: [],
  }
}

export function undoHistory(history: HistoryState): HistoryState {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: structuredClone(previous),
    future: [structuredClone(history.present), ...history.future].slice(0, 100),
  }
}

export function redoHistory(history: HistoryState): HistoryState {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, structuredClone(history.present)].slice(-100),
    present: structuredClone(next),
    future: history.future.slice(1),
  }
}
