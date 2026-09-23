import { createServerFn } from "@tanstack/react-start"

export type ComponentsFilter =
  | "all"
  | "input"
  | "output"
  | "processor"
  | "buffer"
  | "cache"
  | "rate_limit"
  | "metric"
  | "tracer"

export const getComponents = createServerFn({ method: "GET" }).handler(async () => {
  const { discoverConnectCapabilities } = await import("../../runtime/connect/capabilities")
  return discoverConnectCapabilities()
})
