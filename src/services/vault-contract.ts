export type Category = {
  id: string
  name: string
  sortOrder: number
}

export type Website = {
  id: string
  categoryId: string
  name: string
  primaryUrl: string | null
  sortOrder: number
}

export type WebsiteDraft = {
  id?: string
  categoryId: string
  name: string
  primaryUrl?: string | null
}

export type FieldType = "text" | "password" | "email" | "url" | "multiline"
export type SystemRole = "username" | "password" | "email" | "note"

export type AccountSummary = {
  id: string
  websiteId: string
  displayName: string
  summary: string | null
  sortOrder: number
}

export type AccountField = {
  id: string
  systemRole: SystemRole | null
  label: string
  fieldType: FieldType
  value: string | null
  isSensitive: boolean
  sortOrder: number
}

export type AccountDetail = {
  id: string
  websiteId: string
  displayName: string
  fields: AccountField[]
}

export type AccountFieldDraft = {
  id?: string
  systemRole?: SystemRole | null
  label: string
  fieldType: FieldType
  value?: string | null
  keepExistingValue?: boolean
  isSensitive: boolean
}

export type AccountDraft = {
  id?: string
  websiteId: string
  displayName: string
  fields: AccountFieldDraft[]
}

export type SearchResult = {
  kind: "website" | "account"
  id: string
  title: string
  subtitle: string
  categoryId: string
  websiteId: string
  accountId: string | null
}

export type TrashItem = {
  groupId: string
  entityType: "category" | "website" | "account"
  entityName: string
  deletedAt: number
}

export type SecuritySettings = {
  autoLockMinutes: number
  clipboardClearSeconds: number
  lockOnFocusLoss: boolean
}

export type BackupInfo = {
  id: string
  createdAt: number
  schemaVersion: number
}

export class VaultClientError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "VaultClientError"
    this.code = code
  }
}
