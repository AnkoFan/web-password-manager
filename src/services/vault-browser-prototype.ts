import {
  VaultClientError,
  type AccountDetail,
  type AccountDraft,
  type AccountField,
  type AccountSummary,
  type AppSettings,
  type BackupInfo,
  type Category,
  type SearchResult,
  type TrashItem,
  type Website,
  type WebsiteDraft,
} from "./vault-contract"
import { sortVaultNames } from "./vault-order"

type StoredField = Omit<AccountField, "value"> & { value: string }
type StoredAccount = Omit<AccountSummary, "summary"> & {
  fields: StoredField[]
  deletedGroupId?: string
}
type StoredWebsite = Website & { deletedGroupId?: string }
type StoredCategory = Category & { deletedGroupId?: string }

let categories: StoredCategory[] = []
let websites: StoredWebsite[] = []
let accounts: StoredAccount[] = []
let trash: TrashItem[] = []
let settings: AppSettings = {
  clipboardClearSeconds: 30,
}

type PrototypeBackup = {
  info: BackupInfo
  categories: StoredCategory[]
  websites: StoredWebsite[]
  accounts: StoredAccount[]
  trash: TrashItem[]
}

let backups: PrototypeBackup[] = []

function id() {
  return crypto.randomUUID()
}

function key(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase()
}

function requiredName(value: string, max: number) {
  const display = value.trim()
  if (!display) throw new VaultClientError("invalid_input", "名称不能为空")
  if ([...display].length > max) {
    throw new VaultClientError("invalid_input", `名称不能超过 ${max} 个字符`)
  }
  if ([...display].some((character) => /\p{Cc}/u.test(character))) {
    throw new VaultClientError("invalid_input", "名称不能包含控制字符")
  }
  return display
}

function activeCategory(categoryId: string) {
  return categories.find((category) => category.id === categoryId && !category.deletedGroupId)
}

function activeWebsite(websiteId: string) {
  const website = websites.find((entry) => entry.id === websiteId && !entry.deletedGroupId)
  return website && activeCategory(website.categoryId) ? website : undefined
}

function activeAccount(accountId: string) {
  const account = accounts.find((entry) => entry.id === accountId && !entry.deletedGroupId)
  return account && activeWebsite(account.websiteId) ? account : undefined
}

function accountDetail(account: StoredAccount): AccountDetail {
  return {
    id: account.id,
    websiteId: account.websiteId,
    displayName: account.displayName,
    fields: account.fields.map((field) => ({
      ...field,
      value: field.isSensitive ? null : field.value,
    })),
  }
}

export function status() {
  return { exists: true }
}

export function listCategories(): Category[] {
  return sortVaultNames(categories.filter((category) => !category.deletedGroupId))
}

export function createCategory(name: string): Category {
  const display = requiredName(name, 100)
  if (categories.some((category) => !category.deletedGroupId && key(category.name) === key(display))) {
    throw new VaultClientError("category_already_exists", "该分类名称已经存在")
  }
  const category = { id: id(), name: display, sortOrder: categories.length }
  categories.push(category)
  return category
}

export function renameCategory(categoryId: string, name: string) {
  const category = activeCategory(categoryId)
  if (!category) throw new VaultClientError("category_not_found", "分类不存在")
  const display = requiredName(name, 100)
  if (
    categories.some(
      (entry) =>
        entry.id !== categoryId && !entry.deletedGroupId && key(entry.name) === key(display),
    )
  ) {
    throw new VaultClientError("category_already_exists", "该分类名称已经存在")
  }
  category.name = display
}

export function deleteCategory(categoryId: string) {
  const category = activeCategory(categoryId)
  if (!category) throw new VaultClientError("category_not_found", "分类不存在")
  const groupId = id()
  category.deletedGroupId = groupId
  for (const website of websites) {
    if (website.categoryId === categoryId && !website.deletedGroupId) {
      website.deletedGroupId = groupId
      for (const account of accounts) {
        if (account.websiteId === website.id && !account.deletedGroupId) {
          account.deletedGroupId = groupId
        }
      }
    }
  }
  trash.unshift({
    groupId,
    entityType: "category",
    entityName: category.name,
    deletedAt: Date.now(),
  })
}

export function listWebsites(categoryId?: string): Website[] {
  return sortVaultNames(
    websites.filter(
      (website) =>
        !website.deletedGroupId &&
        activeCategory(website.categoryId) &&
        (!categoryId || website.categoryId === categoryId),
    ),
  )
}

