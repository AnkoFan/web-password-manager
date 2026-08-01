export function shouldFocusGlobalSearch(event: KeyboardEvent, modalOpen: boolean) {
  return (
    !event.defaultPrevented &&
    !modalOpen &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "k"
  )
}
