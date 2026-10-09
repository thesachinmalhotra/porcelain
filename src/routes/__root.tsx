import type { ReactNode } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { AppShell } from "../components/app-shell"
import { getShellContext } from "../features/operations/server"
import "../styles.css"

export const Route = createRootRoute({
  loader: () => getShellContext(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Porcelain" },
      { name: "description", content: "Operate and observe Redpanda Connect pipelines with Porcelain." },
    ],
    links: [
      { rel: "icon", href: "/porcelain-favicon.svg", type: "image/svg+xml", sizes: "any" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const context = Route.useLoaderData()
  return (
    <RootDocument>
      <AppShell context={context}>
        <Outlet />
      </AppShell>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
