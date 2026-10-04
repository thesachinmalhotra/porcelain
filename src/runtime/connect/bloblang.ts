import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type BloblangExecutionResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type BloblangExecutionOptions = {
  executable?: string
}

export async function executeConnectBloblang(
  mapping: string,
  input: string,
  options: BloblangExecutionOptions = {},
): Promise<BloblangExecutionResult> {
  const executable = options.executable ?? process.env.PORCELAIN_RPK_PATH ?? "rpk"
  const directory = await mkdtemp(join(process.cwd(), ".porcelain-connect-"))
  const inputPath = join(directory, "input.jsonl")
  const mappingPath = join(directory, "mapping.blobl")

  try {
    const document = JSON.stringify(JSON.parse(input))
    await writeFile(inputPath, document + "\n", "utf8")
    await writeFile(mappingPath, mapping, "utf8")

    try {
      const result = await execFileAsync(
        executable,
        ["connect", "blobl", "-i", inputPath, "-f", mappingPath, "--pretty"],
        { maxBuffer: 16 * 1024 * 1024 },
      )
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number | string }
      return {
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
        exitCode: typeof failure.code === "number" ? failure.code : 1,
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}
