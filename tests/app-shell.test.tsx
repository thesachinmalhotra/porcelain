import { render, screen, waitFor } from "@testing-library/react"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { describe, expect, it } from "vitest"
import { AppShell } from "../src/components/app-shell"

describe("AppShell", () => {
  it("renders the Porcelain application shell", () => {
    const rootRoute = createRootRoute({ component: AppShell })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })

    render(<RouterProvider router={router} />)
    return waitFor(() => expect(screen.getByRole("heading", { name: "Porcelain" })).toBeTruthy())
  })
})
