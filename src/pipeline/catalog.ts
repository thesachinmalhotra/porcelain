export type PipelineComponentKind = "input" | "output" | "processor" | "buffer" | "cache" | "rate_limit"

export type ComponentSupport = "Certified" | "Community"

export type ComponentField = {
  name: string
  type: string
  required?: boolean
  kinds?: PipelineComponentKind[]
}

export type ConnectComponent = {
  name: string
  kinds: PipelineComponentKind[]
  support: ComponentSupport
  enterprise: boolean
  cloud: boolean
  description?: string
  composesProcessors?: boolean
  fields?: ComponentField[]
}

export const connectComponents: ConnectComponent[] = [
  {
    name: "redpanda",
    kinds: ["input", "output", "cache"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Consumes topic data from or sends message data to Kafka brokers.",
    fields: [
      { name: "seed_brokers", type: "string[]", kinds: ["input", "output"] },
      { name: "topics", type: "string[]", kinds: ["input"] },
      { name: "consumer_group", type: "string", kinds: ["input"] },
      { name: "topic", type: "string", required: true, kinds: ["output"] },
    ],
  },
  {
    name: "http_server",
    kinds: ["input", "output"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Receives messages over HTTP as an input or serves messages over HTTP as an output.",
    fields: [
      { name: "address", type: "string", kinds: ["input", "output"] },
      { name: "path", type: "string", kinds: ["input", "output"] },
      { name: "allowed_verbs", type: "string[]", kinds: ["input", "output"] },
    ],
  },
  {
    name: "http_client",
    kinds: ["input", "output"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "HTTP REST client input/output.",
  },
  { name: "broker", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "generate", kinds: ["input"], support: "Certified", enterprise: false, cloud: true },
  { name: "aws_s3", kinds: ["input", "output", "cache"], support: "Certified", enterprise: false, cloud: true },
  { name: "gcp_pubsub", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "nats", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "nats_jetstream", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "mqtt", kinds: ["input", "output"], support: "Certified", enterprise: false, cloud: true },
  { name: "file", kinds: ["input", "output", "cache"], support: "Certified", enterprise: false, cloud: false },
  { name: "mongodb", kinds: ["input", "output", "processor", "cache"], support: "Certified", enterprise: false, cloud: true },
  {
    name: "mapping",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Executes a Bloblang mapping on messages, creating a new document that replaces or filters the original message.",
    fields: [{ name: "mapping", type: "string", required: true }],
  },
  {
    name: "bloblang",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Executes a Bloblang mapping on messages. The component is retained for compatibility while mapping is the current name.",
    fields: [{ name: "bloblang", type: "string" }],
  },
  {
    name: "jq",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Transforms and filters messages using jq queries.",
    fields: [
      { name: "query", type: "string", required: true },
      { name: "raw", type: "boolean" },
      { name: "output_raw", type: "boolean" },
    ],
  },
  {
    name: "json_schema",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Validates messages against a JSON Schema.",
  },
  {
    name: "branch",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Creates a request message, runs child processors, then maps the result back into the source message.",
    composesProcessors: true,
    fields: [
      { name: "request_map", type: "string" },
      { name: "processors", type: "processor[]", required: true },
      { name: "result_map", type: "string" },
    ],
  },
  {
    name: "catch",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    composesProcessors: true,
    fields: [{ name: "processors", type: "processor[]" }],
  },
  {
    name: "try",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    composesProcessors: true,
    fields: [{ name: "processors", type: "processor[]" }],
  },
  {
    name: "retry",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    composesProcessors: true,
    fields: [
      { name: "processors", type: "processor[]", required: true },
      { name: "parallel", type: "boolean" },
      { name: "max_retries", type: "integer" },
    ],
  },
  {
    name: "workflow",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Executes a topology of branch processors, performing them in parallel where possible.",
    composesProcessors: true,
    fields: [
      { name: "branch_resources", type: "string[]" },
      { name: "branches", type: "object" },
    ],
  },
  { name: "switch", kinds: ["processor", "output"], support: "Certified", enterprise: false, cloud: true, composesProcessors: true },
  { name: "parallel", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true, composesProcessors: true },
  { name: "for_each", kinds: ["processor"], support: "Certified", enterprise: false, cloud: true, composesProcessors: true },
  {
    name: "log",
    kinds: ["processor"],
    support: "Certified",
    enterprise: false,
    cloud: true,
    description: "Prints a log event for each message while leaving the message unchanged.",
  },
  { name: "drop", kinds: ["output"], support: "Certified", enterprise: false, cloud: true },
  { name: "sync_response", kinds: ["output", "processor"], support: "Certified", enterprise: false, cloud: true },
  { name: "memory", kinds: ["buffer", "cache"], support: "Certified", enterprise: false, cloud: true },
  { name: "system_window", kinds: ["buffer"], support: "Certified", enterprise: false, cloud: true },
  { name: "local", kinds: ["rate_limit"], support: "Certified", enterprise: false, cloud: true },
  { name: "memcached", kinds: ["cache"], support: "Community", enterprise: false, cloud: true },
  { name: "redpanda_data_transform", kinds: ["processor"], support: "Certified", enterprise: false, cloud: false },
]
