import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { afterEach, describe, expect, it } from "vitest"
import { AppShell } from "../src/components/app-shell"

describe("AppShell", () => {
  afterEach(() => { cleanup(); localStorage.clear() })
  it("renders the Porcelain application shell", () => {
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    render(<RouterProvider router={router} />)
    return waitFor(() => expect(screen.getByText("Porcelain")).toBeTruthy())
  })

  it("collapses and persists the sidebar presentation state", async () => {
    localStorage.clear()
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    const { container } = render(<RouterProvider router={router} />)
    const toggle = await waitFor(() => screen.getByRole("button", { name: "Collapse sidebar" }))
    fireEvent.click(toggle)
    return waitFor(() => {
      expect(container.querySelector(".app-shell")?.classList.contains("sidebar-collapsed")).toBe(true)
      expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy()
      expect(localStorage.getItem("porcelain.sidebar.collapsed")).toBe("true")
    })
  })

  it("uses TanStack Router state for the active navigation item", async () => {
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/overview" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/overview"] }),
    })

    render(<RouterProvider router={router} />)
    const overview = await waitFor(() => screen.getByRole("link", { name: "Overview" }))
    expect(overview.className).toContain("active")
  })
})
