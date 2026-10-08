import { describe, expect, it } from "vitest"
import { executeConnectBloblang } from "../../src/runtime/connect/bloblang.server"

const executable = process.env.PORCELAIN_RPK_PATH ?? "/home/sachin/.local/bin/rpk"

describe("Connect Bloblang execution", () => {
  it("executes mappings through the installed Connect CLI", async () => {
    const result = await executeConnectBloblang(
      "root.user.name = this.user.name.uppercase()",
      `{\n  "user": {\n    "name": "sachin"\n  }\n}`,
      { executable },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toEqual({ user: { name: "SACHIN" } })
  }, 15000)

  it("returns native Connect diagnostics for invalid mappings", async () => {
    const result = await executeConnectBloblang(
      "root.user.name = this.user.name.unknown_method()",
      '{"user":{"name":"sachin"}}',
      { executable },
    )

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("unrecognised method")
  }, 15000)
})
