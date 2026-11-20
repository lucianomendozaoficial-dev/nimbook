@echo off
title NimbookGR - modo local
cd /d "%~dp0"

set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE (
  echo.
  echo   Para probar NimbookGR en tu PC hace falta Node.js.
  echo   Descargalo gratis en https://nodejs.org  ^(version LTS^)
  echo   y volve a abrir este archivo.
  echo.
  echo   Tambien podes usar la version publicada en internet.
  echo.
  pause
  exit /b 1
)

echo.
echo   Iniciando NimbookGR en modo local...
echo   Los datos de prueba se guardan en tu PC, nadie mas los ve.
echo.

"%NODE%" "tools\mock-server.mjs" --port 4173 --open

echo.
echo   El servidor se detuvo.
pause
