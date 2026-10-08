import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Button, IconButton, Status, Tabs } from "../src/ui/primitives"

describe("UI primitives", () => {
  it("keeps button semantics while applying the visual contract", () => {
    const onClick = vi.fn()
    render(<Button variant="primary" onClick={onClick}>Publish</Button>)
    fireEvent.click(screen.getByRole("button", { name: "Publish" }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Publish" }).className).toContain("button-primary")
  })

  it("requires an accessible icon button name", () => {
    render(<IconButton label="More options">&</IconButton>)
    expect(screen.getByRole("button", { name: "More options" })).toBeTruthy()
  })

  it("renders semantic status without owning domain state", () => {
    render(<Status tone="success" label="Running" />)
    expect(screen.getByText("Running").className).toContain("ui-status-success")
  })

  it("supports accessible tab selection and keyboard navigation", () => {
    const onValueChange = vi.fn()
    render(<Tabs items={[{ value: "one", label: "One" }, { value: "two", label: "Two" }, { value: "three", label: "Three" }]} value="one" onValueChange={onValueChange} ariaLabel="Example tabs" />)

    const tabs = screen.getAllByRole("tab")
    expect(tabs[0].getAttribute("aria-selected")).toBe("true")
    expect(tabs[1].getAttribute("aria-selected")).toBe("false")

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" })
    expect(onValueChange).toHaveBeenCalledWith("two")
    expect(document.activeElement).toBe(tabs[1])

    fireEvent.keyDown(tabs[1], { key: "End" })
    expect(onValueChange).toHaveBeenCalledWith("three")
    expect(document.activeElement).toBe(tabs[2])
  })
})