export function saveWebsite(draft: WebsiteDraft): Website {
  if (!activeCategory(draft.categoryId)) {
    throw new VaultClientError("category_not_found", "分类不存在")
  }
  const name = requiredName(draft.name, 200)
  const primaryUrl = draft.primaryUrl?.trim() || null
  if (primaryUrl) validateUrl(primaryUrl)
  if (draft.id) {
    const website = activeWebsite(draft.id)
    if (!website) throw new VaultClientError("website_not_found", "网站不存在")
    Object.assign(website, { categoryId: draft.categoryId, name, primaryUrl })
    return website
  }
  const website: StoredWebsite = {
    id: id(),
    categoryId: draft.categoryId,
    name,
    primaryUrl,
    sortOrder: websites.filter((entry) => entry.categoryId === draft.categoryId).length,
  }
  websites.push(website)
  return website
}

export function deleteWebsite(websiteId: string) {
  const website = activeWebsite(websiteId)
  if (!website) throw new VaultClientError("website_not_found", "网站不存在")
  const groupId = id()
  website.deletedGroupId = groupId
  for (const account of accounts) {
    if (account.websiteId === websiteId && !account.deletedGroupId) {
      account.deletedGroupId = groupId
    }
  }
  trash.unshift({
    groupId,
    entityType: "website",
    entityName: website.name,
    deletedAt: Date.now(),
  })
}

export function listAccounts(websiteId: string): AccountSummary[] {
  if (!activeWebsite(websiteId)) return []
  return sortVaultNames(
    accounts
      .filter((account) => account.websiteId === websiteId && !account.deletedGroupId)
      .map((account) => ({ ...account, name: account.displayName })),
  )
    .map((account) => ({
      id: account.id,
      websiteId: account.websiteId,
      displayName: account.displayName,
      summary:
        account.fields.find(
          (field) =>
            !field.isSensitive &&
            (field.systemRole === "username" || field.systemRole === "email"),
        )?.value ?? null,
      sortOrder: account.sortOrder,
    }))
}

export function getAccount(accountId: string): AccountDetail {
  const account = activeAccount(accountId)
  if (!account) throw new VaultClientError("account_not_found", "账号不存在")
  return accountDetail(account)
}

export function saveAccount(draft: AccountDraft): AccountDetail {
  if (!activeWebsite(draft.websiteId)) {
    throw new VaultClientError("website_not_found", "网站不存在")
  }
  const displayName = requiredName(draft.displayName, 200)
  if (
    accounts.some(
      (account) =>
        account.id !== draft.id &&
        account.websiteId === draft.websiteId &&
        !account.deletedGroupId &&
        key(account.displayName) === key(displayName),
    )
  ) {
    throw new VaultClientError("account_already_exists", "该账号名称已经存在")
  }
  const current = draft.id ? activeAccount(draft.id) : undefined
  if (draft.id && !current) throw new VaultClientError("account_not_found", "账号不存在")

  const labelKeys = new Set<string>()
  const roles = new Set<string>()
  const fields: StoredField[] = draft.fields.map((field, index) => {
    const label = requiredName(field.label, 100)
    const labelKey = key(label)
    if (labelKeys.has(labelKey)) {
      throw new VaultClientError("invalid_input", "同一账号内不能有重复字段名称")
    }
    labelKeys.add(labelKey)
    if (field.systemRole) {
      if (roles.has(field.systemRole)) {
        throw new VaultClientError("invalid_input", "同一账号内不能有重复系统字段")
      }
      roles.add(field.systemRole)
    }
    if (
      (field.fieldType === "password" || field.systemRole === "password") &&
      !field.isSensitive
    ) {
      throw new VaultClientError("invalid_input", "密码字段必须标记为敏感")
    }
    const previous = field.id ? current?.fields.find((entry) => entry.id === field.id) : undefined
    const value = field.keepExistingValue ? previous?.value : field.value
    if (value == null) throw new VaultClientError("invalid_input", "字段值状态无效")
    return {
      id: field.id ?? id(),
      systemRole: field.systemRole ?? null,
      label,
      fieldType: field.fieldType,
      value,
      isSensitive: field.isSensitive,
      sortOrder: index,
    }
  })

  if (current) {
    current.websiteId = draft.websiteId
    current.displayName = displayName
    current.fields = fields
    return accountDetail(current)
  }
  const account: StoredAccount = {
    id: id(),
    websiteId: draft.websiteId,
    displayName,
    sortOrder: accounts.filter((entry) => entry.websiteId === draft.websiteId).length,
    fields,
  }
  accounts.push(account)
  return accountDetail(account)
}

export function deleteAccount(accountId: string) {
  const account = activeAccount(accountId)
  if (!account) throw new VaultClientError("account_not_found", "账号不存在")
  const groupId = id()
  account.deletedGroupId = groupId
  trash.unshift({
    groupId,
    entityType: "account",
    entityName: account.displayName,
    deletedAt: Date.now(),
  })
}

