@echo off

where cargo.exe >nul 2>nul
if errorlevel 1 (
  echo Missing cargo.exe in PATH.
  exit /b 1
)

where perl.exe >nul 2>nul
if errorlevel 1 (
  echo Missing perl.exe in PATH. SQLCipher/OpenSSL builds require Perl.
  exit /b 1
)

where cl.exe >nul 2>nul
if not errorlevel 1 exit /b 0

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo Missing Visual Studio Build Tools and vswhere.exe.
  exit /b 1
)

set "VS_INSTALL="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALL=%%i"
if not defined VS_INSTALL (
  echo Visual Studio C++ build tools were not found.
  exit /b 1
)

call "%VS_INSTALL%\VC\Auxiliary\Build\vcvars64.bat" >nul
exit /b %errorlevel%
