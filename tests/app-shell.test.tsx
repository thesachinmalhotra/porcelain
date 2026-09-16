import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AppShell } from "../src/components/app-shell"

describe("AppShell", () => {
  it("renders the Porcelain application shell", () => {
    render(<AppShell />)
    expect(screen.getByRole("heading", { name: "Porcelain" })).toBeTruthy()
  })
})
