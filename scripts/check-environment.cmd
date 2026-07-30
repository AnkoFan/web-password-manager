@echo off
setlocal

echo [Node.js]
call node --version || exit /b 1
call npm.cmd --version || exit /b 1

echo.
echo [Native build tools]
call "%~dp0setup-rust-env.cmd" || exit /b 1
cargo.exe --version || exit /b 1
rustc.exe --version || exit /b 1
perl.exe -e "print qq(perl $^V\n)" || exit /b 1
where cl.exe || exit /b 1

echo.
echo Environment check passed.
