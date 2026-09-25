import { useRef } from "react"

export type TabItem<T extends string> = { value: T; label: string; disabled?: boolean }

export function Tabs<T extends string>({ items, value, onValueChange, ariaLabel, className = "" }: {
  items: readonly TabItem<T>[]
  value: T
  onValueChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const moveFocus = (index: number, direction: 1 | -1) => {
    const enabled = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => !item.disabled)
    const current = enabled.findIndex(({ item }) => item.value === items[index]?.value)
    if (current < 0 || enabled.length === 0) return
    const next = enabled[(current + direction + enabled.length) % enabled.length]
    refs.current[next.itemIndex]?.focus()
    onValueChange(next.item.value)
  }

  const focusEdge = (edge: "start" | "end") => {
    const enabled = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => !item.disabled)
    const target = edge === "start" ? enabled[0] : enabled.at(-1)
    if (target) {
      refs.current[target.itemIndex]?.focus()
      onValueChange(target.item.value)
    }
  }

  return (
    <div className={["inspector-tabs", className].filter(Boolean).join(" ")} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(node) => { refs.current[index] = node }}
            className={`inspector-tab${selected ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault()
                moveFocus(index, 1)
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault()
                moveFocus(index, -1)
              } else if (event.key === "Home") {
                event.preventDefault()
                focusEdge("start")
              } else if (event.key === "End") {
                event.preventDefault()
                focusEdge("end")
              }
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
