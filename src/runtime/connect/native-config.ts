import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { parse, stringify } from "yaml"

const execFileAsync = promisify(execFile)

export type NativeConnectConfig = Record<string, unknown>

export type ConnectCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type ConnectCommandExecutor = (
  executable: string,
  args: string[],
) => Promise<ConnectCommandResult>

export type NativeConfigOptions = {
  executable?: string
  execute?: ConnectCommandExecutor
}

export type ConnectConfigValidation = {
  valid: boolean
  stdout: string
  stderr: string
}

const defaultExecute: ConnectCommandExecutor = async (executable, args) => {
  try {
    const result = await execFileAsync(executable, args, { maxBuffer: 16 * 1024 * 1024 })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string }
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
    }
  }
}

function executable(options: NativeConfigOptions): string {
  return options.executable ?? process.env.PORCELAIN_RPK_PATH ?? "rpk"
}

export async function createConnectConfig(
  expression = "",
  options: NativeConfigOptions = {},
): Promise<NativeConnectConfig> {
  const result = await (options.execute ?? defaultExecute)(executable(options), [
    "connect",
    "create",
    ...(expression ? [expression] : []),
  ])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Redpanda Connect config generation failed")
  }
  return parseNativeConfig(result.stdout)
}

export async function echoConnectConfig(
  config: NativeConnectConfig,
  options: NativeConfigOptions = {},
): Promise<NativeConnectConfig> {
  const result = await withTempConfig(config, async (path) =>
    (options.execute ?? defaultExecute)(executable(options), ["connect", "echo", path]),
  )
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Redpanda Connect config echo failed")
  }
  return parseNativeConfig(result.stdout)
}

export async function lintConnectConfig(
  config: NativeConnectConfig,
  options: NativeConfigOptions = {},
): Promise<ConnectConfigValidation> {
  const result = await withTempConfig(config, async (path) =>
    (options.execute ?? defaultExecute)(executable(options), ["connect", "lint", path]),
  )
  return { valid: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr }
}

export async function discoverConnectSchema(options: NativeConfigOptions = {}): Promise<string> {
  const result = await (options.execute ?? defaultExecute)(executable(options), ["connect", "list", "--format", "cue"])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Redpanda Connect schema discovery failed")
  }
  return result.stdout
}

export function parseNativeConfig(value: string): NativeConnectConfig {
  const parsed = parse(value) as unknown
  if (!isObject(parsed)) throw new Error("Redpanda Connect returned a non-object configuration")
  return parsed
}

export function serializeNativeConfig(config: NativeConnectConfig): string {
  return stringify(config, { lineWidth: 120 })
}

async function withTempConfig(
  config: NativeConnectConfig,
  run: (path: string) => Promise<ConnectCommandResult>,
): Promise<ConnectCommandResult> {
  const directory = await mkdtemp(join(process.cwd(), ".porcelain-connect-"))
  const path = join(directory, "config.yaml")
  try {
    await writeFile(path, serializeNativeConfig(config), "utf8")
    return run(path)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function isObject(value: unknown): value is NativeConnectConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
