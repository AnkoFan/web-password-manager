const WINDOWS_LIFECYCLE_REASONS = new Set([
  "windows_session_lock",
  "windows_session_logoff",
  "windows_session_disconnect",
  "windows_suspend",
  "windows_resume",
])

export function lockNoticeForReason(reason: string) {
  if (reason === "idle_timeout") {
    return "因长时间无操作，保险库已自动锁定。"
  }
  if (reason === "focus_lost") {
    return "因切换窗口，保险库已自动锁定。"
  }
  if (WINDOWS_LIFECYCLE_REASONS.has(reason)) {
    return "因 Windows 锁屏、会话切换或电源状态变化，保险库已自动锁定。"
  }
  if (reason === "backup_created") {
    return "加密备份已创建，保险库已安全锁定。"
  }
  if (reason === "backup_failed") {
    return "备份未完成，保险库仍已安全锁定。"
  }
  return "保险库已安全锁定。"
}
