import { useEffect, useMemo, useState } from "react"
import { stringify } from "yaml"
import { Icon } from "../../components/app-shell"
import type { JsonObject, PipelineAuthoring } from "../../pipeline/authoring"
import { authoringToConnectConfig } from "../../pipeline/authoring"
import { getPipelineDiff, runPipelineNativeTest } from "./deep-work-server"
import { Button } from "../../ui/primitives"

export type DeepWorkContext = "mapping" | "validation" | "test" | "diff" | "runtime"

type Props = {
  context: DeepWorkContext
  authoring: PipelineAuthoring
  pipelineId: string
  mapping?: { componentName: string; mapping: string; input: string; output: string; error: string | null; running: boolean; onMappingChange: (value: string) => void; onInputChange: (value: string) => void; onRun: () => void }
  validation: { valid: boolean; message: string } | null
  runtime: { connected: boolean; active: boolean; uptime?: string; stats?: JsonObject | null }
  connectReady: boolean
  onValidate: () => void
  onClose: () => void
}

const DEFAULT_TEST = "tests:\n  - name: pipeline behaviour\n    target_processors: /pipeline/processors\n    input_batch:\n      - content: '{\"example\":\"event\"}'\n    output_batches:\n      - - content_equals: '{\"example\":\"event\"}'"

function scalarStats(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? [[key, String(item)]] : [])
}

function diffRows(before: JsonObject | null, after: JsonObject) {
  const left = before ? JSON.stringify(before, null, 2).split("\n") : []
  const right = JSON.stringify(after, null, 2).split("\n")
  const rows: Array<{ kind: "same" | "add" | "remove"; text: string }> = []
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] === right[i] && left[i] !== undefined) rows.push({ kind: "same", text: left[i] })
    else {
      if (left[i] !== undefined) rows.push({ kind: "remove", text: left[i] })
      if (right[i] !== undefined) rows.push({ kind: "add", text: right[i] })
    }
  }
  return rows
}

