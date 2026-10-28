@echo off
setlocal enabledelayedexpansion

if "%1"=="" goto run_menu
if "%1"=="menu" goto run_menu

echo ===================================================
echo   0xSoundPlayer Windows Build System (Direct Mode)
echo ===================================================

echo [1/3] Running Go backend tests...
go test ./...
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Backend tests failed! Aborting build.
    exit /b %ERRORLEVEL%
)
echo [SUCCESS] Backend tests passed.

echo.
echo [2/3] Running frontend tests and validation...
cd frontend
call npm run test
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend tests failed! Aborting build.
    cd ..
    exit /b %ERRORLEVEL%
)
cd ..
echo [SUCCESS] Frontend tests passed.

echo.
echo [3/3] Compiling standalone application via Wails...
wails build -platform windows/amd64 -clean
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Wails compilation failed!
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo   BUILD SUCCESSFUL!
echo   Executable generated at: build\bin\soundplayer.exe
echo ===================================================
pause
exit /b 0

:run_menu
node scripts\build-menu.js
exit /b %ERRORLEVEL%
