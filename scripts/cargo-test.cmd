@echo off
setlocal
call "%~dp0setup-rust-env.cmd"
if errorlevel 1 exit /b %errorlevel%
cargo.exe fmt --manifest-path src-tauri\Cargo.toml -- --check
if errorlevel 1 exit /b %errorlevel%
cargo.exe test --manifest-path src-tauri\Cargo.toml