export function DeepWorkSurface({ context, authoring, pipelineId, mapping, validation, runtime, connectReady, onValidate, onClose }: Props) {
  const [testText, setTestText] = useState(DEFAULT_TEST)
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; output: string } | null>(null)
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof getPipelineDiff>> | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    if (context !== "diff") return
    setDiffLoading(true)
    void getPipelineDiff({ data: { id: pipelineId, authoring } })
      .then(setDiff)
      .catch((error) => setDiff({ version: null, checksum: null, changed: true, before: null, after: { error: error instanceof Error ? error.message : "Diff failed" } }))
      .finally(() => setDiffLoading(false))
  }, [authoring, context, pipelineId])

  const rows = useMemo(() => diff ? diffRows(diff.before, diff.after) : [], [diff])

  if (context === "mapping" && mapping) return <div className="deep-work-surface" aria-label="Mapping Studio">
    <header className="deep-work-header"><div><span className="eyebrow">Deep work / Mapping</span><h2>{mapping.componentName}</h2><span>Native Bloblang execution</span></div><div className="deep-work-actions"><kbd>Cmd Enter</kbd><Button variant="primary" onClick={mapping.onRun} disabled={mapping.running}>{mapping.running ? "Running..." : "Run"}</Button><button className="button button-ghost" type="button" onClick={onClose}>Back to canvas</button></div></header>
    <div className="deep-work-grid three"><section className="deep-work-panel"><header><strong>Input</strong><span>session fixture</span></header><textarea aria-label="Mapping input event" value={mapping.input} onChange={(event) => mapping.onInputChange(event.target.value)} spellCheck={false} /></section><section className="deep-work-panel code"><header><strong>Mapping</strong><span>native processor config</span></header><textarea aria-label="Bloblang mapping" value={mapping.mapping} onChange={(event) => mapping.onMappingChange(event.target.value)} spellCheck={false} /></section><section className={"deep-work-panel output" + (mapping.error ? " has-error" : "")}><header><strong>Output</strong><span>{mapping.running ? "running" : mapping.output ? "Connect result" : "waiting"}</span></header><pre>{mapping.error ?? mapping.output ?? "Run the mapping to inspect the result."}</pre></section></div>
    <footer className="deep-work-footnote"><span><span className="status-dot online" />Executed by installed Redpanda Connect</span><span>Esc back to topology</span></footer>
  </div>

  if (context === "validation") return <div className="deep-work-surface" aria-label="Validation workspace">
    <header className="deep-work-header"><div><span className="eyebrow">Deep work / Validation</span><h2>Connect validation</h2><span>Authoritative linting of the exact native draft.</span></div><div className="deep-work-actions"><span className={"deep-work-result " + (validation?.valid ? "valid" : validation ? "invalid" : "")}>{validation ? (validation.valid ? "Accepted" : "Rejected") : "Not run"}</span><Button variant="primary" onClick={onValidate}>Validate</Button><button className="button button-ghost" type="button" onClick={onClose}>Back to canvas</button></div></header>
    <div className="deep-work-validation"><div className={"validation-hero " + (validation?.valid ? "valid" : validation ? "invalid" : "")}><span className="validation-icon"><Icon name={validation?.valid ? "check" : "warning"} /></span><div><strong>{validation ? (validation.valid ? "Redpanda Connect accepted the draft" : "Redpanda Connect rejected the draft") : "Ready to validate"}</strong><p>{validation?.message ?? "Run native validation to receive diagnostics."}</p></div></div><div className="deep-work-config"><span>Native configuration</span><pre>{stringify(authoringToConnectConfig(authoring), { lineWidth: 120 })}</pre></div></div>
  </div>

  if (context === "test") return <div className="deep-work-surface" aria-label="Pipeline test workspace">
    <header className="deep-work-header"><div><span className="eyebrow">Deep work / Test</span><h2>Native Connect test</h2><span>Run the draft through Connect's unit-test engine.</span></div><div className="deep-work-actions"><kbd>Cmd Enter</kbd><Button variant="primary" onClick={() => { setTestRunning(true); setTestResult(null); void runPipelineNativeTest({ data: { authoring, test: testText } }).then(setTestResult).catch((error) => setTestResult({ ok: false, output: error instanceof Error ? error.message : "Test failed" })).finally(() => setTestRunning(false)) }} disabled={testRunning}>{testRunning ? "Running..." : "Run test"}</Button><button className="button button-ghost" type="button" onClick={onClose}>Back to canvas</button></div></header>
    <div className="deep-work-grid two"><section className="deep-work-panel code"><header><strong>Test definition</strong><span>Redpanda Connect YAML</span></header><textarea aria-label="Native Connect test definition" value={testText} onChange={(event) => setTestText(event.target.value)} spellCheck={false} /></section><section className={"deep-work-panel output" + (testResult && !testResult.ok ? " has-error" : "")}><header><strong>Result</strong><span>{testResult ? (testResult.ok ? "passed" : "failed") : "waiting"}</span></header><pre>{testResult?.output ?? "Run the native test to see Connect diagnostics."}</pre></section></div>
    <footer className="deep-work-footnote"><span><span className="status-dot online" />Executed with rpk connect test</span><span>Test definition is session-local until native persistence is introduced.</span></footer>
  </div>

  if (context === "diff") return <div className="deep-work-surface" aria-label="Pipeline diff workspace">
    <header className="deep-work-header"><div><span className="eyebrow">Deep work / Diff</span><h2>Draft changes</h2><span>{diff?.version ? "Against published revision " + diff.version : "No published revision yet"}</span></div><div className="deep-work-actions"><span className={"deep-work-result " + (diff?.changed ? "invalid" : "valid")}>{diff?.changed ? "Changed" : "No changes"}</span><button className="button button-ghost" type="button" onClick={onClose}>Back to canvas</button></div></header>
    <div className="deep-work-diff">{diffLoading && <div className="inspector-empty">Loading native configuration diff...</div>}{!diffLoading && rows.map((row, index) => <div key={index} className={"diff-row " + row.kind}><span>{row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}</span><code>{row.text}</code></div>)}</div>
  </div>

  const stats = runtime.stats ?? {}
  return <div className="deep-work-surface" aria-label="Runtime workspace">
    <header className="deep-work-header"><div><span className="eyebrow">Deep work / Runtime</span><h2>Live runtime</h2><span>{connectReady ? "Redpanda Connect is ready" : "Redpanda Connect is not ready"}</span></div><div className="deep-work-actions"><span className={"deep-work-result " + (runtime.active ? "valid" : "")}>{runtime.active ? "Running" : "Stopped"}</span><button className="button button-ghost" type="button" onClick={onClose}>Back to canvas</button></div></header>
    <div className="deep-work-runtime"><section className="runtime-hero"><strong>{runtime.uptime ?? "N/A"}</strong><span>uptime</span></section><div className="runtime-stat-grid">{scalarStats(stats).map(([key, value]) => <div key={key}><span>{key.replace(/_/g, " ")}</span><strong>{value}</strong></div>)}</div><section className="runtime-log-empty"><span className="status-dot" /><div><strong>Runtime logs</strong><p>Streams API exposes stream state and stats, not process logs. Porcelain does not fabricate a second log transport.</p></div></section></div>
  </div>
}
