import { describe, expect, it, vi } from "vitest"

import { vaultClient } from "./vault-client"

describe("browser prototype vault session", () => {
  it("requires the same master password after locking", async () => {
    await vaultClient.create("a-long-local-master-password")
    await vaultClient.lock()

    await expect(vaultClient.unlock("incorrect-password")).rejects.toThrow("主密码不正确")
    await expect(vaultClient.unlock("a-long-local-master-password")).resolves.toBeUndefined()
  })

  it("rejects all business reads while locked", async () => {
    await vaultClient.create("another-long-local-password")
    await vaultClient.lock()

    await expect(vaultClient.listCategories()).rejects.toThrow("保险库已锁定")
  })

  it("supports the M2.4 create, search, delete, and restore loop", async () => {
    await vaultClient.create("a-third-long-local-password")
    const category = await vaultClient.createCategory("开发")
    await expect(
      vaultClient.saveWebsite({
        categoryId: category.id,
        name: "危险地址",
        primaryUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow("只允许 http 或 https 网址")
    const website = await vaultClient.saveWebsite({
      categoryId: category.id,
      name: "示例站点",
      primaryUrl: "https://example.test/login",
    })
    const account = await vaultClient.saveAccount({
      websiteId: website.id,
      displayName: "私人账号",
      fields: [
        {
          systemRole: "username",
          label: "用户名",
          fieldType: "text",
          value: "demo@example.test",
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
    await expect(vaultClient.search("demo@example")).resolves.toHaveLength(1)
    await expect(vaultClient.search("fictional-secret")).resolves.toHaveLength(0)

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    await vaultClient.copyField(account.fields[1].id)
    expect(writeText).toHaveBeenLastCalledWith("fictional-secret")
    await vaultClient.copyUrl(website.id)
    expect(writeText).toHaveBeenLastCalledWith("https://example.test/login")
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    await vaultClient.openWebsite(website.id)
    expect(open).toHaveBeenCalledWith(
      "https://example.test/login",
      "_blank",
      "noopener,noreferrer",
    )

    await vaultClient.deleteWebsite(website.id)
    await expect(vaultClient.listWebsites(category.id)).resolves.toHaveLength(0)
    const trash = await vaultClient.listTrash()
    expect(trash).toHaveLength(1)
    await vaultClient.restore(trash[0].groupId)
    await expect(vaultClient.listWebsites(category.id)).resolves.toHaveLength(1)
    await expect(vaultClient.listAccounts(website.id)).resolves.toHaveLength(1)
  })

  it("supports M2.5 settings, conditional clipboard clearing, backup, and restore", async () => {
    vi.useFakeTimers()
    try {
      await vaultClient.create("m25-fictional-master-password")
      await expect(
        vaultClient.updateSecuritySettings({
          autoLockMinutes: 0,
          clipboardClearSeconds: 30,
          lockOnFocusLoss: true,
        }),
      ).rejects.toThrow("安全设置超出允许范围")
      await vaultClient.updateSecuritySettings({
        autoLockMinutes: 1,
        clipboardClearSeconds: 5,
        lockOnFocusLoss: true,
      })
      const category = await vaultClient.createCategory("备份前")
      const website = await vaultClient.saveWebsite({
        categoryId: category.id,
        name: "剪贴板测试",
        primaryUrl: "https://example.test",
      })
      const account = await vaultClient.saveAccount({
        websiteId: website.id,
        displayName: "安全账号",
        fields: [
          {
            systemRole: "password",
            label: "密码",
            fieldType: "password",
            value: "fictional-m25-secret",
            isSensitive: true,
          },
        ],
      })

      let clipboardValue = ""
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: vi.fn(async (value: string) => {
            clipboardValue = value
          }),
          readText: vi.fn(async () => clipboardValue),
        },
      })
      await vaultClient.copyField(account.fields[0].id)
      clipboardValue = "user-replaced-content"
      await vi.advanceTimersByTimeAsync(5_000)
      expect(clipboardValue).toBe("user-replaced-content")

      await vaultClient.copyField(account.fields[0].id)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(clipboardValue).toBe("")

      const backup = await vaultClient.createBackup()
      await expect(vaultClient.listCategories()).rejects.toThrow("保险库已锁定")
      await expect(
        vaultClient.restoreBackup(backup.id, "wrong-fictional-password"),
      ).rejects.toThrow("主密码不正确或备份已损坏")
      await vaultClient.restoreBackup(backup.id, "m25-fictional-master-password")
      await expect(vaultClient.listCategories()).resolves.toEqual([
        expect.objectContaining({ name: "备份前" }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
