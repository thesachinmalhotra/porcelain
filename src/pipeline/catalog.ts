export type PipelineComponentKind = "input" | "output" | "processor" | "buffer" | "cache" | "rate_limit"

export type ComponentSupport = "Certified" | "Community"

export type ConnectComponent = {
  name: string
  kinds: PipelineComponentKind[]
  support: ComponentSupport
  enterprise: boolean
  cloud: boolean
}

export const connectComponents: ConnectComponent[] = [
  { name: "redpanda", kinds: ["input", "output", "cache"], support: "Certified", enterprise: false, cloud: true },
  { name: "http_server", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "http_client", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "broker", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "generate", kinds: ["input"], support: "Certified", enterprise: false, cloud: true },
  { name: "aws_s3", kinds: ["input", "output", "cache"], support: "Certified", enterprise: false, cloud: true },
  { name: "gcp_pubsub", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "nats", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "nats_jetstream", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "mqtt", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "file", kinds: ["input", "output", "cache"], support: "Certified", enterprise: false, cloud: false },
  { name: "mongodb", kinds: ["input", "output", "processor", "cache"], support: "Certified", enterprise: false, cloud: true },
  { name: "mapping", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "bloblang", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "jq", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "json_schema", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "branch", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "catch", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "try", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "workflow", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "switch", kinds: ["processor", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "parallel", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "for_each", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "log", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "drop", kinds: ["output"], support: "Certified", enterprise: false, cloud: true },
  { name: "sync_response", kinds: ["output", "processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "memory", kinds: ["buffer", "cache"], support: "Certified", enterprise: false, cloud: true },
  { name: "system_window", kinds: ["buffer"], support: "Certified", enterprise: false, cloud: true },
  { name: "local", kinds: ["rate_limit"], support: "Certified", enterprise: false, cloud: true },
  { name: "memcached", kinds: ["cache"], support: "Community", enterprise: false, cloud: true },
  { name: "redpanda_data_transform", kinds: ["processor"], support: "Certified", enterprise: false, cloud: false },
]
