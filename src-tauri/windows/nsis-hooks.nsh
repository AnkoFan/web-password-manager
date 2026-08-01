!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\web-password-manager.exe" 0 m3_preinstall_ready

  ClearErrors
  FileOpen $9 "$INSTDIR\web-password-manager.exe" a
  IfErrors m3_preinstall_locked
  FileClose $9
  Goto m3_preinstall_ready

m3_preinstall_locked:
  IfSilent m3_preinstall_abort
  MessageBox MB_OK|MB_ICONSTOP "WebPasswordManager is running or its program file is locked. Close the app and try again."

m3_preinstall_abort:
  SetErrorLevel 32
  Quit

m3_preinstall_ready:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ClearErrors
  ${GetOptions} $CMDLINE "/DELETEAPPDATA" $8
  ${IfNot} ${Errors}
    StrCpy $DeleteAppDataCheckboxState 1
  ${EndIf}
!macroend
