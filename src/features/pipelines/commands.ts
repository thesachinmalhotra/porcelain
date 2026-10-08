export type WorkspaceCommandContext = {
  selectionCount: number
  hasSelection: boolean
  canDelete: boolean
  canDuplicate: boolean
  canUndo: boolean
  canRedo: boolean
  dirty: boolean
}

export type WorkspaceCommand = {
  id: string
  title: string
  description?: string
  shortcut?: string
  group: "Canvas" | "Edit" | "Workspace" | "Deep work" | "Pipeline"
  enabled: (context: WorkspaceCommandContext) => boolean
  run: () => void | Promise<void>
}

export function filterCommands(commands: WorkspaceCommand[], query: string, context: WorkspaceCommandContext): WorkspaceCommand[] {
  const normalized = query.trim().toLowerCase()
  return commands
    .filter((command) => command.enabled(context))
    .filter((command) => {
      if (!normalized) return true
      const haystack = [command.title, command.description ?? "", command.id].join(" ").toLowerCase()
      return haystack.includes(normalized)
    })
}