export function search(query: string): SearchResult[] {
  const queryKey = key(query)
  if (!queryKey) return []
  const results: SearchResult[] = []
  for (const website of listWebsites()) {
    if (key(website.name).includes(queryKey)) {
      results.push({
        kind: "website",
        id: website.id,
        title: website.name,
        subtitle:
          categories.find((category) => category.id === website.categoryId)?.name ?? "",
        categoryId: website.categoryId,
        websiteId: website.id,
        accountId: null,
      })
    }
  }
  for (const account of accounts.filter((entry) => activeAccount(entry.id))) {
    const website = activeWebsite(account.websiteId)
    if (!website) continue
    const safeMatch = account.fields.some(
      (field) =>
        !field.isSensitive &&
        (field.systemRole === "username" || field.systemRole === "email") &&
        key(field.value).includes(queryKey),
    )
    if (key(account.displayName).includes(queryKey) || safeMatch) {
      results.push({
        kind: "account",
        id: account.id,
        title: account.displayName,
        subtitle: website.name,
        categoryId: website.categoryId,
        websiteId: website.id,
        accountId: account.id,
      })
    }
  }
  return results
}

export function listTrash(): TrashItem[] {
  return trash
}

export function restore(groupId: string) {
  const item = trash.find((entry) => entry.groupId === groupId)
  if (!item) throw new VaultClientError("deletion_group_not_found", "删除记录不存在")
  for (const category of categories) {
    if (category.deletedGroupId === groupId) delete category.deletedGroupId
  }
  for (const website of websites) {
    if (website.deletedGroupId === groupId) delete website.deletedGroupId
  }
  for (const account of accounts) {
    if (account.deletedGroupId === groupId) delete account.deletedGroupId
  }
  trash = trash.filter((entry) => entry.groupId !== groupId)
}

export function revealField(fieldId: string) {
  for (const account of accounts.filter((entry) => activeAccount(entry.id))) {
    const field = account.fields.find((entry) => entry.id === fieldId)
    if (field) return field.value
  }
  throw new VaultClientError("field_not_found", "字段不存在")
}

export async function copyField(fieldId: string) {
  await writeClipboard(revealField(fieldId))
}

export function getWebsiteUrl(websiteId: string) {
  const website = activeWebsite(websiteId)
  if (!website) throw new VaultClientError("website_not_found", "网站不存在")
  if (!website.primaryUrl) throw new VaultClientError("invalid_input", "网站没有可打开的网址")
  validateUrl(website.primaryUrl)
  return website.primaryUrl
}

export async function copyWebsiteUrl(websiteId: string) {
  await writeClipboard(getWebsiteUrl(websiteId))
}

async function writeClipboard(value: string) {
  await navigator.clipboard.writeText(value)
  window.setTimeout(async () => {
    try {
      if (
        typeof navigator.clipboard.readText === "function" &&
        (await navigator.clipboard.readText()) === value
      ) {
        await navigator.clipboard.writeText("")
      }
    } catch {
      // Browser development mode cannot guarantee clipboard read permission.
    }
  }, settings.clipboardClearSeconds * 1000)
}

export function getAppSettings() {
  return { ...settings }
}

export function updateAppSettings(next: AppSettings) {
  if (
    !Number.isInteger(next.clipboardClearSeconds) ||
    next.clipboardClearSeconds < 5 ||
    next.clipboardClearSeconds > 300
  ) {
    throw new VaultClientError("invalid_app_settings", "应用设置超出允许范围")
  }
  settings = { ...next }
  return getAppSettings()
}

export function listBackups(): BackupInfo[] {
  return backups.map(({ info }) => ({ ...info }))
}

export function createBackup(): BackupInfo {
  const info = { id: id(), createdAt: Date.now(), schemaVersion: 2 }
  backups.unshift({
    info,
    categories: structuredClone(categories),
    websites: structuredClone(websites),
    accounts: structuredClone(accounts),
    trash: structuredClone(trash),
  })
  return info
}

export function verifyBackup(backupId: string): BackupInfo {
  const backup = backups.find((entry) => entry.info.id === backupId)
  if (!backup) {
    throw new VaultClientError("backup_verify_failed", "无法验证备份，备份已损坏")
  }
  return { ...backup.info }
}

export function restoreBackup(backupId: string) {
  const backup = backups.find((entry) => entry.info.id === backupId)
  verifyBackup(backupId)
  if (!backup) return
  categories = structuredClone(backup.categories)
  websites = structuredClone(backup.websites)
  accounts = structuredClone(backup.accounts)
  trash = structuredClone(backup.trash)
}

function validateUrl(value: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new VaultClientError("invalid_input", "网址必须是完整的绝对地址")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new VaultClientError("invalid_input", "只允许 http 或 https 网址")
  }
}
