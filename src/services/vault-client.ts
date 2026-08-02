import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"

import {
  VaultClientError,
  type AccountDetail,
  type AccountDraft,
  type AccountSummary,
  type AppSettings,
  type BackupInfo,
  type Category,
  type PasswordGeneratorOptions,
  type SearchResult,
  type TrashItem,
  type Website,
  type WebsiteDraft,
} from "./vault-contract"

export {
  VaultClientError,
  type AccountDetail,
  type AccountDraft,
  type AccountField,
  type AccountFieldDraft,
  type AccountSummary,
  type AppSettings,
  type BackupInfo,
  type Category,
  type FieldType,
  type PasswordGeneratorOptions,
  type SearchResult,
  type SystemRole,
  type TrashItem,
  type Website,
  type WebsiteDraft,
} from "./vault-contract"

type CommandErrorPayload = {
  code: string
  message: string
}

function isCommandErrorPayload(error: unknown): error is CommandErrorPayload {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  )
}

function normalizeCommandError(error: unknown): VaultClientError {
  if (isCommandErrorPayload(error)) {
    return new VaultClientError(error.code, error.message)
  }
  return new VaultClientError(
    "unexpected_error",
    error instanceof Error ? error.message : "操作失败，请重试。",
  )
}

async function invokeVault<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw normalizeCommandError(error)
  }
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window
}

async function browserPrototype() {
  if (!import.meta.env.DEV) {
    throw new VaultClientError(
      "desktop_runtime_required",
      "请使用桌面应用打开保险库。",
    )
  }
  return import("./vault-browser-prototype")
}

async function desktopOrPrototype<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  prototypeCall: () => Promise<T> | T,
) {
  if (isTauriRuntime()) return invokeVault<T>(command, args)
  return prototypeCall()
}

export const vaultClient = {
  status() {
    return desktopOrPrototype<{ exists: boolean }>(
      "vault_status",
      undefined,
      async () => (await browserPrototype()).status(),
    )
  },

  listCategories() {
    return desktopOrPrototype<Category[]>(
      "list_categories",
      undefined,
      async () => (await browserPrototype()).listCategories(),
    )
  },

  createCategory(name: string) {
    return desktopOrPrototype<Category>("create_category", { name }, async () =>
      (await browserPrototype()).createCategory(name),
    )
  },

  async renameCategory(categoryId: string, name: string) {
    await desktopOrPrototype(
      "rename_category",
      { categoryId, name },
      async () => (await browserPrototype()).renameCategory(categoryId, name),
    )
  },

  async deleteCategory(categoryId: string) {
    await desktopOrPrototype("delete_category", { categoryId }, async () =>
      (await browserPrototype()).deleteCategory(categoryId),
    )
  },

  listWebsites(categoryId?: string) {
    return desktopOrPrototype<Website[]>(
      "list_websites",
      { categoryId: categoryId ?? null },
      async () => (await browserPrototype()).listWebsites(categoryId),
    )
  },

  saveWebsite(draft: WebsiteDraft) {
    return desktopOrPrototype<Website>("save_website", { draft }, async () =>
      (await browserPrototype()).saveWebsite(draft),
    )
  },

  async deleteWebsite(websiteId: string) {
    await desktopOrPrototype("delete_website", { websiteId }, async () =>
      (await browserPrototype()).deleteWebsite(websiteId),
    )
  },

  listAccounts(websiteId: string) {
    return desktopOrPrototype<AccountSummary[]>(
      "list_accounts",
      { websiteId },
      async () => (await browserPrototype()).listAccounts(websiteId),
    )
  },

  getAccount(accountId: string) {
    return desktopOrPrototype<AccountDetail>(
      "get_account",
      { accountId },
      async () => (await browserPrototype()).getAccount(accountId),
    )
  },

  saveAccount(draft: AccountDraft) {
    return desktopOrPrototype<AccountDetail>(
      "save_account",
      { draft },
      async () => (await browserPrototype()).saveAccount(draft),
    )
  },

  async deleteAccount(accountId: string) {
    await desktopOrPrototype("delete_account", { accountId }, async () =>
      (await browserPrototype()).deleteAccount(accountId),
    )
  },

  generatePassword(options: PasswordGeneratorOptions) {
    return desktopOrPrototype<string>(
      "generate_password",
      { options },
      async () => (await browserPrototype()).generatePassword(options),
    )
  },

  search(query: string) {
    return desktopOrPrototype<SearchResult[]>(
      "search_vault",
      { query },
      async () => (await browserPrototype()).search(query),
    )
  },

  listTrash() {
    return desktopOrPrototype<TrashItem[]>("list_trash", undefined, async () =>
      (await browserPrototype()).listTrash(),
    )
  },

  async restore(groupId: string) {
    await desktopOrPrototype("restore_deletion_group", { groupId }, async () =>
      (await browserPrototype()).restore(groupId),
    )
  },

  async restoreMany(groupIds: string[]) {
    await desktopOrPrototype(
      "restore_deletion_groups",
      { groupIds },
      async () => (await browserPrototype()).restoreMany(groupIds),
    )
  },

  permanentlyDelete(groupIds: string[]) {
    return desktopOrPrototype<{ affectedGroups: number }>(
      "permanently_delete_groups",
      { groupIds },
      async () => (await browserPrototype()).permanentlyDelete(groupIds),
    )
  },

  revealField(fieldId: string) {
    return desktopOrPrototype<string>("reveal_field", { fieldId }, async () =>
      (await browserPrototype()).revealField(fieldId),
    )
  },

  async copyField(fieldId: string) {
    await desktopOrPrototype("copy_field", { fieldId }, async () =>
      (await browserPrototype()).copyField(fieldId),
    )
  },

  async copyUrl(websiteId: string) {
    await desktopOrPrototype("copy_website_url", { websiteId }, async () =>
      (await browserPrototype()).copyWebsiteUrl(websiteId),
    )
  },

  async openWebsite(websiteId: string) {
    const url = await desktopOrPrototype<string>(
      "get_website_url",
      { websiteId },
      async () => (await browserPrototype()).getWebsiteUrl(websiteId),
    )
    if (isTauriRuntime()) await openUrl(url)
    else window.open(url, "_blank", "noopener,noreferrer")
  },

  getAppSettings() {
    return desktopOrPrototype<AppSettings>(
      "get_app_settings",
      undefined,
      async () => (await browserPrototype()).getAppSettings(),
    )
  },

  updateAppSettings(settings: AppSettings) {
    return desktopOrPrototype<AppSettings>(
      "update_app_settings",
      { settings },
      async () => (await browserPrototype()).updateAppSettings(settings),
    )
  },

  listBackups() {
    return desktopOrPrototype<BackupInfo[]>(
      "list_backups",
      undefined,
      async () => (await browserPrototype()).listBackups(),
    )
  },

  createBackup() {
    return desktopOrPrototype<BackupInfo>(
      "create_backup",
      undefined,
      async () => (await browserPrototype()).createBackup(),
    )
  },

  verifyBackup(backupId: string) {
    return desktopOrPrototype<BackupInfo>(
      "verify_backup",
      { backupId },
      async () => (await browserPrototype()).verifyBackup(backupId),
    )
  },

  async restoreBackup(backupId: string) {
    await desktopOrPrototype("restore_backup", { backupId }, async () =>
      (await browserPrototype()).restoreBackup(backupId),
    )
  },
}
