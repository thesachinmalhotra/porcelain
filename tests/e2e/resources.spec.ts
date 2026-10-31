import { expect, test } from "@playwright/test"

test("shared resources workspace uses the discovered Connect inventory", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/resources")
  await expect(page.getByRole("heading", { name: "Shared resources", level: 1 })).toBeVisible()
  await expect(page.getByText("Resource catalogue")).toBeVisible()
  await expect(page.getByLabel("Resource type")).toBeVisible()
  await expect(page.getByLabel("Component")).toBeVisible()
  await expect(page.getByLabel("Resource name / ID")).toBeVisible()
  await expect(page.getByRole("button", { name: "New resource" })).toBeVisible()
  expect(errors).toEqual([])
})

