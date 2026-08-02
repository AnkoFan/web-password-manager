type NamedVaultItem = {
  id: string
  name: string
}

export function vaultTextKey(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase()
}

export function compareVaultNames(left: NamedVaultItem, right: NamedVaultItem) {
  const leftKey = vaultTextKey(left.name)
  const rightKey = vaultTextKey(right.name)
  if (leftKey < rightKey) return -1
  if (leftKey > rightKey) return 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function sortVaultNames<T extends NamedVaultItem>(items: readonly T[]) {
  return [...items].sort(compareVaultNames)
}
