@echo off
setlocal
call "%~dp0setup-rust-env.cmd"
if errorlevel 1 exit /b %errorlevel%
cargo.exe check --manifest-path src-tauri\Cargo.toml
