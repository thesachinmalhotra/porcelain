import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"

test("pipeline index reflects durable pipelines and opens their workspaces", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  const persisted = await readFile(resolve(process.cwd(), ".porcelain/pipelines.json"), "utf8").catch(() => null)
  const expectedPipelines: Array<{ id: string; name: string }> = persisted
    ? (JSON.parse(persisted) as { pipelines?: Array<{ id: string; name: string }> }).pipelines ?? []
    : []

  await page.goto("/pipelines")
  await expect(page.getByRole("heading", { name: "Pipelines", level: 1 })).toBeVisible()

  if (expectedPipelines.length === 0) {
    await expect(page.getByText("No pipelines", { exact: true })).toBeVisible()
  } else {
    for (const pipeline of expectedPipelines) {
      await expect(page.getByRole("link", { name: new RegExp(pipeline.name) })).toBeVisible()
    }
    await page.getByRole("link", { name: new RegExp(expectedPipelines[0].name) }).click()
    await expect(page).toHaveURL(new RegExp(`/pipelines/${expectedPipelines[0].id}$`))
    await expect(page.getByText(expectedPipelines[0].name).first()).toBeVisible()
  }

  expect(pageErrors).toEqual([])
})
