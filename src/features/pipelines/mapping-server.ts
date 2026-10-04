import { createServerFn } from "@tanstack/react-start"
import { executeConnectBloblang } from "../../runtime/connect/bloblang"

type MappingExecutionInput = {
  mapping: string
  input: string
}

function validate(input: unknown): MappingExecutionInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Mapping execution input must be an object")
  }
  const value = input as Record<string, unknown>
  if (typeof value.mapping !== "string" || value.mapping.trim() === "") {
    throw new Error("Bloblang mapping must not be empty")
  }
  if (typeof value.input !== "string" || value.input.trim() === "") {
    throw new Error("Input event must not be empty")
  }
  try {
    JSON.parse(value.input)
  } catch {
    throw new Error("Input event must be valid JSON")
  }
  return { mapping: value.mapping, input: value.input }
}

export const executeMappingServer = createServerFn({ method: "POST" })
  .validator(validate)
  .handler(async ({ data }) => {
    const result = await executeConnectBloblang(data.mapping, data.input)
    return {
      ok: result.exitCode === 0,
      output: result.stdout.trim(),
      error: result.exitCode === 0 ? "" : (result.stderr.trim() || result.stdout.trim() || "Connect mapping execution failed"),
    }
  })
