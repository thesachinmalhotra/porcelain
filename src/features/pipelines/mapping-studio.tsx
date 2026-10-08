import { useEffect, useMemo, useState } from "react"
import { Icon } from "../../components/app-shell"
import { Button } from "../../ui/primitives"

type Props = {
  componentName: string
  mapping: string
  input: string
  output: string
  error: string | null
  running: boolean
  onMappingChange: (value: string) => void
  onInputChange: (value: string) => void
  onRun: () => void
  onClose: () => void
}

const DEFAULT_INPUT = `{
  "user": {
    "name": "Ada"
  }
}`

export function MappingStudio({
  componentName,
  mapping,
  input,
  output,
  error,
  running,
  onMappingChange,
  onInputChange,
  onRun,
  onClose,
}: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle")
  const inputValue = input || DEFAULT_INPUT
  const outputValue = output || "Run the mapping to inspect the result."
  const status = useMemo(() => {
    if (running) return "Running in Connect"
    if (error) return "Connect rejected the mapping"
    if (output) return "Result from Connect"
    return "Ready"
  }, [error, output, running])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        onRun()
      }
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, onRun])

  const formatInput = () => {
    try {
      onInputChange(JSON.stringify(JSON.parse(inputValue), null, 2))
    } catch {
      // Leave malformed JSON visible so the user can correct it.
    }
  }

  const copyOutput = async () => {
    if (!output) return
    await navigator.clipboard?.writeText(output)
    setCopyState("copied")
    window.setTimeout(() => setCopyState("idle"), 1200)
  }

  return <div className="mapping-studio" aria-label="Bloblang mapping studio">
    <header className="mapping-studio-header">
      <div className="mapping-studio-title">
        <button className="mapping-studio-back" type="button" onClick={onClose} aria-label="Back to topology"><Icon name="arrow" /></button>
        <div><span className="eyebrow">Mapping Studio</span><strong>{componentName}</strong></div>
        <span className="mapping-studio-native"><span className="status-dot online" />Native Connect</span>
      </div>
      <div className="mapping-studio-actions">
        <span className="mapping-studio-shortcut"><kbd>Ctrl</kbd><kbd>Enter</kbd> run</span>
        <Button variant="primary" onClick={onRun} disabled={running}><Icon name="arrow" />{running ? "Running..." : "Run mapping"}</Button>
      </div>
    </header>

    <div className="mapping-studio-grid">
      <section className="mapping-panel">
        <header><div><span className="mapping-panel-index">01</span><strong>Input</strong></div><div className="mapping-panel-tools"><button type="button" onClick={formatInput}>Format</button><button type="button" onClick={() => onInputChange(DEFAULT_INPUT)}>Reset</button></div></header>
        <textarea aria-label="Mapping input event" value={inputValue} onChange={(event) => onInputChange(event.target.value)} spellCheck={false} />
        <footer><span>JSON event fixture</span><span>session only</span></footer>
      </section>

      <section className="mapping-panel mapping-panel-code">
        <header><div><span className="mapping-panel-index">02</span><strong>Mapping</strong></div><span className="mapping-panel-native">Bloblang</span></header>
        <textarea aria-label="Bloblang mapping" value={mapping} onChange={(event) => onMappingChange(event.target.value)} spellCheck={false} />
        <footer><span>Native processor configuration</span><span>saved with pipeline</span></footer>
      </section>

      <section className={`mapping-panel mapping-panel-output${error ? " has-error" : ""}`}>
        <header><div><span className="mapping-panel-index">03</span><strong>Output</strong></div><button type="button" onClick={() => void copyOutput()} disabled={!output}>{copyState === "copied" ? "Copied" : "Copy"}</button></header>
        <pre aria-live="polite">{error ? error : outputValue}</pre>
        <footer><span className={error ? "mapping-error-state" : "mapping-ok-state"}><span className="status-dot" />{status}</span><span>{output ? "ephemeral result" : "no execution yet"}</span></footer>
      </section>
    </div>

    <footer className="mapping-studio-footer">
      <div><span className="mapping-studio-dot" />The mapping runs through the installed Redpanda Connect binary. Porcelain does not evaluate Bloblang.</div>
      <div><kbd>Esc</kbd> back to topology</div>
    </footer>
  </div>
}
