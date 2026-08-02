import { describe, expect, it, vi } from "vitest"

import { vaultClient } from "./vault-client"

describe("browser prototype local database", () => {
  it("starts ready without a password and supports the CRUD loop", async () => {
    await expect(vaultClient.status()).resolves.toEqual({ exists: true })

    const category = await vaultClient.createCategory("虚构开发分类")
    await expect(
      vaultClient.saveWebsite({
        categoryId: category.id,
        name: "危险地址",
        primaryUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow("只允许 http 或 https 网址")
    const website = await vaultClient.saveWebsite({
      categoryId: category.id,
      name: "虚构示例站点",
      primaryUrl: "https://example.test/login",
    })
    const account = await vaultClient.saveAccount({
      websiteId: website.id,
      displayName: "虚构账号",
      fields: [
        {
          systemRole: "username",
          label: "用户名",
          fieldType: "text",
          value: "fictional@example.test",
          isSensitive: false,
        },
        {
          systemRole: "password",
          label: "密码",
          fieldType: "password",
          value: "fictional-secret",
          isSensitive: true,
        },
      ],
    })

    expect(account.fields[1].value).toBeNull()
    await expect(vaultClient.revealField(account.fields[1].id)).resolves.toBe("fictional-secret")
    await expect(vaultClient.search("fictional@example")).resolves.toHaveLength(1)
    await expect(vaultClient.search("fictional-secret")).resolves.toHaveLength(0)

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    await vaultClient.copyField(account.fields[1].id)
    expect(writeText).toHaveBeenLastCalledWith("fictional-secret")

    await vaultClient.deleteWebsite(website.id)
    const trash = await vaultClient.listTrash()
    const deletion = trash.find((item) => item.entityName === "虚构示例站点")
    expect(deletion).toBeDefined()
    await vaultClient.restore(deletion!.groupId)
    await expect(vaultClient.listAccounts(website.id)).resolves.toHaveLength(1)
  })

  it("keeps clipboard settings and restores an in-memory prototype backup", async () => {
    await expect(
      vaultClient.updateAppSettings({ clipboardClearSeconds: 0 }),
    ).rejects.toThrow("应用设置超出允许范围")
    await vaultClient.updateAppSettings({ clipboardClearSeconds: 5 })

    const before = await vaultClient.createCategory("虚构备份前分类")
    const backup = await vaultClient.createBackup()
    await vaultClient.createCategory("虚构备份后分类")
    await vaultClient.restoreBackup(backup.id)

    const categories = await vaultClient.listCategories()
    expect(categories).toContainEqual(expect.objectContaining({ id: before.id }))
    expect(categories.some((category) => category.name === "虚构备份后分类")).toBe(false)
  })

  it("generates a password with Web Crypto in the browser prototype", async () => {
    const password = await vaultClient.generatePassword({
      length: 32,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    })

    expect(password).toHaveLength(32)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%^&*()\-_=+\[\]{};:,.?]/)
    await expect(
      vaultClient.generatePassword({
        length: 20,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      }),
    ).rejects.toThrow("请至少选择一种字符类型")
  })
})
