@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal

rem Locate node.exe: PATH first, then the usual install locations.
set "NODE="
where node >nul 2>nul && set "NODE=node"
if defined NODE goto found
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if defined NODE goto found
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if defined NODE goto found
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined NODE goto found

echo.
echo [!] Node.js not found
echo     https://nodejs.org/   LTS
echo.
pause
exit /b 1

:found
echo.
echo ====================================================
echo  KT89S51
echo ====================================================
echo.
"%NODE%" tools\build-single.mjs
if errorlevel 1 goto failed

echo.
echo OK  ^>  dist\
echo.
start "" "%~dp0dist"
pause
exit /b 0

:failed
echo.
echo [!] build failed
echo.
pause
exit /b 1
