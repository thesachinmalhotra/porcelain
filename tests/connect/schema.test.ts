import { describe, expect, it } from "vitest"
import { componentSchemaFromDocument, discoverConnectJsonSchema, type ConnectJsonSchemaDocument } from "../../src/runtime/connect/schema"

const fixture: ConnectJsonSchemaDocument = {
  definitions: {
    processor: {
      anyOf: [
        {
          properties: {
            mapping: {
              type: "object",
              properties: {
                mapping: { type: "string", is_optional: false },
                enabled: { type: "boolean", default: true, is_optional: true },
                mode: { type: "string", enum: ["strict", "lenient"], is_optional: true },
                credentials: {
                  type: "object",
                  is_advanced: true,
                  properties: {
                    token: { type: "string", is_secret: true, is_optional: true },
                  },
                },
              },
              required: ["mapping"],
            },
          },
        },
      ],
    },
  },
}

describe("Connect native schema adapter", () => {
  it("selects a component from the native role definition", () => {
    const schema = componentSchemaFromDocument(fixture, "processor", "mapping")
    expect(schema.name).toBe("mapping")
    expect(schema.kind).toBe("processor")
    expect(schema.fields.map((field) => field.name)).toEqual(["mapping", "enabled", "mode", "credentials"])
  })

  it("preserves native required, optional, advanced and secret metadata", () => {
    const schema = componentSchemaFromDocument(fixture, "processor", "mapping")
    expect(schema.fields.find((field) => field.name === "mapping")?.required).toBe(true)
    expect(schema.fields.find((field) => field.name === "enabled")?.optional).toBe(true)
    expect(schema.fields.find((field) => field.name === "credentials")?.advanced).toBe(true)
  })

  it("discovers JSON Schema through the native rpk command", async () => {
    const calls: Array<{ executable: string; args: string[] }> = []
    const document = await discoverConnectJsonSchema(async (executable, args) => {
      calls.push({ executable, args })
      return { stdout: JSON.stringify(fixture), stderr: "", exitCode: 0 }
    }, "/home/sachin/.local/bin/rpk")

    expect(document).toEqual(fixture)
    expect(calls).toEqual([{
      executable: "/home/sachin/.local/bin/rpk",
      args: ["connect", "list", "--format", "jsonschema"],
    }])
  })
})
