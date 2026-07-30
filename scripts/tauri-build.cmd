@echo off
setlocal
call "%~dp0setup-rust-env.cmd"
if errorlevel 1 exit /b %errorlevel%
call npm.cmd run tauri build
exit /b %errorlevel%
