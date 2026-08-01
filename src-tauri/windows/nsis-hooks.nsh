!macro NSIS_HOOK_PREINSTALL
  ; Tauri runs CheckIfAppIsRunning immediately after this hook. Keep the hook
  ; non-blocking so the built-in flow can offer to close the current user's
  ; running app and continue the upgrade instead of failing on the locked exe.
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ClearErrors
  ${GetOptions} $CMDLINE "/DELETEAPPDATA" $8
  ${IfNot} ${Errors}
    StrCpy $DeleteAppDataCheckboxState 1
  ${EndIf}
!macroend
